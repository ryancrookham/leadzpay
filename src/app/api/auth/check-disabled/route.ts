import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ disabled: false });
    }

    const user = await getUserByEmail(email.trim().toLowerCase());
    if (!user) {
      return NextResponse.json({ disabled: false });
    }

    return NextResponse.json({ disabled: !!user.disabled_at });
  } catch {
    return NextResponse.json({ disabled: false });
  }
}
