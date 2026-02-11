import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phoneNumber, businessName } = body;

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
    const signupUrl = "https://www.womleads.com/auth/register?role=provider";
    const messageBody = `WOMLeads: ${senderName} has invited you to become a lead provider! Sign up here to start earning: ${signupUrl}`;

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

    const errorMessage =
      error instanceof Error && error.message?.includes("is not a valid phone number")
        ? "That phone number appears to be invalid. Please check and try again."
        : "Failed to send text invite. Please try again.";

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
