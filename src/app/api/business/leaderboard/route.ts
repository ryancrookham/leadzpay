import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLeaderboardData } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Auth required" }, { status: 401 });
    if ((session.user as any).role !== "buyer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { rows, uniqueLeads } = await getLeaderboardData(session.user.id);
    return NextResponse.json({ success: true, rows, uniqueLeads });
  } catch (e) {
    console.error("[leaderboard GET]", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
