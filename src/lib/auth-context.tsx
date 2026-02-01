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
  UserCredentials,
  Session,
  BuyerRegistrationData,
  ProviderRegistrationData,
  getDefaultBuyerStats,
  getDefaultProviderStats,
  isBuyer,
  isProvider,
} from "./auth-types";
import {
  generateSalt,
  generateSessionToken,
  hashPassword,
  verifyPassword,
  generateUserId,
  getSessionExpiry,
  isSessionExpired,
  isValidEmail,
  isValidPassword,
  isValidUsername,
} from "./auth-utils";

// LocalStorage keys
const STORAGE_KEYS = {
  USERS: "leadzpay_users",
  CREDENTIALS: "leadzpay_credentials",
  SESSION: "leadzpay_session",
};

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; role?: "buyer" | "provider" }>;
  logout: () => void;
  registerBuyer: (data: BuyerRegistrationData) => Promise<{ success: boolean; error?: string }>;
  registerProvider: (data: ProviderRegistrationData) => Promise<{ success: boolean; error?: string }>;
  updateUser: (updates: Partial<User>) => void;
  getAllUsers: () => User[];
  getUserById: (id: string) => User | undefined;
  getUsersByRole: (role: "buyer" | "provider") => User[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load session on mount
  useEffect(() => {
    const loadSession = () => {
      console.log("[AUTH] loadSession starting...");
      try {
        const sessionData = localStorage.getItem(STORAGE_KEYS.SESSION);
        console.log("[AUTH] Session data exists:", !!sessionData);

        if (!sessionData) {
          console.log("[AUTH] No session found, not authenticated");
          setIsLoading(false);
          return;
        }

        let session: Session;
        try {
          session = JSON.parse(sessionData);
          console.log("[AUTH] Parsed session for user:", session.userId, "role:", session.role);
        } catch {
          console.log("[AUTH] Failed to parse session data");
          localStorage.removeItem(STORAGE_KEYS.SESSION);
          setIsLoading(false);
          return;
        }

        // Validate session has required fields
        if (!session.userId || !session.role || !session.expiresAt) {
          console.log("[AUTH] Session missing required fields:", { userId: !!session.userId, role: !!session.role, expiresAt: !!session.expiresAt });
          localStorage.removeItem(STORAGE_KEYS.SESSION);
          setIsLoading(false);
          return;
        }

        // Check if session is expired
        if (isSessionExpired(session.expiresAt)) {
          console.log("[AUTH] Session expired at:", session.expiresAt);
          localStorage.removeItem(STORAGE_KEYS.SESSION);
          setIsLoading(false);
          return;
        }

        // Load user data
        const usersData = localStorage.getItem(STORAGE_KEYS.USERS);
        console.log("[AUTH] Users data exists:", !!usersData);

        if (!usersData) {
          console.log("[AUTH] No users data found");
          localStorage.removeItem(STORAGE_KEYS.SESSION);
          setIsLoading(false);
          return;
        }

        let users: User[];
        try {
          users = JSON.parse(usersData);
          console.log("[AUTH] Found", users.length, "users in storage");
        } catch {
          console.log("[AUTH] Failed to parse users data");
          localStorage.removeItem(STORAGE_KEYS.SESSION);
          localStorage.removeItem(STORAGE_KEYS.USERS);
          localStorage.removeItem(STORAGE_KEYS.CREDENTIALS);
          setIsLoading(false);
          return;
        }

        const user = users.find((u) => u.id === session.userId);
        console.log("[AUTH] Found user for session:", !!user, user?.isActive ? "active" : "inactive");

        if (user && user.isActive) {
          console.log("[AUTH] Setting currentUser:", user.email, user.role);
          setCurrentUser(user);
        } else {
          console.log("[AUTH] User not found or inactive, clearing session");
          localStorage.removeItem(STORAGE_KEYS.SESSION);
        }
      } catch (error) {
        console.error("[AUTH] Error loading session:", error);
        localStorage.removeItem(STORAGE_KEYS.SESSION);
        localStorage.removeItem(STORAGE_KEYS.USERS);
        localStorage.removeItem(STORAGE_KEYS.CREDENTIALS);
      }
      console.log("[AUTH] loadSession complete, setting isLoading=false");
      setIsLoading(false);
    };

    loadSession();
  }, []);

  const login = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ success: boolean; error?: string; role?: "buyer" | "provider" }> => {
      console.log("[AUTH] Login attempt for:", email);

      // Input validation
      if (!email || !password) {
        console.log("[AUTH] Login failed: missing email or password");
        return { success: false, error: "Email and password are required" };
      }

      try {
        // Get credentials from localStorage
        const credentialsData = localStorage.getItem(STORAGE_KEYS.CREDENTIALS);
        console.log("[AUTH] Credentials data exists:", !!credentialsData);

        if (!credentialsData) {
          return { success: false, error: "No account found. Please register first." };
        }

        let credentials: UserCredentials[];
        try {
          credentials = JSON.parse(credentialsData);
          console.log("[AUTH] Found", credentials.length, "credentials");
        } catch {
          return { success: false, error: "Account data corrupted. Please clear browser data and register again." };
        }

        // Find user credentials by email
        const userCreds = credentials.find(
          (c) => c.email.toLowerCase() === email.toLowerCase().trim()
        );

        if (!userCreds) {
          console.log("[AUTH] No credentials found for email:", email.toLowerCase().trim());
          console.log("[AUTH] Available emails:", credentials.map(c => c.email));
          return { success: false, error: "Invalid email or password" };
        }

        console.log("[AUTH] Found credentials for user:", userCreds.id);

        // Verify password (tries both new and legacy hash methods)
        const isValid = await verifyPassword(password, userCreds.salt, userCreds.passwordHash);
        console.log("[AUTH] Password verification result:", isValid);

        if (!isValid) {
          return { success: false, error: "Invalid email or password" };
        }

        // Get user profile data
        const usersData = localStorage.getItem(STORAGE_KEYS.USERS);
        if (!usersData) {
          console.log("[AUTH] No users data in localStorage");
          return { success: false, error: "User profile not found" };
        }

        let users: User[];
        try {
          users = JSON.parse(usersData);
          console.log("[AUTH] Found", users.length, "users");
        } catch {
          return { success: false, error: "User data corrupted" };
        }

        const user = users.find((u) => u.id === userCreds.id);

        if (!user) {
          console.log("[AUTH] User not found with id:", userCreds.id);
          return { success: false, error: "User profile not found" };
        }

        if (!user.isActive) {
          console.log("[AUTH] User account is deactivated");
          return { success: false, error: "Account is deactivated" };
        }

        // Create new session
        const session: Session = {
          userId: user.id,
          role: user.role,
          token: generateSessionToken(),
          expiresAt: getSessionExpiry(),
          createdAt: new Date().toISOString(),
        };

        // Save session and update state
        localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
        setCurrentUser(user);

        console.log("[AUTH] Login successful! Role:", user.role);
        console.log("[AUTH] Session saved:", session.userId);

        return { success: true, role: user.role };
      } catch (error) {
        console.error("[AUTH] Login exception:", error);
        const message = error instanceof Error ? error.message : "Login failed";
        return { success: false, error: message };
      }
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    setCurrentUser(null);
  }, []);

  const registerBuyer = useCallback(
    async (
      data: BuyerRegistrationData
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        // Validate email
        if (!isValidEmail(data.email)) {
          return { success: false, error: "Invalid email format" };
        }

        // Validate password
        const passwordValidation = isValidPassword(data.password);
        if (!passwordValidation.valid) {
          return { success: false, error: passwordValidation.message };
        }

        // Validate username
        const usernameValidation = isValidUsername(data.username);
        if (!usernameValidation.valid) {
          return { success: false, error: usernameValidation.message };
        }

        // Check if email already exists
        const credentialsData = localStorage.getItem(STORAGE_KEYS.CREDENTIALS);
        const credentials: UserCredentials[] = credentialsData
          ? JSON.parse(credentialsData)
          : [];

        if (
          credentials.some(
            (c) => c.email.toLowerCase() === data.email.toLowerCase()
          )
        ) {
          return { success: false, error: "Email already registered" };
        }

        // Check if username already exists
        const usersData = localStorage.getItem(STORAGE_KEYS.USERS);
        const users: User[] = usersData ? JSON.parse(usersData) : [];

        if (
          users.some(
            (u) => u.username.toLowerCase() === data.username.toLowerCase()
          )
        ) {
          return { success: false, error: "Username already taken" };
        }

        // Create user
        const userId = generateUserId();
        const salt = generateSalt();
        const passwordHash = await hashPassword(data.password, salt);

        // Store credentials
        const newCredentials: UserCredentials = {
          id: userId,
          email: data.email.toLowerCase(),
          passwordHash,
          salt,
          role: "buyer",
        };
        credentials.push(newCredentials);
        localStorage.setItem(
          STORAGE_KEYS.CREDENTIALS,
          JSON.stringify(credentials)
        );

        // Store user profile
        const now = new Date().toISOString();
        const newUser: LeadBuyer = {
          id: userId,
          email: data.email.toLowerCase(),
          username: data.username,
          role: "buyer",
          businessName: data.businessName,
          businessType: data.businessType,
          phone: data.phone,
          // Licensing compliance fields
          licensedStates: data.licensedStates || [],
          nationalProducerNumber: data.nationalProducerNumber,
          licenseVerified: false, // Pending verification
          complianceAcknowledgedAt: data.complianceAcknowledged ? now : undefined,
          stats: {
            ...getDefaultBuyerStats(),
            memberSince: now,
          },
          connectionIds: [],
          createdAt: now,
          updatedAt: now,
          isActive: true,
        };

        users.push(newUser);
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));

        // Auto-login
        const session: Session = {
          userId: newUser.id,
          role: newUser.role,
          token: generateSessionToken(),
          expiresAt: getSessionExpiry(),
          createdAt: now,
        };

        localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
        setCurrentUser(newUser);

        return { success: true };
      } catch (error) {
        console.error("Registration error:", error);
        return { success: false, error: "An error occurred during registration" };
      }
    },
    []
  );

  const registerProvider = useCallback(
    async (
      data: ProviderRegistrationData
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        // Validate email
        if (!isValidEmail(data.email)) {
          return { success: false, error: "Invalid email format" };
        }

        // Validate password
        const passwordValidation = isValidPassword(data.password);
        if (!passwordValidation.valid) {
          return { success: false, error: passwordValidation.message };
        }

        // Validate username
        const usernameValidation = isValidUsername(data.username);
        if (!usernameValidation.valid) {
          return { success: false, error: usernameValidation.message };
        }

        // Check if email already exists
        const credentialsData = localStorage.getItem(STORAGE_KEYS.CREDENTIALS);
        const credentials: UserCredentials[] = credentialsData
          ? JSON.parse(credentialsData)
          : [];

        if (
          credentials.some(
            (c) => c.email.toLowerCase() === data.email.toLowerCase()
          )
        ) {
          return { success: false, error: "Email already registered" };
        }

        // Check if username already exists
        const usersData = localStorage.getItem(STORAGE_KEYS.USERS);
        const users: User[] = usersData ? JSON.parse(usersData) : [];

        if (
          users.some(
            (u) => u.username.toLowerCase() === data.username.toLowerCase()
          )
        ) {
          return { success: false, error: "Username already taken" };
        }

        // Create user
        const userId = generateUserId();
        const salt = generateSalt();
        const passwordHash = await hashPassword(data.password, salt);

        // Store credentials
        const newCredentials: UserCredentials = {
          id: userId,
          email: data.email.toLowerCase(),
          passwordHash,
          salt,
          role: "provider",
        };
        credentials.push(newCredentials);
        localStorage.setItem(
          STORAGE_KEYS.CREDENTIALS,
          JSON.stringify(credentials)
        );

        // Store user profile
        const now = new Date().toISOString();
        const newUser: LeadProvider = {
          id: userId,
          email: data.email.toLowerCase(),
          username: data.username,
          role: "provider",
          displayName: data.displayName,
          phone: data.phone,
          location: data.location,
          stats: {
            ...getDefaultProviderStats(),
            memberSince: now,
          },
          connectionIds: [],
          createdAt: now,
          updatedAt: now,
          isActive: true,
        };

        users.push(newUser);
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));

        // Auto-login
        const session: Session = {
          userId: newUser.id,
          role: newUser.role,
          token: generateSessionToken(),
          expiresAt: getSessionExpiry(),
          createdAt: now,
        };

        localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
        setCurrentUser(newUser);

        return { success: true };
      } catch (error) {
        console.error("Registration error:", error);
        return { success: false, error: "An error occurred during registration" };
      }
    },
    []
  );

  const updateUser = useCallback(
    (updates: Partial<User>) => {
      if (!currentUser) return;

      const usersData = localStorage.getItem(STORAGE_KEYS.USERS);
      if (!usersData) return;

      const users: User[] = JSON.parse(usersData);
      const updatedUsers = users.map((u) =>
        u.id === currentUser.id
          ? { ...u, ...updates, updatedAt: new Date().toISOString() }
          : u
      );

      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));

      const updatedUser = updatedUsers.find((u) => u.id === currentUser.id);
      if (updatedUser) {
        setCurrentUser(updatedUser as User);
      }
    },
    [currentUser]
  );

  const getAllUsers = useCallback((): User[] => {
    const usersData = localStorage.getItem(STORAGE_KEYS.USERS);
    return usersData ? JSON.parse(usersData) : [];
  }, []);

  const getUserById = useCallback((id: string): User | undefined => {
    const users = getAllUsers();
    return users.find((u) => u.id === id);
  }, [getAllUsers]);

  const getUsersByRole = useCallback(
    (role: "buyer" | "provider"): User[] => {
      const users = getAllUsers();
      return users.filter((u) => u.role === role);
    },
    [getAllUsers]
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
