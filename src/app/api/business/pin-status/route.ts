import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBusinessPinHash } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hash = await getBusinessPinHash(session.user.id);
    return NextResponse.json({ hasPin: !!hash });
  } catch (error: any) {
    console.error("[pin-status]", error);
    return NextResponse.json({ error: error?.message || "Failed to check PIN status" }, { status: 500 });
  }
}
