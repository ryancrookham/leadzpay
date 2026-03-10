import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSmsAlertSettings, updateSmsAlertSettings } from "@/lib/db";

/**
 * GET /api/business/sms-alerts
 * Returns the SMS alert settings for the authenticated buyer.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can access SMS alert settings" }, { status: 403 });
    }

    const settings = await getSmsAlertSettings(session.user.id);
    return NextResponse.json({ success: true, ...settings });
  } catch (error: any) {
    console.error("[sms-alerts GET]", error);
    return NextResponse.json({ error: error?.message || "Failed to get SMS settings" }, { status: 500 });
  }
}

/**
 * POST /api/business/sms-alerts
 * Updates SMS alert settings for the authenticated buyer.
 * Body: { smsAlertsEnabled: boolean, smsAlertPhone1?: string, smsAlertPhone2?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can update SMS alert settings" }, { status: 403 });
    }

    const body = await request.json();
    const { smsAlertsEnabled, smsAlertPhone1, smsAlertPhone2 } = body as {
      smsAlertsEnabled?: boolean;
      smsAlertPhone1?: string;
      smsAlertPhone2?: string;
    };

    // Basic phone validation helper
    function validatePhone(phone: string | undefined): string | null {
      if (!phone || !phone.trim()) return null;
      const cleaned = phone.replace(/\D/g, "");
      if (cleaned.length < 10 || cleaned.length > 11) {
        throw new Error(`Invalid phone number: ${phone}`);
      }
      return cleaned.length === 10 ? `+1${cleaned}` : `+${cleaned}`;
    }

    const normalizedPhone1 = validatePhone(smsAlertPhone1);
    const normalizedPhone2 = validatePhone(smsAlertPhone2);

    await updateSmsAlertSettings(session.user.id, {
      smsAlertsEnabled: smsAlertsEnabled ?? false,
      smsAlertPhone1: normalizedPhone1,
      smsAlertPhone2: normalizedPhone2,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[sms-alerts POST]", error);
    return NextResponse.json({ error: error?.message || "Failed to update SMS settings" }, { status: 500 });
  }
}
