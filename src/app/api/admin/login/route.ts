import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { getUserByEmail } from "@/lib/db";
import { encode } from "@auth/core/jwt";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password required" },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await getUserByEmail(email.trim().toLowerCase());
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Must be admin and active
    if (user.role !== "admin" || !user.is_active) {
      return NextResponse.json(
        { success: false, error: "Access denied" },
        { status: 403 }
      );
    }

    // Determine cookie name based on protocol
    const isSecure = request.url.startsWith("https");
    const cookieName = isSecure
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";

    // Build JWT token payload — same fields as auth.ts JWT callback
    const tokenPayload = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      displayName: user.display_name || undefined,
      businessName: user.business_name || undefined,
      businessType: user.business_type || undefined,
      phone: user.phone || undefined,
      location: user.location || undefined,
      licensedStates: user.licensed_states || undefined,
      stripeAccountId: user.stripe_account_id || undefined,
      stripeOnboardingComplete: user.stripe_onboarding_complete,
      sub: user.id,
    };

    const maxAge = 30 * 24 * 60 * 60; // 30 days — matches auth.ts session config

    // Encode JWT using NextAuth's encoding (same secret + salt)
    const token = await encode({
      token: tokenPayload,
      secret: process.env.AUTH_SECRET!,
      salt: cookieName,
      maxAge,
    });

    // Set the session cookie
    const cookieStore = await cookies();
    cookieStore.set(cookieName, token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ADMIN LOGIN] Error:", error);
    return NextResponse.json(
      { success: false, error: "Login failed" },
      { status: 500 }
    );
  }
}
