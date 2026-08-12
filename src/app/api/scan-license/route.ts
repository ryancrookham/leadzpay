import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

// Name suffixes that must never end up in first/middle name fields.
// Compared case-insensitively; trailing period optional.
const SUFFIX_TOKENS = new Set([
  "JR", "SR", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "ESQ", "PHD", "MD", "DDS", "DO", "DVM", "RN",
]);

function isSuffix(token: string): boolean {
  const stripped = token.replace(/\.$/, "").toUpperCase();
  return SUFFIX_TOKENS.has(stripped);
}

/**
 * Given a "given name" string that may contain first + middle(s) + suffix,
 * return the properly split first name and middle name.
 * Suffix tokens are dropped (they don't belong in first or middle fields).
 */
function splitGivenName(combined: string): { firstName: string; middleName: string } {
  const tokens = combined.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { firstName: "", middleName: "" };

  // Strip suffix tokens from the end
  while (tokens.length > 1 && isSuffix(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  if (tokens.length === 1) return { firstName: tokens[0], middleName: "" };

  const firstName = tokens[0];
  const middleName = tokens.slice(1).join(" ");
  return { firstName, middleName };
}

/**
 * Normalize whatever the model returned into clean first/middle/last.
 * Handles: model returned combined name in firstName; suffix leaked into
 * middleName; extra whitespace; casing.
 */
function normalizeName(raw: {
  firstName?: string;
  middleName?: string;
  lastName?: string;
}): { firstName?: string; middleName?: string; lastName?: string } {
  const rawFirst = (raw.firstName || "").trim();
  let rawMiddle = (raw.middleName || "").trim();
  const rawLast = (raw.lastName || "").trim();

  // If firstName has spaces AND middle is empty, split firstName
  if (rawFirst.includes(" ") && !rawMiddle) {
    const split = splitGivenName(rawFirst);
    return {
      firstName: split.firstName || undefined,
      middleName: split.middleName || undefined,
      lastName: rawLast || undefined,
    };
  }

  // Strip suffixes from middle name (e.g., model put "MICHAEL JR" in middle)
  if (rawMiddle.includes(" ")) {
    const midTokens = rawMiddle.split(/\s+/).filter((t) => !isSuffix(t));
    rawMiddle = midTokens.join(" ");
  }
  // Also strip a bare suffix like "JR" that landed in middle
  if (rawMiddle && isSuffix(rawMiddle)) {
    rawMiddle = "";
  }

  return {
    firstName: rawFirst || undefined,
    middleName: rawMiddle || undefined,
    lastName: rawLast || undefined,
  };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get("image") as File | null;

    if (!imageFile) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const bytes = await imageFile.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mediaType = imageFile.type || "image/jpeg";

    if (!ANTHROPIC_API_KEY) {
      // Dev fallback
      return NextResponse.json({
        firstName: "John",
        middleName: "Michael",
        lastName: "Smith",
        dateOfBirth: "1990-05-15",
        street: "123 Main Street",
        city: "Hershey",
        state: "PA",
        zip: "17033",
      });
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
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              {
                type: "text",
                text: `Extract driver's-license information from this image. Return ONLY valid JSON with these exact fields (use null if any field is unreadable):

{
  "firstName": "given name only — NO middle name, NO suffix (Jr/Sr/III)",
  "middleName": "middle name or middle initial (or null if none)",
  "lastName": "family name only — NO suffix",
  "dateOfBirth": "YYYY-MM-DD",
  "street": "full street address line",
  "city": "city name",
  "state": "2-letter US state code",
  "zip": "5-digit ZIP"
}

IMPORTANT rules:
- Split names into separate fields. Never combine first + middle into firstName.
- If the license shows "JOHN MICHAEL SMITH", return firstName: "JOHN", middleName: "MICHAEL", lastName: "SMITH".
- Suffixes like Jr, Sr, II, III, IV go NOWHERE — omit them entirely.
- Preserve the exact spelling and casing shown on the license.

Return ONLY the JSON object, no explanation, no markdown fences.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", errText);
      return NextResponse.json(
        { error: "Could not process the image. Please try again." },
        { status: 500 }
      );
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Could not read your license. Please enter info manually." },
        { status: 422 }
      );
    }

    const extracted = JSON.parse(jsonMatch[0]);

    // Belt-and-suspenders: normalize name even if the model still combined it
    const normalizedNames = normalizeName({
      firstName: extracted.firstName,
      middleName: extracted.middleName,
      lastName: extracted.lastName,
    });

    // Clean nulls and empty strings across all fields
    const cleaned: Record<string, string> = {};
    const merged = { ...extracted, ...normalizedNames };
    for (const [key, value] of Object.entries(merged)) {
      if (value && value !== "null" && String(value).trim() !== "") {
        cleaned[key] = String(value).trim();
      }
    }

    return NextResponse.json(cleaned);
  } catch (err) {
    console.error("License scan error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
