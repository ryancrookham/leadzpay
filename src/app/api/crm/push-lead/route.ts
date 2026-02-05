import { NextRequest, NextResponse } from "next/server";
import { ExtractedLicenseData } from "../../extract-license/route";

// Lead data format for CRM
export interface CRMLeadData {
  // Contact Info
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;

  // Demographics
  dateOfBirth: string;
  age: number;
  gender: string;

  // Address
  street: string;
  city: string;
  state: string;
  zipCode: string;

  // License Info
  licenseNumber: string;
  licenseState: string;
  licenseExpiration: string;
  licenseValid: boolean;

  // Vehicle Info (from plate verification)
  plateNumber?: string;
  plateState?: string;
  plateVerified?: boolean;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehicleColor?: string;

  // Lead Source
  source: string;
  leadType: string;
  providerId?: string;
  providerName?: string;

  // Timestamps
  submittedAt: string;
}

// EZ Links specific payload format (adjust based on their API docs)
interface EZLinksPayload {
  lead: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    date_of_birth: string;
    address: {
      line1: string;
      city: string;
      state: string;
      postal_code: string;
    };
    custom_fields: {
      license_number: string;
      license_state: string;
      license_expiration: string;
      license_valid: string;
      age: string;
      gender: string;
      lead_source: string;
      provider_name: string;
      // Vehicle fields
      license_plate?: string;
      plate_state?: string;
      plate_verified?: string;
      vehicle_make?: string;
      vehicle_model?: string;
      vehicle_year?: string;
      vehicle_color?: string;
    };
  };
  tags?: string[];
  source?: string;
}

// Transform our data to EZ Links format
function transformToEZLinksFormat(data: CRMLeadData): EZLinksPayload {
  return {
    lead: {
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
      phone: data.phone,
      date_of_birth: data.dateOfBirth,
      address: {
        line1: data.street,
        city: data.city,
        state: data.state,
        postal_code: data.zipCode,
      },
      custom_fields: {
        license_number: data.licenseNumber,
        license_state: data.licenseState,
        license_expiration: data.licenseExpiration,
        license_valid: data.licenseValid ? "Yes" : "No",
        age: data.age.toString(),
        gender: data.gender,
        lead_source: data.source,
        provider_name: data.providerName || "WOML",
        // Vehicle fields
        license_plate: data.plateNumber,
        plate_state: data.plateState,
        plate_verified: data.plateVerified ? "Yes" : "No",
        vehicle_make: data.vehicleMake,
        vehicle_model: data.vehicleModel,
        vehicle_year: data.vehicleYear?.toString(),
        vehicle_color: data.vehicleColor,
      },
    },
    tags: [
      "auto_insurance",
      "leadzpay",
      data.licenseValid ? "valid_license" : "expired_license",
      data.plateVerified ? "plate_verified" : "plate_unverified",
    ],
    source: "leadzpay_api",
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      licenseData,
      email,
      phone,
      providerId,
      providerName,
      leadType = "quote",
      // Plate verification data
      plateNumber,
      plateState,
      plateVerified,
      vehicle,
    } = body as {
      licenseData: ExtractedLicenseData;
      email: string;
      phone: string;
      providerId?: string;
      providerName?: string;
      leadType?: string;
      plateNumber?: string;
      plateState?: string;
      plateVerified?: boolean;
      vehicle?: {
        make?: string;
        model?: string;
        year?: number;
        color?: string;
      };
    };

    if (!licenseData || !email || !phone) {
      return NextResponse.json(
        { error: "Missing required fields: licenseData, email, phone" },
        { status: 400 }
      );
    }

    // Check for EZ Links API configuration
    const ezLinksApiKey = process.env.EZLINKS_API_KEY;
    const ezLinksApiUrl = process.env.EZLINKS_API_URL || "https://api.ezlynx.com/v1/leads";

    // Build the CRM lead data
    const crmData: CRMLeadData = {
      firstName: licenseData.firstName,
      lastName: licenseData.lastName,
      fullName: licenseData.fullName,
      email,
      phone,
      dateOfBirth: licenseData.dateOfBirth,
      age: licenseData.age,
      gender: licenseData.gender,
      street: licenseData.address.street,
      city: licenseData.address.city,
      state: licenseData.address.state,
      zipCode: licenseData.address.zipCode,
      licenseNumber: licenseData.licenseNumber,
      licenseState: licenseData.licenseState,
      licenseExpiration: licenseData.expirationDate,
      licenseValid: licenseData.isValid && !licenseData.isExpired,
      // Vehicle/Plate data
      plateNumber,
      plateState,
      plateVerified,
      vehicleMake: vehicle?.make,
      vehicleModel: vehicle?.model,
      vehicleYear: vehicle?.year,
      vehicleColor: vehicle?.color,
      // Source
      source: "WOML",
      leadType,
      providerId,
      providerName,
      submittedAt: new Date().toISOString(),
    };

    // If EZ Links is configured, push to their API
    if (ezLinksApiKey) {
      const ezLinksPayload = transformToEZLinksFormat(crmData);

      try {
        const ezLinksResponse = await fetch(ezLinksApiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${ezLinksApiKey}`,
            "X-API-Key": ezLinksApiKey, // Some APIs use this header instead
          },
          body: JSON.stringify(ezLinksPayload),
        });

        if (!ezLinksResponse.ok) {
          const errorText = await ezLinksResponse.text();
          console.error("EZ Links API error:", errorText);

          // Still return success but note the CRM push failed
          return NextResponse.json({
            success: true,
            crmPushed: false,
            crmError: "Failed to push to CRM - lead saved locally",
            data: crmData,
          });
        }

        const ezLinksResult = await ezLinksResponse.json();

        return NextResponse.json({
          success: true,
          crmPushed: true,
          crmLeadId: ezLinksResult.id || ezLinksResult.lead_id,
          data: crmData,
        });
      } catch (crmError) {
        console.error("CRM push error:", crmError);
        return NextResponse.json({
          success: true,
          crmPushed: false,
          crmError: "CRM connection failed - lead saved locally",
          data: crmData,
        });
      }
    }

    // No CRM configured - return data for local storage
    return NextResponse.json({
      success: true,
      crmPushed: false,
      crmConfigured: false,
      message: "Lead processed. Configure EZLINKS_API_KEY to push to CRM.",
      data: crmData,
    });

  } catch (error) {
    console.error("CRM push error:", error);
    return NextResponse.json(
      { error: "Failed to process lead for CRM" },
      { status: 500 }
    );
  }
}

// GET endpoint to check CRM configuration status
export async function GET() {
  const ezLinksConfigured = !!process.env.EZLINKS_API_KEY;

  return NextResponse.json({
    ezLinksConfigured,
    supportedCRMs: ["EZ Links / EZLynx"],
    requiredEnvVars: [
      "EZLINKS_API_KEY - Your EZ Links API key",
      "EZLINKS_API_URL - (Optional) Custom API endpoint",
    ],
  });
}
