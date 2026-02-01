import { cookies } from "next/headers";
import { getSupabaseServerClient, isSupabaseServerConfigured, DbUser, DbSession } from "../db";

const SESSION_COOKIE_NAME = "woml_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Session data returned to client
export interface Session {
  userId: string;
  email: string;
  username: string;
  role: "provider" | "buyer" | "admin";
  displayName?: string;
  stripeAccountId?: string;
  stripeOnboardingComplete?: boolean;
  emailVerified: boolean;
}

// Generate cryptographically secure token
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Hash token for storage (don't store raw tokens in DB)
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Hash password with salt
export async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Generate random salt
export function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Create a new session for a user
 */
export async function createSession(
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string | null> {
  try {
    const token = generateToken();
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    if (isSupabaseServerConfigured()) {
      const supabase = getSupabaseServerClient();

      const { error } = await supabase.from("sessions").insert({
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      if (error) {
        console.error("Failed to create session in DB:", error);
        return null;
      }
    }

    // Set HTTP-only cookie
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: expiresAt,
      path: "/",
    });

    return token;
  } catch (error) {
    console.error("Failed to create session:", error);
    return null;
  }
}

/**
 * Validate session and return user data
 */
export async function validateSession(): Promise<Session | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

    if (!sessionCookie?.value) {
      return null;
    }

    const token = sessionCookie.value;
    const tokenHash = await hashToken(token);

    if (!isSupabaseServerConfigured()) {
      // Fallback: Just validate token format when DB not configured
      if (token.length === 64 && /^[a-f0-9]+$/.test(token)) {
        // Return minimal session for demo purposes
        return null;
      }
      return null;
    }

    const supabase = getSupabaseServerClient();

    // Get session with user data
    const { data: session, error } = await supabase
      .from("sessions")
      .select(`
        id,
        user_id,
        expires_at,
        users!inner (
          id,
          email,
          username,
          role,
          display_name,
          stripe_account_id,
          stripe_onboarding_complete,
          email_verified
        )
      `)
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (error || !session) {
      // Invalid or expired session - clear cookie
      cookieStore.delete(SESSION_COOKIE_NAME);
      return null;
    }

    // Type assertion for the joined user data
    const user = (session as unknown as { users: DbUser }).users;

    return {
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      displayName: user.display_name,
      stripeAccountId: user.stripe_account_id,
      stripeOnboardingComplete: user.stripe_onboarding_complete,
      emailVerified: user.email_verified,
    };
  } catch (error) {
    console.error("Session validation error:", error);
    return null;
  }
}

/**
 * Get current session without validation (for checking if logged in)
 */
export async function getCurrentSession(): Promise<Session | null> {
  return validateSession();
}

/**
 * Refresh session expiration
 */
export async function refreshSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

    if (!sessionCookie?.value) {
      return false;
    }

    const token = sessionCookie.value;
    const tokenHash = await hashToken(token);
    const newExpiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    if (isSupabaseServerConfigured()) {
      const supabase = getSupabaseServerClient();

      const { error } = await supabase
        .from("sessions")
        .update({ expires_at: newExpiresAt.toISOString() })
        .eq("token_hash", tokenHash);

      if (error) {
        console.error("Failed to refresh session:", error);
        return false;
      }
    }

    // Update cookie expiration
    cookieStore.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: newExpiresAt,
      path: "/",
    });

    return true;
  } catch (error) {
    console.error("Session refresh error:", error);
    return false;
  }
}

/**
 * Destroy current session (logout)
 */
export async function destroySession(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

    if (sessionCookie?.value && isSupabaseServerConfigured()) {
      const tokenHash = await hashToken(sessionCookie.value);
      const supabase = getSupabaseServerClient();

      await supabase.from("sessions").delete().eq("token_hash", tokenHash);
    }

    cookieStore.delete(SESSION_COOKIE_NAME);
    return true;
  } catch (error) {
    console.error("Session destroy error:", error);
    return false;
  }
}

/**
 * Destroy all sessions for a user (logout everywhere)
 */
export async function destroyAllUserSessions(userId: string): Promise<boolean> {
  try {
    if (!isSupabaseServerConfigured()) {
      return false;
    }

    const supabase = getSupabaseServerClient();
    await supabase.from("sessions").delete().eq("user_id", userId);

    // Also clear current session cookie
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);

    return true;
  } catch (error) {
    console.error("Destroy all sessions error:", error);
    return false;
  }
}

/**
 * Verify password against stored hash
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
  salt: string
): Promise<boolean> {
  const hash = await hashPassword(password, salt);
  return hash === storedHash;
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<DbUser | null> {
  if (!isSupabaseServerConfigured()) {
    return null;
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email.toLowerCase())
      .single();

    if (error || !data) {
      return null;
    }

    return data;
  } catch (error) {
    console.error("Get user by email error:", error);
    return null;
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<DbUser | null> {
  if (!isSupabaseServerConfigured()) {
    return null;
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (error || !data) {
      return null;
    }

    return data;
  } catch (error) {
    console.error("Get user by ID error:", error);
    return null;
  }
}

/**
 * Update user's last login timestamp
 */
export async function updateLastLogin(userId: string): Promise<void> {
  if (!isSupabaseServerConfigured()) {
    return;
  }

  try {
    const supabase = getSupabaseServerClient();
    await supabase
      .from("users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", userId);
  } catch (error) {
    console.error("Update last login error:", error);
  }
}
