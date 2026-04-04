import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBusinessPinHash, setBusinessPin } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { currentPin, newPin } = (await request.json()) as {
      currentPin?: string;
      newPin?: string;
    };

    if (!newPin || !/^\d{4}$/.test(newPin)) {
      return NextResponse.json({ error: "New PIN must be exactly 4 digits." }, { status: 400 });
    }

    const existingHash = await getBusinessPinHash(session.user.id);

    if (existingHash) {
      if (!currentPin) {
        return NextResponse.json({ error: "Current PIN is required." }, { status: 400 });
      }
      const valid = await bcrypt.compare(currentPin, existingHash);
      if (!valid) {
        return NextResponse.json({ error: "Current PIN is incorrect." }, { status: 400 });
      }
    }

    const newHash = await bcrypt.hash(newPin, 10);
    await setBusinessPin(session.user.id, newHash);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[change-pin]", error);
    return NextResponse.json({ error: error?.message || "Failed to change PIN" }, { status: 500 });
  }
}
