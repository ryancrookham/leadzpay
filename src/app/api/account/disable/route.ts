import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ensureDisabledAtColumn, disableAccount } from "@/lib/db";

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const role = (session.user as any).role;
    if (role !== "buyer" && role !== "provider") {
      return NextResponse.json({ error: "Only business and provider accounts can be disabled" }, { status: 403 });
    }

    await ensureDisabledAtColumn();
    await disableAccount(session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ACCOUNT DISABLE] Error:", error);
    return NextResponse.json({ error: "Failed to disable account" }, { status: 500 });
  }
}
