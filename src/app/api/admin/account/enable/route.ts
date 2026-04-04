import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ensureDisabledAtColumn, enableAccount } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if ((session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    await ensureDisabledAtColumn();
    await enableAccount(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ADMIN ENABLE] Error:", error);
    return NextResponse.json({ error: "Failed to enable account" }, { status: 500 });
  }
}
