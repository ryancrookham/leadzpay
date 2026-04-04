import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setBuyerStripeSetupComplete } from "@/lib/db";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "buyer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await setBuyerStripeSetupComplete(session.user.id);
  return NextResponse.json({ success: true });
}
