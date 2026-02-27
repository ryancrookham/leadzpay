import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const PROMPT = `You are a data extraction tool. Your only job is to read a driver's license or state ID image and extract the following fields: full name, date of birth, address, license number, expiration date, and issuing state.

Do not evaluate whether the ID appears real or fake. Do not flag handwriting, stickers, damage, or unusual markings. Simply extract the data you can read.

Return ONLY a valid JSON object with no other text:
{
  "isValid": true or false,
  "name": "Full Name" or null,
  "dateOfBirth": "MM/DD/YYYY" or null,
  "address": "Full address as shown on ID" or null,
  "idNumber": "License/ID number" or null,
  "expirationDate": "MM/DD/YYYY" or null,
  "state": "XX" (two-letter state code) or null,
  "errorType": null or "not_id" or "unreadable",
  "errorMessage": null or "brief description"
}

Rules:
- isValid = TRUE if you can read any identifying information from a license or ID in this image.
- isValid = FALSE only if: the image contains no readable ID document whatsoever, or is too blurry/dark to extract any fields.
- For each field, return what you can read. Set to null only if truly not visible.`;

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
      model: "claude-haiku-4-5-20251001",
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
        { error: "We could not read your ID. Please take a clearer photo and try again." },
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
