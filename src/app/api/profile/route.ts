import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserById, updateUser } from "@/lib/db";

// GET /api/profile - Fetch current user's full profile
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const user = await getUserById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      profile: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name,
        phone: user.phone,
        location: user.location,
        businessName: user.business_name,
        profilePictureUrl: user.profile_picture_url,
        stripeAccountId: user.stripe_account_id || null,
        stripeOnboardingComplete: user.stripe_onboarding_complete || false,
        stripeCustomerId: user.stripe_customer_id || null,
      },
    });
  } catch (error) {
    console.error("[PROFILE] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

// PATCH /api/profile - Update current user's profile
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const {
      displayName,
      phone,
      location,
      businessName,
      profilePictureUrl,
      email,
    } = body;

    const updates: Record<string, unknown> = {};
    if (displayName !== undefined) updates.display_name = displayName;
    if (phone !== undefined) updates.phone = phone;
    if (location !== undefined) updates.location = location;
    if (businessName !== undefined) updates.business_name = businessName;
    if (profilePictureUrl !== undefined) updates.profile_picture_url = profilePictureUrl;
    if (email !== undefined) updates.email = email;

    const updated = await updateUser(session.user.id, updates as any);
    if (!updated) {
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PROFILE] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
