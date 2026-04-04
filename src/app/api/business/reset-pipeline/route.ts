import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resetPipelineData } from "@/lib/db";

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((session.user as any).email !== "rcrookham@gmail.com") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await resetPipelineData();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[reset-pipeline]", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
