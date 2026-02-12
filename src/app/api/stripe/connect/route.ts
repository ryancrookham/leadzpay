import { NextResponse } from "next/server";

const DISABLED_MSG = { error: "Stripe payments are disabled. All payments are processed via Venmo to @womleads." };

export async function POST() {
  return NextResponse.json(DISABLED_MSG, { status: 410 });
}

export async function GET() {
  return NextResponse.json(DISABLED_MSG, { status: 410 });
}
