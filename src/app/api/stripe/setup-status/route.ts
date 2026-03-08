import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ensureBuyerStripeColumns, getBuyerStripeSetupComplete, getUserById, setBuyerStripeSetupComplete } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (role !== "buyer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureBuyerStripeColumns();

  const user = await getUserById(session.user.id);
  const flagComplete = await getBuyerStripeSetupComplete(session.user.id);
  const complete = user?.stripe_customer_id ? true : flagComplete;

  // Auto-fix: if they have a stripe_customer_id but flag was false, persist it
  if (user?.stripe_customer_id && !flagComplete) {
    await setBuyerStripeSetupComplete(session.user.id);
  }

  return NextResponse.json({ complete });
}
