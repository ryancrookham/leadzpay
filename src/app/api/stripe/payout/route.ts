import { NextResponse } from "next/server";

const DISABLED_MSG = { error: "This endpoint is deprecated. Payouts are processed automatically via Stripe Connect." };

export async function POST() {
  return NextResponse.json(DISABLED_MSG, { status: 410 });
}

export async function GET() {
  return NextResponse.json(DISABLED_MSG, { status: 410 });
}
