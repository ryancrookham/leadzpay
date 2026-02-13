import { NextResponse } from "next/server";
import { getPlatformSettings } from "@/lib/db";

export async function GET() {
  try {
    const settings = await getPlatformSettings();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error("Get platform fees error:", error);
    return NextResponse.json({ error: "Failed to fetch platform fees" }, { status: 500 });
  }
}
