import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

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

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: "text",
              text: `You are analyzing a photo of a driver's license or state ID for a car dealership lead system. Extract the information from this ID.

Return ONLY a valid JSON object with no other text:
{
  "isValid": true or false,
  "name": "Full Name" or null,
  "dateOfBirth": "MM/DD/YYYY" or null,
  "address": "Full address as shown on ID" or null,
  "idNumber": "License/ID number" or null,
  "expirationDate": "MM/DD/YYYY" or null,
  "state": "XX" (two-letter state code) or null,
  "errorType": null or one of "not_license", "blurry", "cut_off", "screenshot", "unreadable",
  "errorMessage": null or "brief description of the issue",
  "isSuspicious": true or false,
  "suspiciousReason": null or "reason"
}

Rules:
- Set isValid to TRUE if this is a photo of a real government-issued driver's license or state ID and the text is readable. Most uploads will be valid — default to trusting the document.
- Extract ALL fields you can read. Only leave a field as null if it is truly not visible or unreadable.
- Set isValid to FALSE only if: it is not an ID/license at all (errorType: "not_license"), the photo is too blurry to read any text (errorType: "blurry"), the ID is significantly cut off (errorType: "cut_off"), it is a screenshot of an ID rather than a direct photo (errorType: "screenshot"), or the text is completely unreadable (errorType: "unreadable").
- Be LENIENT on photo quality. If you can read the name and most fields, mark it valid even if slightly tilted, slightly dark, or has minor glare.
- Only set isSuspicious to true for OBVIOUS fakes: movie props (e.g. "McLovin" from Superbad), or items explicitly labeled "novelty", "souvenir", or "fake ID".
- These are NORMAL markings found on real US licenses and must NOT be flagged as suspicious: "NOT FOR REAL ID PURPOSES", "FEDERAL LIMITS APPLY", "UNDER 21 UNTIL [date]", "TEMPORARY", "DUPLICATE", "PROVISIONAL", "RESTRICTED". An expired license is still a real license.
- A real ID with an unusual name, worn edges, or older design is still valid.`,
            },
          ],
        },
      ],
    });

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
        isSuspicious: !!parsed.isSuspicious,
        suspiciousReason: parsed.suspiciousReason || null,
      },
    });
  } catch (error) {
    console.error("License verification error:", error);
    return NextResponse.json(
      { error: "Failed to verify license photo. Please try again." },
      { status: 500 }
    );
  }
}
