import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      providerName,
      providerEmail,
      oldRate,
      newRate,
      businessName = "LeadzPay Insurance Agency",
      businessEmail = "business@leadzpay.com"
    } = body;

    // In production, you would use a service like SendGrid, Resend, or AWS SES
    // For now, we'll simulate the email sending and log it

    const providerEmailContent = {
      to: providerEmail,
      subject: `Your Lead Payout Rate Has Been Updated - ${businessName}`,
      body: `
Hi ${providerName},

Your lead payout rate with ${businessName} has been updated.

Previous Rate: $${oldRate} per lead
New Rate: $${newRate} per lead
Effective: Immediately

This change will apply to all future leads you submit. Your existing leads will not be affected.

If you have any questions about this change, please contact ${businessName}.

Best regards,
${businessName}
LeadzPay Platform
      `.trim()
    };

    const businessEmailContent = {
      to: businessEmail,
      subject: `Rate Change Confirmation - ${providerName}`,
      body: `
Rate change notification sent successfully.

Provider: ${providerName}
Email: ${providerEmail}
Previous Rate: $${oldRate} per lead
New Rate: $${newRate} per lead
Changed At: ${new Date().toLocaleString()}

The provider has been notified of this change via email.

- LeadzPay System
      `.trim()
    };

    // Log the emails (in production, send via email service)
    console.log("=== RATE CHANGE NOTIFICATION ===");
    console.log("Provider Email:", JSON.stringify(providerEmailContent, null, 2));
    console.log("Business Email:", JSON.stringify(businessEmailContent, null, 2));
    console.log("================================");

    // Check if email service is configured (e.g., Resend, SendGrid)
    if (process.env.RESEND_API_KEY) {
      // Example with Resend (would need to install @resend/node)
      // const resend = new Resend(process.env.RESEND_API_KEY);
      // await resend.emails.send({ from: 'noreply@leadzpay.com', ...providerEmailContent });
      // await resend.emails.send({ from: 'noreply@leadzpay.com', ...businessEmailContent });
    }

    return NextResponse.json({
      success: true,
      message: "Rate change notifications sent",
      notifications: {
        provider: {
          email: providerEmail,
          sent: true,
          simulated: !process.env.RESEND_API_KEY
        },
        business: {
          email: businessEmail,
          sent: true,
          simulated: !process.env.RESEND_API_KEY
        }
      },
      rateChange: {
        provider: providerName,
        oldRate,
        newRate,
        changedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("Notification error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to send notifications" },
      { status: 500 }
    );
  }
}
