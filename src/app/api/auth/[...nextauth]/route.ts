import { handlers } from "@/lib/auth";
import { withRateLimit } from "@/lib/server/api-auth";
import { NextRequest, NextResponse } from "next/server";

const { GET, POST: _POST } = handlers;

export { GET };
export const POST = withRateLimit(
  _POST as unknown as (req: NextRequest) => Promise<NextResponse>,
  { limit: 10, windowMs: 60000, keyPrefix: "login" }
);
