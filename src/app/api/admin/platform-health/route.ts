import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAdminPlatformHealth } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 401 });
    }
    const health = await getAdminPlatformHealth();
    return NextResponse.json({ success: true, ...health });
  } catch (error: any) {
    console.error("[admin/platform-health]", error);
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}
