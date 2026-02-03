"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
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
import { supabase, isSupabaseConfigured } from "./supabase";
import type { User as SupabaseUser, Session } from "@supabase/supabase-js";

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

// Helper to convert Supabase profile to User type
function profileToUser(profile: Record<string, unknown>): User {
  const role = profile.role as "buyer" | "provider";
  const now = new Date().toISOString();

  if (role === "buyer") {
    const buyer: LeadBuyer = {
      id: profile.id as string,
      email: profile.email as string,
      username: profile.username as string,
      role: "buyer",
      businessName: (profile.business_name as string) || "",
      businessType: (profile.business_type as LeadBuyer["businessType"]) || "other",
      phone: (profile.phone as string) || "",
      licensedStates: (profile.licensed_states as string[]) || [],
      nationalProducerNumber: profile.national_producer_number as string | undefined,
      licenseVerified: (profile.license_verified as boolean) || false,
      complianceAcknowledgedAt: profile.compliance_acknowledged_at as string | undefined,
      stats: (profile.stats as LeadBuyer["stats"]) || {
        ...getDefaultBuyerStats(),
        memberSince: (profile.created_at as string) || now,
      },
      connectionIds: (profile.connection_ids as string[]) || [],
      createdAt: (profile.created_at as string) || now,
      updatedAt: (profile.updated_at as string) || now,
      isActive: profile.is_active !== false,
    };
    return buyer;
  } else {
    const provider: LeadProvider = {
      id: profile.id as string,
      email: profile.email as string,
      username: profile.username as string,
      role: "provider",
      displayName: (profile.display_name as string) || "",
      phone: profile.phone as string | undefined,
      location: profile.location as string | undefined,
      stats: (profile.stats as LeadProvider["stats"]) || {
        ...getDefaultProviderStats(),
        memberSince: (profile.created_at as string) || now,
      },
      connectionIds: (profile.connection_ids as string[]) || [],
      createdAt: (profile.created_at as string) || now,
      updatedAt: (profile.updated_at as string) || now,
      isActive: profile.is_active !== false,
    };
    return provider;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch user profile from Supabase
  const fetchProfile = useCallback(async (userId: string): Promise<User | null> => {
    if (!isSupabaseConfigured()) {
      console.warn("[AUTH] Supabase not configured");
      return null;
    }

    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("[AUTH] Error fetching profile:", error);
        return null;
      }

      if (!profile) {
        console.log("[AUTH] No profile found for user:", userId);
        return null;
      }

      return profileToUser(profile);
    } catch (error) {
      console.error("[AUTH] Exception fetching profile:", error);
      return null;
    }
  }, []);

  // Initialize auth state
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      console.warn("[AUTH] Supabase not configured, auth disabled");
      setIsLoading(false);
      return;
    }

    // Get initial session
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          const user = await fetchProfile(session.user.id);
          setCurrentUser(user);
        }
      } catch (error) {
        console.error("[AUTH] Error initializing auth:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("[AUTH] Auth state changed:", event);

        if (event === "SIGNED_IN" && session?.user) {
          const user = await fetchProfile(session.user.id);
          setCurrentUser(user);
        } else if (event === "SIGNED_OUT") {
          setCurrentUser(null);
        } else if (event === "TOKEN_REFRESHED" && session?.user) {
          // Refresh profile on token refresh
          const user = await fetchProfile(session.user.id);
          setCurrentUser(user);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const login = useCallback(
    async (
      email: string,
      password: string,
      staySignedIn: boolean = false
    ): Promise<{ success: boolean; error?: string; role?: "buyer" | "provider" }> => {
      if (!isSupabaseConfigured()) {
        return { success: false, error: "Authentication service not configured" };
      }

      console.log("[AUTH] Login attempt for:", email);

      if (!email || !password) {
        return { success: false, error: "Email and password are required" };
      }

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        if (error) {
          console.error("[AUTH] Login error:", error.message);
          if (error.message.includes("Invalid login credentials")) {
            return { success: false, error: "Invalid email or password" };
          }
          return { success: false, error: error.message };
        }

        if (!data.user) {
          return { success: false, error: "Login failed" };
        }

        // Fetch profile to get role
        const profile = await fetchProfile(data.user.id);
        if (!profile) {
          return { success: false, error: "User profile not found" };
        }

        if (!profile.isActive) {
          await supabase.auth.signOut();
          return { success: false, error: "Account is deactivated" };
        }

        setCurrentUser(profile);
        console.log("[AUTH] Login successful! Role:", profile.role);

        return { success: true, role: profile.role };
      } catch (error) {
        console.error("[AUTH] Login exception:", error);
        const message = error instanceof Error ? error.message : "Login failed";
        return { success: false, error: message };
      }
    },
    [fetchProfile]
  );

  const logout = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setCurrentUser(null);
      return;
    }

    try {
      await supabase.auth.signOut();
      setCurrentUser(null);
    } catch (error) {
      console.error("[AUTH] Logout error:", error);
      setCurrentUser(null);
    }
  }, []);

  const registerBuyer = useCallback(
    async (
      data: BuyerRegistrationData
    ): Promise<{ success: boolean; error?: string }> => {
      if (!isSupabaseConfigured()) {
        return { success: false, error: "Authentication service not configured" };
      }

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
        if (!/[a-zA-Z]/.test(data.password) || !/[0-9]/.test(data.password)) {
          return { success: false, error: "Password must contain at least one letter and one number" };
        }

        // Validate username
        if (data.username.length < 3) {
          return { success: false, error: "Username must be at least 3 characters" };
        }

        // Sign up with Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: data.email.toLowerCase().trim(),
          password: data.password,
          options: {
            data: {
              username: data.username,
              role: "buyer",
              businessName: data.businessName,
              businessType: data.businessType,
              phone: data.phone,
              licensedStates: JSON.stringify(data.licensedStates),
              nationalProducerNumber: data.nationalProducerNumber || null,
              complianceAcknowledged: data.complianceAcknowledged,
            },
          },
        });

        if (authError) {
          console.error("[AUTH] Registration error:", authError.message);
          if (authError.message.includes("already registered")) {
            return { success: false, error: "Email already registered" };
          }
          return { success: false, error: authError.message };
        }

        if (!authData.user) {
          return { success: false, error: "Registration failed" };
        }

        // Wait briefly for the trigger to create the profile
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Fetch the created profile
        const profile = await fetchProfile(authData.user.id);
        if (profile) {
          setCurrentUser(profile);
        }

        return { success: true };
      } catch (error) {
        console.error("[AUTH] Registration exception:", error);
        return { success: false, error: "An error occurred during registration" };
      }
    },
    [fetchProfile]
  );

  const registerProvider = useCallback(
    async (
      data: ProviderRegistrationData
    ): Promise<{ success: boolean; error?: string }> => {
      if (!isSupabaseConfigured()) {
        return { success: false, error: "Authentication service not configured" };
      }

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
        if (!/[a-zA-Z]/.test(data.password) || !/[0-9]/.test(data.password)) {
          return { success: false, error: "Password must contain at least one letter and one number" };
        }

        // Validate username
        if (data.username.length < 3) {
          return { success: false, error: "Username must be at least 3 characters" };
        }

        // Sign up with Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: data.email.toLowerCase().trim(),
          password: data.password,
          options: {
            data: {
              username: data.username,
              role: "provider",
              displayName: data.displayName,
              phone: data.phone || null,
              location: data.location || null,
            },
          },
        });

        if (authError) {
          console.error("[AUTH] Registration error:", authError.message);
          if (authError.message.includes("already registered")) {
            return { success: false, error: "Email already registered" };
          }
          return { success: false, error: authError.message };
        }

        if (!authData.user) {
          return { success: false, error: "Registration failed" };
        }

        // Wait briefly for the trigger to create the profile
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Fetch the created profile
        const profile = await fetchProfile(authData.user.id);
        if (profile) {
          setCurrentUser(profile);
        }

        return { success: true };
      } catch (error) {
        console.error("[AUTH] Registration exception:", error);
        return { success: false, error: "An error occurred during registration" };
      }
    },
    [fetchProfile]
  );

  const updateUser = useCallback(
    async (updates: Partial<User>) => {
      if (!currentUser || !isSupabaseConfigured()) return;

      try {
        // Convert camelCase to snake_case for Supabase
        // Use type assertion to access union type properties
        const updatesAny = updates as Record<string, unknown>;
        const snakeCaseUpdates: Record<string, unknown> = {};

        if ("businessName" in updatesAny && updatesAny.businessName !== undefined) {
          snakeCaseUpdates.business_name = updatesAny.businessName;
        }
        if ("businessType" in updatesAny && updatesAny.businessType !== undefined) {
          snakeCaseUpdates.business_type = updatesAny.businessType;
        }
        if ("phone" in updatesAny && updatesAny.phone !== undefined) {
          snakeCaseUpdates.phone = updatesAny.phone;
        }
        if ("displayName" in updatesAny && updatesAny.displayName !== undefined) {
          snakeCaseUpdates.display_name = updatesAny.displayName;
        }
        if ("location" in updatesAny && updatesAny.location !== undefined) {
          snakeCaseUpdates.location = updatesAny.location;
        }
        if ("licensedStates" in updatesAny && updatesAny.licensedStates !== undefined) {
          snakeCaseUpdates.licensed_states = updatesAny.licensedStates;
        }
        if ("stats" in updatesAny && updatesAny.stats !== undefined) {
          snakeCaseUpdates.stats = updatesAny.stats;
        }
        if ("connectionIds" in updatesAny && updatesAny.connectionIds !== undefined) {
          snakeCaseUpdates.connection_ids = updatesAny.connectionIds;
        }
        if ("isActive" in updatesAny && updatesAny.isActive !== undefined) {
          snakeCaseUpdates.is_active = updatesAny.isActive;
        }

        const { error } = await supabase
          .from("profiles")
          .update(snakeCaseUpdates)
          .eq("id", currentUser.id);

        if (error) {
          console.error("[AUTH] Update error:", error);
          return;
        }

        // Refresh local user state
        const updatedProfile = await fetchProfile(currentUser.id);
        if (updatedProfile) {
          setCurrentUser(updatedProfile);
        }
      } catch (error) {
        console.error("[AUTH] Update exception:", error);
      }
    },
    [currentUser, fetchProfile]
  );

  const getAllUsers = useCallback((): User[] => {
    // This would need to fetch from Supabase
    // For now, return empty - implement if needed
    console.warn("[AUTH] getAllUsers not fully implemented for Supabase");
    return [];
  }, []);

  const getUserById = useCallback((id: string): User | undefined => {
    // This would need to fetch from Supabase
    // For now, return undefined - implement if needed
    console.warn("[AUTH] getUserById not fully implemented for Supabase");
    return undefined;
  }, []);

  const getUsersByRole = useCallback(
    (role: "buyer" | "provider"): User[] => {
      // This would need to fetch from Supabase
      // For now, return empty - implement if needed
      console.warn("[AUTH] getUsersByRole not fully implemented for Supabase");
      return [];
    },
    []
  );

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser,
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
