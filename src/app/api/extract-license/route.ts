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

    // Determine media type
    let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
    if (licenseImage.includes("data:image/png")) {
      mediaType = "image/png";
    } else if (licenseImage.includes("data:image/gif")) {
      mediaType = "image/gif";
    } else if (licenseImage.includes("data:image/webp")) {
      mediaType = "image/webp";
    }

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
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
              text: `Analyze this image of a supposed US driver's license. Answer these questions:

1. Is this a photo of a REAL US driver's license? (Not a fake, novelty, movie prop, costume prop, joke ID, or obviously fabricated document. Look for signs like: "McLovin", single-word names, clearly fictional information, "Superbad", novelty watermarks, missing standard license elements)
2. Is the photo clear and readable (not blurry, dark, or overexposed)?
3. Is the license fully visible and reasonably centered (not cut off)?
4. If you can read it, what is the person's full name on the license?
5. What US state issued the license (two-letter code)?
6. Does the license look suspicious? Check for: single-word names, obviously fake DOB (age under 16 or over 100), missing required fields (no DOB, no license number, no expiry), state codes that don't exist, organ donor or other details that look clearly fabricated or inconsistent.

Return ONLY a valid JSON object, no other text:
{
  "isLicense": true or false,
  "isClear": true or false,
  "name": "Full Name" or null,
  "state": "XX" or null,
  "reason": "brief explanation of any issues",
  "isSuspicious": true or false,
  "suspiciousReason": "why this looks fake/suspicious" or null
}

IMPORTANT:
- If the ID is clearly a fake, movie prop, or novelty item, set isLicense to FALSE and isSuspicious to TRUE.
- If the name is a single word (no first+last name), set isSuspicious to TRUE.
- Be lenient on photo quality — if the text is readable at all, mark isClear as true.
- Only mark isClear as false if genuinely too blurry, dark, or cut off to read.`,
            },
          ],
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response format");
    }

    let verificationData;
    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      verificationData = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("Failed to parse verification response:", content.text);
      return NextResponse.json(
        { error: "Could not verify license photo. Please try again." },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        isLicense: !!verificationData.isLicense,
        isClear: !!verificationData.isClear,
        name: verificationData.name || null,
        state: verificationData.state || null,
        reason: verificationData.reason || null,
        isSuspicious: !!verificationData.isSuspicious,
        suspiciousReason: verificationData.suspiciousReason || null,
      },
    });
  } catch (error) {
    console.error("License verification error:", error);
    return NextResponse.json(
      { error: "Failed to verify license photo" },
      { status: 500 }
    );
  }
}
