import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// US State codes for validation
const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"
];

// Plate verification result
export interface PlateVerificationResult {
  success: boolean;
  extractedPlate: {
    plateNumber: string;
    state?: string;
    confidence: number;
  } | null;
  matchesManualEntry: boolean;
  mismatchDetails?: string;
  vehicle: {
    verified: boolean;
    make?: string;
    model?: string;
    year?: number;
    color?: string;
    type?: string;
  } | null;
  error?: string;
}

// Extract plate from image using Claude Vision
async function extractPlateWithVision(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"
): Promise<{ plateNumber: string; state?: string; confidence: number } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: `Extract the license plate number from this image.

Return ONLY a JSON object with these fields:
{
  "plateNumber": "THE PLATE NUMBER (letters and numbers only, no spaces or dashes)",
  "state": "TWO LETTER STATE CODE if visible (e.g., CA, TX, NY)",
  "confidence": "high" | "medium" | "low"
}

If you cannot read the plate clearly, still try your best guess and mark confidence as "low".
If no plate is visible, return: { "plateNumber": "", "state": null, "confidence": "low" }

Return ONLY the JSON, no other text.`,
          },
        ],
      },
    ],
  });

  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    return null;
  }

  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = textContent.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    }

    const parsed = JSON.parse(jsonStr);
    return {
      plateNumber: (parsed.plateNumber || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
      state: parsed.state?.toUpperCase(),
      confidence: parsed.confidence === "high" ? 1 : parsed.confidence === "medium" ? 0.7 : 0.4,
    };
  } catch {
    console.error("[VERIFY-PLATE] Failed to parse Claude response:", textContent.text);
    return null;
  }
}

// Call Plate Recognizer API for vehicle lookup
async function lookupVehicle(
  imageBase64: string
): Promise<{ make?: string; model?: string; year?: number; color?: string; type?: string } | null> {
  const apiKey = process.env.PLATE_RECOGNIZER_API_KEY;

  if (!apiKey) {
    console.log("[VERIFY-PLATE] PLATE_RECOGNIZER_API_KEY not configured, skipping vehicle lookup");
    return null;
  }

  try {
    // Convert base64 to blob for form data
    const response = await fetch("https://api.platerecognizer.com/v1/plate-reader/", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
      },
      body: (() => {
        const formData = new FormData();
        // Remove data URL prefix if present
        const base64Only = imageBase64.includes("base64,")
          ? imageBase64.split("base64,")[1]
          : imageBase64;

        // Convert base64 to blob
        const binaryStr = atob(base64Only);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: "image/jpeg" });
        formData.append("upload", blob, "plate.jpg");
        formData.append("regions", "us"); // Optimize for US plates
        return formData;
      })(),
    });

    if (!response.ok) {
      console.error("[VERIFY-PLATE] Plate Recognizer API error:", response.status);
      return null;
    }

    const data = await response.json();

    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      const vehicle = result.vehicle || {};

      return {
        make: vehicle.make?.[0]?.name,
        model: vehicle.model?.[0]?.name,
        year: vehicle.year?.[0]?.name ? parseInt(vehicle.year[0].name) : undefined,
        color: vehicle.color?.[0]?.name,
        type: vehicle.type?.[0]?.name,
      };
    }

    return null;
  } catch (error) {
    console.error("[VERIFY-PLATE] Plate Recognizer API exception:", error);
    return null;
  }
}

// Normalize plate number for comparison
function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const { plateImage, plateNumber, plateState } = await request.json();

    // Validate inputs
    if (!plateImage) {
      return NextResponse.json(
        { success: false, error: "Plate image is required" },
        { status: 400 }
      );
    }

    if (!plateNumber) {
      return NextResponse.json(
        { success: false, error: "Plate number is required" },
        { status: 400 }
      );
    }

    if (!plateState || !US_STATES.includes(plateState.toUpperCase())) {
      return NextResponse.json(
        { success: false, error: "Valid US state code is required" },
        { status: 400 }
      );
    }

    // Extract base64 data from data URL if present
    const base64Data = plateImage.includes("base64,")
      ? plateImage.split("base64,")[1]
      : plateImage;

    // Determine media type
    let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
    if (plateImage.includes("data:image/png")) {
      mediaType = "image/png";
    } else if (plateImage.includes("data:image/gif")) {
      mediaType = "image/gif";
    } else if (plateImage.includes("data:image/webp")) {
      mediaType = "image/webp";
    }

    console.log("[VERIFY-PLATE] Starting verification for plate:", plateNumber, plateState);

    // Step 1: Extract plate from image using Claude Vision
    const extractedPlate = await extractPlateWithVision(base64Data, mediaType);

    if (!extractedPlate || !extractedPlate.plateNumber) {
      console.log("[VERIFY-PLATE] Could not extract plate from image");
      return NextResponse.json({
        success: false,
        extractedPlate: null,
        matchesManualEntry: false,
        mismatchDetails: "Could not read license plate from image. Please take a clearer photo.",
        vehicle: null,
      } as PlateVerificationResult);
    }

    console.log("[VERIFY-PLATE] Extracted plate:", extractedPlate);

    // Step 2: Compare extracted plate with manual entry
    const normalizedExtracted = normalizePlate(extractedPlate.plateNumber);
    const normalizedManual = normalizePlate(plateNumber);
    const matchesManualEntry = normalizedExtracted === normalizedManual;

    let mismatchDetails: string | undefined;
    if (!matchesManualEntry) {
      mismatchDetails = `Photo shows "${extractedPlate.plateNumber}" but you entered "${plateNumber.toUpperCase()}"`;
    }

    // Step 3: Lookup vehicle info via Plate Recognizer
    const vehicleInfo = await lookupVehicle(plateImage);

    console.log("[VERIFY-PLATE] Vehicle lookup result:", vehicleInfo);

    // Build response
    const result: PlateVerificationResult = {
      success: true,
      extractedPlate: {
        plateNumber: extractedPlate.plateNumber,
        state: extractedPlate.state,
        confidence: extractedPlate.confidence,
      },
      matchesManualEntry,
      mismatchDetails,
      vehicle: vehicleInfo
        ? {
            verified: true,
            make: vehicleInfo.make,
            model: vehicleInfo.model,
            year: vehicleInfo.year,
            color: vehicleInfo.color,
            type: vehicleInfo.type,
          }
        : {
            verified: false,
          },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("[VERIFY-PLATE] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to verify plate",
      } as PlateVerificationResult,
      { status: 500 }
    );
  }
}
