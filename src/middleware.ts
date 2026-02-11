import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Note: Authentication is handled via NextAuth.js
// This middleware only adds security headers.
// Protected route checks happen in page components via useAuth hook.

export function middleware(_request: NextRequest) {
  const response = NextResponse.next();

  // Security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

// Only run middleware on page routes, not static assets
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.ico$).*)",
  ],
};
