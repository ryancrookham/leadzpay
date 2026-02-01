// Authentication utilities - simple synchronous approach for reliability

// Simple hash function (synchronous, works everywhere)
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to positive hex string and pad
  const positiveHash = (hash >>> 0).toString(16);

  // Create a longer hash by hashing multiple times with different seeds
  let fullHash = positiveHash;
  for (let seed = 1; seed <= 7; seed++) {
    let seedHash = seed;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      seedHash = ((seedHash << 5) - seedHash + seed) + char;
      seedHash = seedHash & seedHash;
    }
    fullHash += (seedHash >>> 0).toString(16).padStart(8, '0');
  }

  return fullHash;
}

// Generate a random salt for password hashing
export function generateSalt(): string {
  const array = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < 16; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Generate a random session token
export function generateSessionToken(): string {
  const array = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < 32; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Hash password with salt - SYNCHRONOUS version
export function hashPasswordSync(password: string, salt: string): string {
  return simpleHash(password + salt + password.length + salt.length);
}

// Async wrapper for backwards compatibility
export async function hashPassword(
  password: string,
  salt: string
): Promise<string> {
  return hashPasswordSync(password, salt);
}

// Verify password against stored hash - SYNCHRONOUS version
export function verifyPasswordSync(
  password: string,
  salt: string,
  storedHash: string
): boolean {
  const hash = hashPasswordSync(password, salt);
  return hash === storedHash;
}

// Legacy SHA-256 hash for backward compatibility with existing accounts
async function legacyHashPassword(password: string, salt: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(password + salt);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    // crypto.subtle not available
  }
  return "";
}

// Async wrapper - tries new hash first, then legacy hash for backward compatibility
export async function verifyPassword(
  password: string,
  salt: string,
  storedHash: string
): Promise<boolean> {
  // Try new simple hash first
  const newHash = hashPasswordSync(password, salt);
  console.log("[VERIFY] New hash:", newHash.substring(0, 20) + "...");
  console.log("[VERIFY] Stored hash:", storedHash.substring(0, 20) + "...");
  console.log("[VERIFY] Match:", newHash === storedHash);

  if (newHash === storedHash) {
    return true;
  }

  // Try legacy SHA-256 hash for existing accounts
  try {
    const legacyHash = await legacyHashPassword(password, salt);
    console.log("[VERIFY] Legacy hash:", legacyHash ? legacyHash.substring(0, 20) + "..." : "failed");
    if (legacyHash && legacyHash === storedHash) {
      console.log("[VERIFY] Legacy match!");
      return true;
    }
  } catch {
    console.log("[VERIFY] Legacy hash exception");
  }

  console.log("[VERIFY] No match found");
  return false;
}

// Generate unique user ID
export function generateUserId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Session expiry time (7 days)
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// Create session expiry date
export function getSessionExpiry(): string {
  return new Date(Date.now() + SESSION_DURATION_MS).toISOString();
}

// Check if session is expired
export function isSessionExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

// Validate email format
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validate password strength (minimum 8 characters, at least one number and one letter)
export function isValidPassword(password: string): {
  valid: boolean;
  message: string;
} {
  if (password.length < 8) {
    return { valid: false, message: "Password must be at least 8 characters" };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one letter",
    };
  }
  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one number",
    };
  }
  return { valid: true, message: "" };
}

// Validate username (3-20 characters, alphanumeric and underscores only)
export function isValidUsername(username: string): {
  valid: boolean;
  message: string;
} {
  if (username.length < 3) {
    return { valid: false, message: "Username must be at least 3 characters" };
  }
  if (username.length > 20) {
    return { valid: false, message: "Username cannot exceed 20 characters" };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return {
      valid: false,
      message: "Username can only contain letters, numbers, and underscores",
    };
  }
  return { valid: true, message: "" };
}

// Format phone number for display
export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

// Validate phone number (US format)
export function isValidPhoneNumber(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, "");
  return cleaned.length === 10;
}
