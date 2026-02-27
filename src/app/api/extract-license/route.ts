import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const PROMPT = `You are analyzing a photo for a car dealership lead system. Your job is to:
1. Determine if this image contains a driver's license or state ID
2. Extract all readable fields
3. Determine if the ID is a novelty, prop, or fake item

Return ONLY a valid JSON object with no other text:
{
  "isValid": true or false,
  "name": "Full Name" or null,
  "dateOfBirth": "MM/DD/YYYY" or null,
  "address": "Full address as shown on ID" or null,
  "idNumber": "License/ID number" or null,
  "expirationDate": "MM/DD/YYYY" or null,
  "state": "XX" (two-letter state code) or null,
  "isSuspicious": true or false,
  "suspiciousReason": "explanation" or null,
  "errorType": null or one of "not_license", "blurry", "cut_off", "unreadable",
  "errorMessage": null or "brief description of the issue"
}

RULES FOR isValid:
- TRUE if the image contains ANY driver's license or state ID and you can read text on it
- FALSE only if: not an ID at all (errorType: "not_license"), or too blurry/dark/cut off to read
- Be lenient on photo quality — if you can read the name and most fields, it is valid
- An ID being expired, under-21, provisional, or restricted does NOT make it invalid

RULES FOR isSuspicious (CRITICAL — read carefully):
- TRUE only for obvious novelty/prop/fake IDs: movie props (e.g. "McLovin" from Superbad), joke IDs, items explicitly labeled "novelty" or "souvenir", obviously fabricated documents
- FALSE for ALL real government-issued IDs, regardless of:
  - "NOT FOR REAL ID PURPOSES" (standard federal REAL ID Act marking on millions of real licenses)
  - "FEDERAL LIMITS APPLY" (standard compliance marking)
  - "UNDER 21 UNTIL [date]" (standard youth license marking)
  - "TEMPORARY", "DUPLICATE", "PROVISIONAL", "RESTRICTED" (all standard markings)
  - Expired dates (an expired license is still a real license)
  - Wear, creases, lamination damage, or aging
  - Any standard state-issued formatting or markings
- When in doubt, set isSuspicious to FALSE. Real licenses vastly outnumber fakes in this system.

EXTRACTION: Extract every field you can read. Only leave a field as null if truly not visible.`;

// Valid US state/territory codes for programmatic validation
const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
  "DC","PR","GU","VI","AS","MP",
]);

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

    // Try Opus first (best reasoning for fake detection), fall back to Sonnet
    let response;
    try {
      response = await anthropic.messages.create({
        model: "claude-opus-4-6",
        ...messageParams,
      });
    } catch (opusError) {
      console.warn("Opus failed, falling back to Sonnet:", opusError);
      response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
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

    // --- Programmatic fake detection safety net ---
    let isSuspicious = !!parsed.isSuspicious;
    let suspiciousReason: string | null = parsed.suspiciousReason || null;

    // Check for single-word names (McLovin pattern)
    if (parsed.name && parsed.isValid) {
      const nameParts = parsed.name.trim().split(/\s+/);
      if (nameParts.length === 1 && nameParts[0].length > 0) {
        isSuspicious = true;
        suspiciousReason = suspiciousReason || "Single-word name detected — real IDs have first and last names";
      }
    }

    // Check for invalid state code
    if (parsed.state && !US_STATES.has(parsed.state.toUpperCase())) {
      isSuspicious = true;
      suspiciousReason = suspiciousReason || `"${parsed.state}" is not a valid US state code`;
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
        isSuspicious,
        suspiciousReason,
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
