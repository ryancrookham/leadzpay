import { NextRequest, NextResponse } from "next/server";

// Simulated carrier API endpoints (in production, these would be real carrier APIs)
const CARRIER_ENDPOINTS = {
  state_farm: "https://api.statefarm.com/v1/policies",
  progressive: "https://api.progressive.com/v1/bind",
  allstate: "https://api.allstate.com/v1/policies",
  liberty_mutual: "https://api.libertymutual.com/v1/bind",
  nationwide: "https://api.nationwide.com/v1/policies",
  farmers: "https://api.farmers.com/v1/bind",
  travelers: "https://api.travelers.com/v1/policies",
  american_family: "https://api.amfam.com/v1/bind",
  // GEICO and USAA are direct-only, no broker API
};

interface BindRequest {
  carrierId: string;
  customerInfo: {
    name: string;
    email: string;
    phone: string;
    dateOfBirth?: string;
    address?: string;
    city?: string;
    state: string;
    zipCode?: string;
    driversLicense?: string;
  };
  vehicleInfo: {
    year: number;
    make: string;
    model: string;
    vin?: string;
  };
  coverageInfo: {
    type: string;
    deductible: number;
    bodilyInjury?: string;
    propertyDamage?: number;
  };
  premium: {
    monthly: number;
    annual: number;
  };
  paymentInfo?: {
    cardLast4?: string;
    paymentMethod?: string;
  };
}

interface BindResponse {
  success: boolean;
  policyNumber?: string;
  carrier: string;
  effectiveDate: string;
  premium: number;
  documents?: {
    policyDocument: string;
    idCards: string;
    declarations: string;
  };
  message?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<BindResponse>> {
  try {
    const body: BindRequest = await request.json();

    // Validate carrier supports API binding
    if (body.carrierId === "geico" || body.carrierId === "usaa") {
      return NextResponse.json({
        success: false,
        carrier: body.carrierId,
        effectiveDate: "",
        premium: 0,
        message: `${body.carrierId.toUpperCase()} is a direct-to-consumer carrier. Please visit their website to purchase.`,
      });
    }

    // Generate policy number
    const policyNumber = generatePolicyNumber(body.carrierId);
    const effectiveDate = new Date().toISOString().split("T")[0];

    // In production, this would call the actual carrier API:
    // const response = await fetch(CARRIER_ENDPOINTS[body.carrierId], {
    //   method: "POST",
    //   headers: { "Authorization": `Bearer ${process.env[`${body.carrierId.toUpperCase()}_API_KEY`]}` },
    //   body: JSON.stringify(body)
    // });

    // Simulate API response with slight delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Log the binding for audit trail
    console.log("Policy Bound:", {
      policyNumber,
      carrier: body.carrierId,
      customer: body.customerInfo.name,
      premium: body.premium.annual,
      timestamp: new Date().toISOString(),
    });

    // Generate mock document URLs
    const documents = {
      policyDocument: `/api/documents/${policyNumber}/policy.pdf`,
      idCards: `/api/documents/${policyNumber}/id-cards.pdf`,
      declarations: `/api/documents/${policyNumber}/declarations.pdf`,
    };

    return NextResponse.json({
      success: true,
      policyNumber,
      carrier: body.carrierId,
      effectiveDate,
      premium: body.premium.annual,
      documents,
      message: "Policy successfully bound. Documents will be emailed within 24 hours.",
    });
  } catch (error) {
    console.error("Binding error:", error);
    return NextResponse.json({
      success: false,
      carrier: "",
      effectiveDate: "",
      premium: 0,
      message: "Failed to bind policy. Please try again or contact support.",
    }, { status: 500 });
  }
}

function generatePolicyNumber(carrierId: string): string {
  const prefix = carrierId.substring(0, 2).toUpperCase();
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}
