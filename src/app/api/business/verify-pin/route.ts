import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBusinessPinHash } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can verify a PIN" }, { status: 403 });
    }

    const { pin } = (await request.json()) as { pin?: string };
    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits" }, { status: 400 });
    }

    const hash = await getBusinessPinHash(session.user.id);
    // Legacy accounts with no PIN set — allow through
    if (!hash) {
      return NextResponse.json({ valid: true });
    }

    const valid = await bcrypt.compare(pin, hash);
    return NextResponse.json({ valid });
  } catch (error: any) {
    console.error("[verify-pin]", error);
    return NextResponse.json({ error: error?.message || "Failed to verify PIN" }, { status: 500 });
  }
}
