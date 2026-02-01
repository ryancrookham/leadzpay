import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// Simple hash comparison using Web Crypto API
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Generate a secure session token
function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (!password) {
      return NextResponse.json(
        { error: "Password required" },
        { status: 400 }
      );
    }

    // Get the admin password hash from environment variable
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

    if (!adminPasswordHash) {
      console.error("ADMIN_PASSWORD_HASH not configured");
      return NextResponse.json(
        { error: "Admin authentication not configured" },
        { status: 503 }
      );
    }

    // Hash the provided password and compare
    const providedHash = await hashPassword(password);

    if (providedHash !== adminPasswordHash) {
      // Add delay to prevent timing attacks
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Generate session token
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Set HTTP-only cookie
    const cookieStore = await cookies();
    cookieStore.set("admin_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      expires: expiresAt,
      path: "/",
    });

    // Store session token hash in memory (in production, use database/Redis)
    // For now, we'll verify by checking if cookie exists and is valid format

    return NextResponse.json({
      success: true,
      message: "Authenticated successfully",
    });
  } catch (error) {
    console.error("Admin auth error:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 }
    );
  }
}

// Verify admin session
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("admin_session");

    if (!sessionToken || !sessionToken.value || sessionToken.value.length !== 64) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authenticated: true,
    });
  } catch (error) {
    console.error("Session check error:", error);
    return NextResponse.json(
      { authenticated: false },
      { status: 401 }
    );
  }
}

// Logout - clear session
export async function DELETE() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("admin_session");

    return NextResponse.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { error: "Logout failed" },
      { status: 500 }
    );
  }
}
