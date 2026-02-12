import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { toggleUserActive } from "@/lib/db";

/**
 * PATCH /api/admin/users - Toggle user active status
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { userId, isActive } = await request.json();
    if (!userId || typeof isActive !== "boolean") {
      return NextResponse.json({ error: "userId and isActive required" }, { status: 400 });
    }

    const updated = await toggleUserActive(userId, isActive);
    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, isActive: updated.is_active });
  } catch (error) {
    console.error("Toggle user error:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
