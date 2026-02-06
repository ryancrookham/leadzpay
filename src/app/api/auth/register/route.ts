import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { email, password, username, role, displayName, phone, location, businessName, businessType, licensedStates } = body;

    // Validate required fields
    if (!email || !password || !username || !role) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate password
    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Validate role
    if (role !== "provider" && role !== "buyer") {
      return NextResponse.json(
        { success: false, error: "Invalid role" },
        { status: 400 }
      );
    }

    // Block buyer registration - single operator mode (Options Insurance Agency)
    if (role === "buyer") {
      return NextResponse.json(
        { success: false, error: "Business registration is not available. This platform is exclusively for Options Insurance Agency." },
        { status: 403 }
      );
    }

    // Register user
    const result = await registerUser({
      email,
      password,
      username,
      role,
      displayName,
      phone,
      location,
      businessName,
      businessType,
      licensedStates,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[REGISTER] Error:", errorMessage, error);
    return NextResponse.json(
      { success: false, error: `Registration failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
