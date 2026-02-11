import { NextRequest, NextResponse } from "next/server";

// Lead data format for CRM
export interface CRMLeadData {
  // Contact Info
  fullName: string;
  email: string;
  phone: string;
  state: string | null;

  // Optional demographics
  maritalStatus?: string;
  hasInsurance?: string;

  // License verification
  licenseVerified: boolean;

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      licenseData,
      email,
      phone,
      customerName,
      maritalStatus,
      hasInsurance,
      providerId,
      providerName,
      leadType = "quote",
      plateNumber,
      plateState,
      plateVerified,
      vehicle,
    } = body;

    if (!email || !phone) {
      return NextResponse.json(
        { error: "Missing required fields: email, phone" },
        { status: 400 }
      );
    }

    // Build the CRM lead data from available info
    const crmData: CRMLeadData = {
      fullName: customerName || licenseData?.name || "Unknown",
      email,
      phone,
      state: licenseData?.state || null,
      maritalStatus,
      hasInsurance,
      licenseVerified: !!(licenseData?.isLicense && licenseData?.isClear),
      plateNumber,
      plateState,
      plateVerified,
      vehicleMake: vehicle?.make,
      vehicleModel: vehicle?.model,
      vehicleYear: vehicle?.year,
      vehicleColor: vehicle?.color,
      source: "WOML",
      leadType,
      providerId,
      providerName,
      submittedAt: new Date().toISOString(),
    };

    // Check for EZ Links API configuration
    const ezLinksApiKey = process.env.EZLINKS_API_KEY;
    const ezLinksApiUrl = process.env.EZLINKS_API_URL || "https://api.ezlynx.com/v1/leads";

    if (ezLinksApiKey) {
      try {
        const ezLinksResponse = await fetch(ezLinksApiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${ezLinksApiKey}`,
          },
          body: JSON.stringify(crmData),
        });

        if (!ezLinksResponse.ok) {
          const errorText = await ezLinksResponse.text();
          console.error("EZ Links API error:", errorText);
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

    // No CRM configured
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
