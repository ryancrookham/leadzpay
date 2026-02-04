"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
} from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import {
  User,
  LeadBuyer,
  LeadProvider,
  BuyerRegistrationData,
  ProviderRegistrationData,
  getDefaultBuyerStats,
  getDefaultProviderStats,
  isBuyer,
  isProvider,
} from "./auth-types";

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (
    email: string,
    password: string,
    staySignedIn?: boolean
  ) => Promise<{ success: boolean; error?: string; role?: "buyer" | "provider" }>;
  logout: () => void;
  registerBuyer: (
    data: BuyerRegistrationData
  ) => Promise<{ success: boolean; error?: string }>;
  registerProvider: (
    data: ProviderRegistrationData
  ) => Promise<{ success: boolean; error?: string }>;
  updateUser: (updates: Partial<User>) => void;
  getAllUsers: () => User[];
  getUserById: (id: string) => User | undefined;
  getUsersByRole: (role: "buyer" | "provider") => User[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Convert NextAuth session user to our User type
function sessionToUser(sessionUser: {
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
}): User {
  const now = new Date().toISOString();

  if (sessionUser.role === "buyer") {
    const buyer: LeadBuyer = {
      id: sessionUser.id,
      email: sessionUser.email,
      username: sessionUser.username,
      role: "buyer",
      businessName: sessionUser.businessName || "",
      businessType: (sessionUser.businessType as LeadBuyer["businessType"]) || "other",
      phone: sessionUser.phone || "",
      licensedStates: sessionUser.licensedStates || [],
      licenseVerified: false,
      stats: {
        ...getDefaultBuyerStats(),
        memberSince: now,
      },
      connectionIds: [],
      createdAt: now,
      updatedAt: now,
      isActive: true,
    };
    return buyer;
  } else {
    const provider: LeadProvider = {
      id: sessionUser.id,
      email: sessionUser.email,
      username: sessionUser.username,
      role: "provider",
      displayName: sessionUser.displayName || sessionUser.username,
      phone: sessionUser.phone,
      location: sessionUser.location,
      stats: {
        ...getDefaultProviderStats(),
        memberSince: now,
      },
      connectionIds: [],
      createdAt: now,
      updatedAt: now,
      isActive: true,
    };
    return provider;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [updateTrigger, setUpdateTrigger] = useState(0);

  const isLoading = status === "loading";
  const isAuthenticated = !!session?.user;
  const currentUser = session?.user ? sessionToUser(session.user as Parameters<typeof sessionToUser>[0]) : null;

  const login = useCallback(
    async (
      email: string,
      password: string,
      _staySignedIn: boolean = false
    ): Promise<{ success: boolean; error?: string; role?: "buyer" | "provider" }> => {
      console.log("[AUTH] Login attempt for:", email);

      if (!email || !password) {
        return { success: false, error: "Email and password are required" };
      }

      try {
        const result = await signIn("credentials", {
          email: email.trim().toLowerCase(),
          password,
          redirect: false,
        });

        if (result?.error) {
          console.error("[AUTH] Login error:", result.error);
          return { success: false, error: "Invalid email or password" };
        }

        if (!result?.ok) {
          return { success: false, error: "Login failed" };
        }

        // Fetch the session to get the role
        const response = await fetch("/api/auth/session");
        const sessionData = await response.json();

        if (sessionData?.user?.role) {
          console.log("[AUTH] Login successful! Role:", sessionData.user.role);
          return { success: true, role: sessionData.user.role };
        }

        return { success: true };
      } catch (error) {
        console.error("[AUTH] Login exception:", error);
        const message = error instanceof Error ? error.message : "Login failed";
        return { success: false, error: message };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await signOut({ redirect: false });
    } catch (error) {
      console.error("[AUTH] Logout error:", error);
    }
  }, []);

  const registerBuyer = useCallback(
    async (
      data: BuyerRegistrationData
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
          return { success: false, error: "Invalid email format" };
        }

        // Validate password
        if (data.password.length < 8) {
          return { success: false, error: "Password must be at least 8 characters" };
        }

        // Validate username
        if (data.username.length < 3) {
          return { success: false, error: "Username must be at least 3 characters" };
        }

        // Call register API
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: data.email.toLowerCase().trim(),
            password: data.password,
            username: data.username,
            role: "buyer",
            businessName: data.businessName,
            businessType: data.businessType,
            phone: data.phone,
            licensedStates: data.licensedStates,
          }),
        });

        const result = await response.json();

        if (!result.success) {
          return { success: false, error: result.error || "Registration failed" };
        }

        // Auto login after registration
        const loginResult = await login(data.email, data.password);
        if (!loginResult.success) {
          return { success: true }; // Registration succeeded, login failed - user can login manually
        }

        return { success: true };
      } catch (error) {
        console.error("[AUTH] Registration exception:", error);
        return { success: false, error: "An error occurred during registration" };
      }
    },
    [login]
  );

  const registerProvider = useCallback(
    async (
      data: ProviderRegistrationData
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
          return { success: false, error: "Invalid email format" };
        }

        // Validate password
        if (data.password.length < 8) {
          return { success: false, error: "Password must be at least 8 characters" };
        }

        // Validate username
        if (data.username.length < 3) {
          return { success: false, error: "Username must be at least 3 characters" };
        }

        // Call register API
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: data.email.toLowerCase().trim(),
            password: data.password,
            username: data.username,
            role: "provider",
            displayName: data.displayName,
            phone: data.phone,
            location: data.location,
          }),
        });

        const result = await response.json();

        if (!result.success) {
          return { success: false, error: result.error || "Registration failed" };
        }

        // Auto login after registration
        const loginResult = await login(data.email, data.password);
        if (!loginResult.success) {
          return { success: true }; // Registration succeeded, login failed - user can login manually
        }

        return { success: true };
      } catch (error) {
        console.error("[AUTH] Registration exception:", error);
        return { success: false, error: "An error occurred during registration" };
      }
    },
    [login]
  );

  const updateUser = useCallback(
    async (_updates: Partial<User>) => {
      // TODO: Implement user update via API
      console.warn("[AUTH] updateUser not yet implemented");
      setUpdateTrigger((t) => t + 1);
    },
    []
  );

  const getAllUsers = useCallback((): User[] => {
    console.warn("[AUTH] getAllUsers not implemented");
    return [];
  }, []);

  const getUserById = useCallback((_id: string): User | undefined => {
    console.warn("[AUTH] getUserById not implemented");
    return undefined;
  }, []);

  const getUsersByRole = useCallback(
    (_role: "buyer" | "provider"): User[] => {
      console.warn("[AUTH] getUsersByRole not implemented");
      return [];
    },
    []
  );

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated,
        isLoading,
        login,
        logout,
        registerBuyer,
        registerProvider,
        updateUser,
        getAllUsers,
        getUserById,
        getUsersByRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Type guard hooks for convenience
export function useCurrentBuyer(): LeadBuyer | null {
  const { currentUser } = useAuth();
  return currentUser && isBuyer(currentUser) ? currentUser : null;
}

export function useCurrentProvider(): LeadProvider | null {
  const { currentUser } = useAuth();
  return currentUser && isProvider(currentUser) ? currentUser : null;
}
