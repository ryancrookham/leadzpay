import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const PROMPT = `Extract information from this driver's license or state ID photo.

Return ONLY a valid JSON object with no other text:
{
  "isValid": true or false,
  "name": "Full Name" or null,
  "dateOfBirth": "MM/DD/YYYY" or null,
  "address": "Full address as shown on ID" or null,
  "idNumber": "License/ID number" or null,
  "expirationDate": "MM/DD/YYYY" or null,
  "state": "XX" (two-letter state code) or null,
  "errorType": null or one of "not_license", "blurry", "cut_off", "unreadable",
  "errorMessage": null or "brief description of the issue"
}

Rules:
- Set isValid to TRUE if this image contains any government-issued driver's license or state ID and you can read the text on it. Most uploads will be valid.
- Extract every field you can read. Only leave a field as null if truly not visible.
- Set isValid to FALSE only if: it is not an ID/license at all (errorType: "not_license"), or the photo is too blurry/dark/cut off to read (errorType: "blurry", "cut_off", or "unreadable").
- Be lenient on photo quality — if you can read the name and most fields, it is valid.`;

export async function POST(request: NextRequest) {
  try {
    const { licenseImage } = await request.json();

    if (!licenseImage) {
      return NextResponse.json(
        { error: "License image is required" },
        { status: 400 }
      );
    }

    // Reject oversized payloads (compressed images should be well under this)
    if (licenseImage.length > 15_000_000) {
      return NextResponse.json(
        { error: "Image is too large. Please use a smaller or lower-resolution photo." },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "License verification service not configured" },
        { status: 503 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    // Extract base64 data from data URL if present
    const base64Data = licenseImage.includes("base64,")
      ? licenseImage.split("base64,")[1]
      : licenseImage;

    // Determine media type from data URL prefix
    let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" =
      "image/jpeg";
    if (licenseImage.includes("data:image/png")) {
      mediaType = "image/png";
    } else if (licenseImage.includes("data:image/gif")) {
      mediaType = "image/gif";
    } else if (licenseImage.includes("data:image/webp")) {
      mediaType = "image/webp";
    }

    const messageParams = {
      max_tokens: 1024,
      messages: [
        {
          role: "user" as const,
          content: [
            {
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: "text" as const,
              text: PROMPT,
            },
          ],
        },
      ],
    };

    // Try Sonnet first (best accuracy), fall back to Haiku (proven reliable)
    let response;
    try {
      response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        ...messageParams,
      });
    } catch (sonnetError) {
      console.warn("Sonnet failed, falling back to Haiku:", sonnetError);
      response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        ...messageParams,
      });
    }

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response format");
    }

    let parsed;
    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("Failed to parse verification response:", content.text);
      return NextResponse.json(
        { error: "Could not process the license photo. Please try again." },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        isValid: !!parsed.isValid,
        name: parsed.name || null,
        dateOfBirth: parsed.dateOfBirth || null,
        address: parsed.address || null,
        idNumber: parsed.idNumber || null,
        expirationDate: parsed.expirationDate || null,
        state: parsed.state || null,
        errorType: parsed.errorType || null,
        errorMessage: parsed.errorMessage || null,
      },
    });
  } catch (error) {
    console.error("License verification error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `License verification failed: ${message}` },
      { status: 500 }
    );
  }
}
