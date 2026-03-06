import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ensureBuyerStripeColumns, getBuyerStripeSetupComplete } from "@/lib/db";

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
  const complete = await getBuyerStripeSetupComplete(session.user.id);
  return NextResponse.json({ complete });
}
