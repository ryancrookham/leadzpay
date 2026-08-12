import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get("image") as File | null;

    if (!imageFile) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    if (!imageFile.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    if (imageFile.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Image must be under 10MB" }, { status: 400 });
    }

    const bytes = await imageFile.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mediaType = imageFile.type || "image/jpeg";

    if (!ANTHROPIC_API_KEY) {
      // Dev fallback — return a well-known test VIN
      return NextResponse.json({ vin: "1HGBH41JXMN109186" });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              {
                type: "text",
                text: `Extract the 17-character VIN (Vehicle Identification Number) from this image.

Rules:
- VINs are always exactly 17 characters
- Only uppercase A-Z and 0-9 — the letters I, O, and Q are NEVER used in a valid VIN
- Common locations: driver-side door jamb sticker, dashboard visible through windshield, engine bay, insurance card
- If you find MULTIPLE candidate strings, return the one that best matches the 17-character rule

Return ONLY valid JSON in this exact shape:
{ "vin": "17-character-string" }

If you cannot find a valid 17-character VIN, return:
{ "vin": null, "error": "no VIN detected" }

Return ONLY the JSON, no explanation.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic VIN scan error:", errText);
      return NextResponse.json(
        { error: "Could not process the image. Please try again or enter VIN manually." },
        { status: 500 }
      );
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Could not read the VIN. Please enter it manually." },
        { status: 422 }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.vin || parsed.vin === "null") {
      return NextResponse.json(
        { error: parsed.error || "No VIN found in image. Try again or enter manually." },
        { status: 422 }
      );
    }

    // Validate: 17 chars, no I/O/Q
    const vin = String(parsed.vin).toUpperCase().trim();
    if (vin.length !== 17 || /[IOQ]/.test(vin) || !/^[A-Z0-9]+$/.test(vin)) {
      return NextResponse.json(
        { error: `Detected "${vin}" but it isn't a valid VIN. Please verify or enter manually.` },
        { status: 422 }
      );
    }

    return NextResponse.json({ vin });
  } catch (err) {
    console.error("VIN scan error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
