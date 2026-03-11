import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendSms, isSinchConfigured } from "@/lib/sinch";

export async function POST(request: NextRequest) {
  try {
    // Auth check — only authenticated buyers (businesses) can send SMS invites
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ success: false, error: "Only business accounts can send SMS invites" }, { status: 403 });
    }

    const body = await request.json();
    const { phoneNumber, businessName, inviteToken, ratePerLead, providerName } = body;

    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, error: "Phone number is required" },
        { status: 400 }
      );
    }

    // Basic US phone validation
    const cleaned = phoneNumber.replace(/\D/g, "");
    if (cleaned.length < 10 || cleaned.length > 11) {
      return NextResponse.json(
        { success: false, error: "Please enter a valid US phone number" },
        { status: 400 }
      );
    }

    const formattedPhone = cleaned.length === 10 ? `+1${cleaned}` : `+${cleaned}`;
    const senderName = businessName || "A business on WOMLeads";
    const greeting = providerName ? `Hey ${providerName}! ` : "";

    // Build the signup URL — embed invite token if provided
    const signupUrl = inviteToken
      ? `https://www.womleads.com/provider-onboarding?token=${inviteToken}`
      : "https://www.womleads.com/provider-onboarding";

    const earningLine = ratePerLead ? ` Earn $${ratePerLead} per lead.` : "";
    const messageBody = `${greeting}${senderName} invited you to send leads on WOML.${earningLine} Sign up here: ${signupUrl}`;

    if (!isSinchConfigured()) {
      console.error("Sinch not configured - missing credentials");
      return NextResponse.json(
        { success: false, error: "SMS is not configured. Please set up Sinch credentials." },
        { status: 500 }
      );
    }

    const result = await sendSms(formattedPhone, messageBody);

    if (!result.success) {
      console.error("Sinch SMS invite failed:", result.error);
      return NextResponse.json(
        { success: false, error: result.error ?? "SMS failed. Try using the copy link button instead." },
        { status: 500 }
      );
    }

    console.log(`SMS invite sent to ${formattedPhone}, batch ID: ${result.batchId}`);

    return NextResponse.json({
      success: true,
      batchId: result.batchId,
      message: `Text invite sent to ${formattedPhone}`,
    });
  } catch (error: unknown) {
    console.error("Error sending SMS invite:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: `SMS failed: ${msg}. Try using the copy link button instead.` },
      { status: 500 }
    );
  }
}
