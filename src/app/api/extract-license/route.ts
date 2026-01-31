import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Extracted license data structure
export interface ExtractedLicenseData {
  // Personal Information
  firstName: string;
  lastName: string;
  middleName?: string;
  fullName: string;
  dateOfBirth: string; // YYYY-MM-DD format
  age: number;
  gender: "male" | "female" | "other";

  // License Information
  licenseNumber: string;
  licenseState: string;
  expirationDate: string; // YYYY-MM-DD format
  issueDate?: string;
  licenseClass?: string;

  // Address
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    fullAddress: string;
  };

  // Validation
  isExpired: boolean;
  daysUntilExpiration: number;
  isValid: boolean;
  validationNotes: string[];

  // Raw extraction confidence
  confidence: "high" | "medium" | "low";
  extractionNotes?: string;
}

// Calculate age from date of birth
function calculateAge(dob: string): number {
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

// Calculate days until expiration
function calculateDaysUntilExpiration(expDate: string): number {
  const expiration = new Date(expDate);
  const today = new Date();
  const diffTime = expiration.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export async function POST(request: NextRequest) {
  try {
    const { licenseImage } = await request.json();

    if (!licenseImage) {
      return NextResponse.json(
        { error: "License image is required" },
        { status: 400 }
      );
    }

    // Check for API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "License extraction service not configured" },
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

    // Use Claude Vision to extract license data
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
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
              text: `Analyze this driver's license image and extract all information. Return ONLY a valid JSON object with no additional text, in this exact format:

{
  "firstName": "extracted first name",
  "lastName": "extracted last name",
  "middleName": "extracted middle name or null",
  "dateOfBirth": "YYYY-MM-DD format",
  "gender": "male" or "female" or "other",
  "licenseNumber": "the license number",
  "licenseState": "two-letter state code like CA, TX, PA",
  "expirationDate": "YYYY-MM-DD format",
  "issueDate": "YYYY-MM-DD format or null",
  "licenseClass": "license class if visible or null",
  "street": "street address",
  "city": "city name",
  "state": "two-letter state code",
  "zipCode": "5 or 9 digit zip",
  "confidence": "high" if all fields clearly readable, "medium" if some uncertainty, "low" if significant issues,
  "notes": "any issues or observations about the extraction"
}

Important:
- Use YYYY-MM-DD format for all dates
- Use two-letter state codes (e.g., CA, TX, PA)
- If a field cannot be extracted, use null
- Be precise with the license number - include all characters
- Extract the complete street address including apartment/unit if present`,
            },
          ],
        },
      ],
    });

    // Parse Claude's response
    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response format from vision API");
    }

    let extractedData;
    try {
      // Try to parse the JSON response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      extractedData = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("Failed to parse license data:", content.text);
      return NextResponse.json(
        { error: "Failed to extract license data. Please ensure the image is clear and properly oriented." },
        { status: 422 }
      );
    }

    // Build the full response with validation
    const dob = extractedData.dateOfBirth;
    const expDate = extractedData.expirationDate;
    const age = dob ? calculateAge(dob) : 0;
    const daysUntilExpiration = expDate ? calculateDaysUntilExpiration(expDate) : 0;
    const isExpired = daysUntilExpiration < 0;

    // Validation checks
    const validationNotes: string[] = [];
    let isValid = true;

    if (isExpired) {
      validationNotes.push(`License expired ${Math.abs(daysUntilExpiration)} days ago`);
      isValid = false;
    } else if (daysUntilExpiration <= 30) {
      validationNotes.push(`License expires in ${daysUntilExpiration} days`);
    }

    if (age < 16) {
      validationNotes.push("Age appears to be under 16 - please verify");
      isValid = false;
    } else if (age > 100) {
      validationNotes.push("Age appears unusual - please verify date of birth");
    }

    if (!extractedData.licenseNumber) {
      validationNotes.push("License number could not be extracted");
      isValid = false;
    }

    const fullName = [
      extractedData.firstName,
      extractedData.middleName,
      extractedData.lastName,
    ]
      .filter(Boolean)
      .join(" ");

    const fullAddress = [
      extractedData.street,
      extractedData.city,
      extractedData.state,
      extractedData.zipCode,
    ]
      .filter(Boolean)
      .join(", ");

    const result: ExtractedLicenseData = {
      firstName: extractedData.firstName || "",
      lastName: extractedData.lastName || "",
      middleName: extractedData.middleName || undefined,
      fullName,
      dateOfBirth: dob || "",
      age,
      gender: extractedData.gender || "other",
      licenseNumber: extractedData.licenseNumber || "",
      licenseState: extractedData.licenseState || "",
      expirationDate: expDate || "",
      issueDate: extractedData.issueDate || undefined,
      licenseClass: extractedData.licenseClass || undefined,
      address: {
        street: extractedData.street || "",
        city: extractedData.city || "",
        state: extractedData.state || "",
        zipCode: extractedData.zipCode || "",
        fullAddress,
      },
      isExpired,
      daysUntilExpiration,
      isValid,
      validationNotes,
      confidence: extractedData.confidence || "medium",
      extractionNotes: extractedData.notes || undefined,
    };

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("License extraction error:", error);
    return NextResponse.json(
      { error: "Failed to process license image" },
      { status: 500 }
    );
  }
}
