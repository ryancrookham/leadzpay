import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getUserByEmail, getUserById, createUser, type DbUser } from "./db";

// Extend the session types
declare module "next-auth" {
  interface User {
    id: string;
    email: string;
    username: string;
    role: "provider" | "buyer" | "admin";
    displayName?: string;
    businessName?: string;
    businessType?: string;
    phone?: string;
    location?: string;
    licensedStates?: string[];
    stripeAccountId?: string;
    stripeOnboardingComplete?: boolean;
  }

  interface Session {
    user: User;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    email: string;
    username: string;
    role: "provider" | "buyer" | "admin";
    displayName?: string;
    businessName?: string;
    businessType?: string;
    phone?: string;
    location?: string;
    licensedStates?: string[];
    stripeAccountId?: string;
    stripeOnboardingComplete?: boolean;
  }
}

// Convert database user to auth user format
function dbUserToAuthUser(dbUser: DbUser) {
  return {
    id: dbUser.id,
    email: dbUser.email,
    username: dbUser.username,
    role: dbUser.role,
    displayName: dbUser.display_name || undefined,
    businessName: dbUser.business_name || undefined,
    businessType: dbUser.business_type || undefined,
    phone: dbUser.phone || undefined,
    location: dbUser.location || undefined,
    licensedStates: dbUser.licensed_states || undefined,
    stripeAccountId: dbUser.stripe_account_id || undefined,
    stripeOnboardingComplete: dbUser.stripe_onboarding_complete,
  };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        try {
          const user = await getUserByEmail(email);

          if (!user) {
            console.log("[AUTH] User not found:", email);
            return null;
          }

          const isValidPassword = await bcrypt.compare(password, user.password_hash);

          if (!isValidPassword) {
            console.log("[AUTH] Invalid password for:", email);
            return null;
          }

          if (!user.is_active) {
            console.log("[AUTH] User inactive:", email);
            return null;
          }

          console.log("[AUTH] Login successful:", email, "role:", user.role);
          return dbUserToAuthUser(user);
        } catch (error) {
          console.error("[AUTH] Error during authorization:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Initial sign in
      if (user) {
        token.id = user.id;
        token.email = user.email!;
        token.username = user.username;
        token.role = user.role;
        token.displayName = user.displayName;
        token.businessName = user.businessName;
        token.businessType = user.businessType;
        token.phone = user.phone;
        token.location = user.location;
        token.licensedStates = user.licensedStates;
        token.stripeAccountId = user.stripeAccountId;
        token.stripeOnboardingComplete = user.stripeOnboardingComplete;
      }
      return token;
    },
    async session({ session, token }) {
      // Type assertion needed because we're extending the default user type
      (session.user as any) = {
        id: token.id,
        email: token.email,
        username: token.username,
        role: token.role,
        displayName: token.displayName,
        businessName: token.businessName,
        businessType: token.businessType,
        phone: token.phone,
        location: token.location,
        licensedStates: token.licensedStates,
        stripeAccountId: token.stripeAccountId,
        stripeOnboardingComplete: token.stripeOnboardingComplete,
      };
      return session;
    },
  },
  pages: {
    signIn: "/auth/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  trustHost: true,
});

// Helper to register a new user
export async function registerUser(data: {
  email: string;
  password: string;
  username: string;
  role: "provider" | "buyer";
  displayName?: string;
  phone?: string;
  location?: string;
  businessName?: string;
  businessType?: string;
  licensedStates?: string[];
}): Promise<{ success: boolean; error?: string; user?: DbUser }> {
  try {
    // Check if user already exists
    const existingUser = await getUserByEmail(data.email);
    if (existingUser) {
      return { success: false, error: "Email already registered" };
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 12);

    // Create user
    const user = await createUser({
      email: data.email,
      username: data.username,
      password_hash: passwordHash,
      role: data.role,
      display_name: data.displayName,
      phone: data.phone,
      location: data.location,
      business_name: data.businessName,
      business_type: data.businessType,
      licensed_states: data.licensedStates,
    });

    return { success: true, user };
  } catch (error) {
    console.error("[AUTH] Registration error:", error);
    return { success: false, error: "Registration failed" };
  }
}

// Helper to get current user from database (fresh data)
export async function getCurrentUser(userId: string): Promise<DbUser | null> {
  return getUserById(userId);
}
