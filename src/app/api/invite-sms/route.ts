import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phoneNumber, businessName, inviteToken, ratePerLead } = body;

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

    // Build the signup URL — embed invite token if provided
    const signupUrl = inviteToken
      ? `https://www.womleads.com/provider-onboarding?token=${inviteToken}`
      : "https://www.womleads.com/provider-onboarding";

    const earningLine = ratePerLead ? ` Earn $${ratePerLead}/lead.` : "";
    const messageBody = `WOMLeads: ${senderName} invited you to join their provider network!${earningLine} Sign up here: ${signupUrl}`;

    if (!accountSid || !authToken || !twilioPhone) {
      console.error("Twilio not configured - missing credentials");
      return NextResponse.json(
        { success: false, error: "SMS is not configured. Please set up Twilio credentials." },
        { status: 500 }
      );
    }

    const client = twilio(accountSid, authToken);

    const message = await client.messages.create({
      body: messageBody,
      from: twilioPhone,
      to: formattedPhone,
    });

    console.log(`SMS invite sent to ${formattedPhone}, SID: ${message.sid}`);

    return NextResponse.json({
      success: true,
      messageSid: message.sid,
      message: `Text invite sent to ${formattedPhone}`,
    });
  } catch (error: unknown) {
    console.error("Error sending SMS invite:", error);

    // Parse Twilio error for a specific, actionable message
    const twilioCode = (error as { code?: number })?.code;
    const twilioMessage = error instanceof Error ? error.message : "";

    let errorMessage: string;
    if (twilioCode === 21608 || twilioCode === 21610 || twilioMessage.includes("unverified")) {
      errorMessage = "SMS is temporarily unavailable — our toll-free number is pending verification. Please use the copy link button to share the invite URL directly.";
    } else if (twilioCode === 21211 || twilioMessage.includes("is not a valid phone number")) {
      errorMessage = "That phone number appears to be invalid. Please check and try again.";
    } else if (twilioCode === 21606 || twilioMessage.includes("not a mobile number")) {
      errorMessage = "That number cannot receive SMS. Please use a mobile number.";
    } else if (twilioCode === 20003 || twilioMessage.includes("Authenticate")) {
      errorMessage = "SMS service credentials are invalid. Please contact support.";
    } else {
      errorMessage = `SMS failed: ${twilioMessage || "Unknown error"}. Try using the copy link button instead.`;
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
