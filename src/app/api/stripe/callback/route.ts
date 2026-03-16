import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const APP_URL = process.env.NEXTAUTH_URL || "https://womleads.com";

// GET /api/stripe/callback — server-side redirect after Stripe setup
// Stripe redirects here after checkout. We check the session server-side
// (no client-side race conditions) and redirect to the appropriate page.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "success";
  const tab = searchParams.get("tab") || "settings";

  try {
    const session = await auth();

    if (session?.user) {
      const role = (session.user as any).role as string;

      if (role === "buyer") {
        // Authenticated buyer — send to business portal
        return NextResponse.redirect(
          `${APP_URL}/business?tab=${tab}&stripe=${status}`
        );
      } else if (role === "admin") {
        return NextResponse.redirect(`${APP_URL}/admin`);
      } else {
        return NextResponse.redirect(`${APP_URL}/provider-dashboard`);
      }
    }

    // No session — redirect to login
    console.log("[STRIPE CALLBACK] No session found, redirecting to login");
    return NextResponse.redirect(`${APP_URL}/auth/login?role=buyer&stripe=${status}`);
  } catch (error) {
    console.error("[STRIPE CALLBACK] Error:", error);
    return NextResponse.redirect(`${APP_URL}/auth/login?role=buyer`);
  }
}
