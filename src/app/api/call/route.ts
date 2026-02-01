import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
const asapPhone = process.env.ASAP_PHONE_NUMBER || "+12158205172";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerName, customerPhone, carModel, quoteType } = body;

    // Only make calls for ASAP quotes
    if (quoteType !== "asap") {
      return NextResponse.json({ success: true, message: "No call needed" });
    }

    // Check if Twilio is configured
    if (!accountSid || !authToken || !twilioPhone) {
      console.log("Twilio not configured - would call:", asapPhone);
      console.log("Lead info:", { customerName, customerPhone, carModel });

      return NextResponse.json({
        success: true,
        message: "Call simulated (Twilio not configured)",
        wouldCall: asapPhone,
        leadInfo: { customerName, customerPhone, carModel },
      });
    }

    const client = twilio(accountSid, authToken);

    // Create a call to the lead receiver
    const call = await client.calls.create({
      twiml: `<Response>
        <Say voice="alice">
          New urgent insurance lead from WOML.
          Customer name: ${customerName}.
          Phone number: ${customerPhone}.
          Vehicle: ${carModel}.
          This customer needs a quote as soon as possible.
          Press 1 to connect to the customer now.
        </Say>
        <Gather numDigits="1" action="/api/call/connect?customerPhone=${encodeURIComponent(customerPhone)}">
          <Say>Press 1 to connect now, or hang up to call back later.</Say>
        </Gather>
      </Response>`,
      to: asapPhone,
      from: twilioPhone,
    });

    return NextResponse.json({
      success: true,
      callSid: call.sid,
      message: `Call initiated to ${asapPhone}`,
    });
  } catch (error) {
    console.error("Error initiating call:", error);
    return NextResponse.json(
      { success: false, error: "Failed to initiate call" },
      { status: 500 }
    );
  }
}
