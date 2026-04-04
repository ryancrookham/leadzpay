import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { Session as NextAuthSession } from "next-auth";

// Session type for API handlers
export interface Session {
  userId: string;
  email: string;
  username: string;
  role: "provider" | "buyer" | "admin";
  displayName?: string;
  stripeAccountId?: string;
  stripeOnboardingComplete?: boolean;
  emailVerified?: boolean;
}

export interface AuthenticatedRequest extends NextRequest {
  session: Session;
}

type ApiHandler = (
  request: NextRequest,
  session: Session
) => Promise<NextResponse>;

interface AuthOptions {
  requiredRole?: "provider" | "buyer" | "admin";
  allowedRoles?: ("provider" | "buyer" | "admin")[];
  requireEmailVerified?: boolean;
  requireStripeOnboarding?: boolean;
}

// Convert NextAuth session to our Session type
function toSession(authSession: NextAuthSession | null): Session | null {
  if (!authSession?.user) return null;

  const user = authSession.user as any;

  return {
    userId: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    displayName: user.displayName,
    stripeAccountId: user.stripeAccountId,
    stripeOnboardingComplete: user.stripeOnboardingComplete,
    emailVerified: true,
  };
}

/**
 * Wrap an API handler with authentication
 */
export function withAuth(handler: ApiHandler, options: AuthOptions = {}) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      const authSession = await auth();
      const session = toSession(authSession);

      if (!session) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }

      if (options.requiredRole && session.role !== options.requiredRole) {
        return NextResponse.json(
          { error: "Insufficient permissions" },
          { status: 403 }
        );
      }

      if (options.allowedRoles && !options.allowedRoles.includes(session.role)) {
        return NextResponse.json(
          { error: "Insufficient permissions" },
          { status: 403 }
        );
      }

      if (options.requireEmailVerified && !session.emailVerified) {
        return NextResponse.json(
          { error: "Email verification required" },
          { status: 403 }
        );
      }

      if (
        options.requireStripeOnboarding &&
        session.role === "provider" &&
        !session.stripeOnboardingComplete
      ) {
        return NextResponse.json(
          { error: "Stripe onboarding required" },
          { status: 403 }
        );
      }

      return handler(request, session);
    } catch (error) {
      console.error("API auth error:", error);
      return NextResponse.json(
        { error: "Authentication failed" },
        { status: 500 }
      );
    }
  };
}

/**
 * Optional authentication - handler receives session or null
 */
export function withOptionalAuth(
  handler: (request: NextRequest, session: Session | null) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      const authSession = await auth();
      const session = toSession(authSession);
      return handler(request, session);
    } catch (error) {
      console.error("API auth error:", error);
      return NextResponse.json(
        { error: "Authentication check failed" },
        { status: 500 }
      );
    }
  };
}

/**
 * Rate limiting helper (basic in-memory)
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  identifier: string,
  limit: number = 100,
  windowMs: number = 60000
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record || record.resetAt < now) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (record.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  record.count++;
  return { allowed: true, remaining: limit - record.count, resetAt: record.resetAt };
}

/**
 * Wrap with rate limiting
 */
export function withRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  options: { limit?: number; windowMs?: number; keyPrefix?: string } = {}
) {
  const { limit = 100, windowMs = 60000, keyPrefix = "api" } = options;

  return async (request: NextRequest): Promise<NextResponse> => {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ||
               request.headers.get("x-real-ip") ||
               "unknown";
    const key = `${keyPrefix}:${ip}`;

    const { allowed, remaining, resetAt } = checkRateLimit(key, limit, windowMs);

    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": Math.ceil(resetAt / 1000).toString(),
            "Retry-After": Math.ceil((resetAt - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    const response = await handler(request);

    response.headers.set("X-RateLimit-Limit", limit.toString());
    response.headers.set("X-RateLimit-Remaining", remaining.toString());
    response.headers.set("X-RateLimit-Reset", Math.ceil(resetAt / 1000).toString());

    return response;
  };
}

/**
 * Combine auth and rate limiting
 */
export function withAuthAndRateLimit(
  handler: ApiHandler,
  authOptions: AuthOptions = {},
  rateLimitOptions: { limit?: number; windowMs?: number } = {}
) {
  return withRateLimit(
    withAuth(handler, authOptions),
    rateLimitOptions
  );
}

/**
 * Get client IP address
 */
export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Get user agent
 */
export function getUserAgent(request: NextRequest): string {
  return request.headers.get("user-agent") || "unknown";
}
