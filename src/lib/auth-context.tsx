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
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
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
      try {
        const sessionData = localStorage.getItem(STORAGE_KEYS.SESSION);
        if (!sessionData) {
          setIsLoading(false);
          return;
        }

        const session: Session = JSON.parse(sessionData);

        // Check if session is expired
        if (isSessionExpired(session.expiresAt)) {
          localStorage.removeItem(STORAGE_KEYS.SESSION);
          setIsLoading(false);
          return;
        }

        // Load user data
        const usersData = localStorage.getItem(STORAGE_KEYS.USERS);
        if (!usersData) {
          setIsLoading(false);
          return;
        }

        const users: User[] = JSON.parse(usersData);
        const user = users.find((u) => u.id === session.userId);

        if (user) {
          setCurrentUser(user);
        } else {
          localStorage.removeItem(STORAGE_KEYS.SESSION);
        }
      } catch (error) {
        console.error("Error loading session:", error);
        localStorage.removeItem(STORAGE_KEYS.SESSION);
      }
      setIsLoading(false);
    };

    loadSession();
  }, []);

  const login = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        // Get credentials
        const credentialsData = localStorage.getItem(STORAGE_KEYS.CREDENTIALS);
        if (!credentialsData) {
          return { success: false, error: "Invalid email or password" };
        }

        const credentials: UserCredentials[] = JSON.parse(credentialsData);
        const userCreds = credentials.find(
          (c) => c.email.toLowerCase() === email.toLowerCase()
        );

        if (!userCreds) {
          return { success: false, error: "Invalid email or password" };
        }

        // Verify password
        const isValid = await verifyPassword(
          password,
          userCreds.salt,
          userCreds.passwordHash
        );
        if (!isValid) {
          return { success: false, error: "Invalid email or password" };
        }

        // Get user data
        const usersData = localStorage.getItem(STORAGE_KEYS.USERS);
        if (!usersData) {
          return { success: false, error: "User not found" };
        }

        const users: User[] = JSON.parse(usersData);
        const user = users.find((u) => u.id === userCreds.id);

        if (!user) {
          return { success: false, error: "User not found" };
        }

        if (!user.isActive) {
          return { success: false, error: "Account is deactivated" };
        }

        // Create session
        const session: Session = {
          userId: user.id,
          role: user.role,
          token: generateSessionToken(),
          expiresAt: getSessionExpiry(),
          createdAt: new Date().toISOString(),
        };

        localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
        setCurrentUser(user);

        return { success: true };
      } catch (error) {
        console.error("Login error:", error);
        return { success: false, error: "An error occurred during login" };
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
