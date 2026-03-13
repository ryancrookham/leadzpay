import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setBusinessPin } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can set a PIN" }, { status: 403 });
    }

    const { pin } = (await request.json()) as { pin?: string };
    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits" }, { status: 400 });
    }

    const hash = await bcrypt.hash(pin, 10);
    await setBusinessPin(session.user.id, hash);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[set-pin]", error);
    return NextResponse.json({ error: error?.message || "Failed to set PIN" }, { status: 500 });
  }
}
