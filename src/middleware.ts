import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Note: Authentication is handled client-side via localStorage and React context.
// This middleware only adds security headers.
// Protected route checks happen in page components via useAuth hook.

export function middleware(_request: NextRequest) {
  const response = NextResponse.next();

  // Security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // CSP header - permissive for development
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https://api.stripe.com https://*.supabase.co wss://*.supabase.co; frame-src https://js.stripe.com;"
  );

  return response;
}

// Only run middleware on page routes, not static assets
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.ico$).*)",
  ],
};
