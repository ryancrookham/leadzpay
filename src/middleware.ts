import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that require authentication
const PROTECTED_ROUTES = [
  "/business",
  "/provider-dashboard",
  "/submit-lead",
  "/dashboard",
];

// API routes that require authentication
const PROTECTED_API_ROUTES = [
  "/api/stripe",
  "/api/extract-license",
  "/api/crm",
  "/api/call",
  "/api/chat",
  "/api/notify-rate-change",
  "/api/bind-policy",
];

// Public routes (no auth needed)
const PUBLIC_ROUTES = [
  "/",
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify",
];

// Admin routes (need admin role)
const ADMIN_ROUTES = ["/admin"];

// Session cookie name
const SESSION_COOKIE = "woml_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get session cookie
  const sessionCookie = request.cookies.get(SESSION_COOKIE);
  const hasSession = !!sessionCookie?.value;

  // Add security headers to all responses
  const response = NextResponse.next();

  // Security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // CSP header (adjust as needed)
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.stripe.com https://*.supabase.co; frame-src https://js.stripe.com;"
  );

  // Check if it's a protected page route
  const isProtectedPage = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // Check if it's a protected API route
  const isProtectedApi = PROTECTED_API_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // Check if it's an admin route
  const isAdminRoute = ADMIN_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // Check if it's a public route
  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  // Handle protected page routes
  if (isProtectedPage && !hasSession) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Handle protected API routes
  if (isProtectedApi && !hasSession) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  // Admin routes have their own auth (checked in the page component)
  // We just add rate limiting headers here

  // Rate limiting headers (actual limiting would need Redis/KV)
  response.headers.set("X-RateLimit-Limit", "100");
  response.headers.set("X-RateLimit-Remaining", "99");

  // If user is logged in and trying to access auth pages, redirect to dashboard
  if (hasSession && (pathname === "/auth/login" || pathname === "/auth/register")) {
    // They'll be redirected by the page based on their role
    return response;
  }

  return response;
}

// Configure which routes the middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)",
  ],
};
