/**
 * PII Encryption Utilities
 *
 * Uses AES-256-GCM for encrypting sensitive personal data.
 * The encryption key should be stored in ENCRYPTION_KEY environment variable.
 *
 * This module works both client-side and server-side.
 */

// Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// Convert Uint8Array to hex string
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Convert string to Uint8Array
function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// Convert Uint8Array to string
function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

// Get crypto implementation (works in both Node.js and browser)
function getCrypto(): Crypto {
  if (typeof globalThis.crypto !== "undefined") {
    return globalThis.crypto;
  }
  throw new Error("Web Crypto API not available");
}

// Generate a random IV (Initialization Vector)
function generateIV(): Uint8Array {
  const iv = new Uint8Array(12); // 96 bits for GCM
  getCrypto().getRandomValues(iv);
  return iv;
}

// Get encryption key from environment or derive from session
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = process.env.ENCRYPTION_KEY || process.env.NEXT_PUBLIC_ENCRYPTION_KEY;

  if (!keyHex) {
    throw new Error("ENCRYPTION_KEY not configured");
  }

  if (keyHex.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes (64 hex characters)");
  }

  const keyBytes = hexToBytes(keyHex);

  return getCrypto().subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "AES-GCM", length: 256 },
    false, // not extractable
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt data using AES-256-GCM
 *
 * @param data - The data to encrypt (object will be JSON stringified)
 * @returns Object containing encrypted data and IV (both as hex strings)
 */
export async function encrypt(data: unknown): Promise<{ encrypted: string; iv: string }> {
  try {
    const key = await getEncryptionKey();
    const iv = generateIV();

    const plaintext = typeof data === "string" ? data : JSON.stringify(data);
    const plaintextBytes = stringToBytes(plaintext);

    const encryptedBuffer = await getCrypto().subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      plaintextBytes as BufferSource
    );

    return {
      encrypted: bytesToHex(new Uint8Array(encryptedBuffer)),
      iv: bytesToHex(iv),
    };
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt data");
  }
}

/**
 * Decrypt data using AES-256-GCM
 *
 * @param encrypted - Encrypted data as hex string
 * @param iv - Initialization vector as hex string
 * @returns Decrypted string (parse as JSON if needed)
 */
export async function decrypt(encrypted: string, iv: string): Promise<string> {
  try {
    const key = await getEncryptionKey();
    const encryptedBytes = hexToBytes(encrypted);
    const ivBytes = hexToBytes(iv);

    const decryptedBuffer = await getCrypto().subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes as BufferSource },
      key,
      encryptedBytes as BufferSource
    );

    return bytesToString(new Uint8Array(decryptedBuffer));
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt data");
  }
}

/**
 * Decrypt and parse JSON data
 */
export async function decryptJSON<T>(encrypted: string, iv: string): Promise<T> {
  const decrypted = await decrypt(encrypted, iv);
  return JSON.parse(decrypted) as T;
}

/**
 * Check if encryption is configured
 */
export function isEncryptionConfigured(): boolean {
  const key = process.env.ENCRYPTION_KEY || process.env.NEXT_PUBLIC_ENCRYPTION_KEY;
  return !!key && key.length === 64;
}

/**
 * Generate a new encryption key (for setup purposes)
 * Run this and save the output to ENCRYPTION_KEY env var
 */
export function generateEncryptionKey(): string {
  const keyBytes = new Uint8Array(32);
  getCrypto().getRandomValues(keyBytes);
  return bytesToHex(keyBytes);
}

// ============================================
// PII-specific helpers
// ============================================

/**
 * Customer PII data structure
 */
export interface CustomerPII {
  firstName: string;
  lastName: string;
  middleName?: string;
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  age: number;
  gender: string;

  // License info
  licenseNumber: string;
  licenseState: string;
  licenseExpiration: string;

  // Address
  street: string;
  city: string;
  state: string;
  zipCode: string;
  fullAddress: string;
}

/**
 * Encrypt customer PII data
 */
export async function encryptCustomerPII(
  pii: CustomerPII
): Promise<{ encrypted: string; iv: string }> {
  return encrypt(pii);
}

/**
 * Decrypt customer PII data
 */
export async function decryptCustomerPII(
  encrypted: string,
  iv: string
): Promise<CustomerPII> {
  return decryptJSON<CustomerPII>(encrypted, iv);
}

/**
 * Mask sensitive data for display (e.g., "John ***" for name)
 */
export function maskPII(value: string, visibleChars: number = 3): string {
  if (!value || value.length <= visibleChars) {
    return "***";
  }
  return value.substring(0, visibleChars) + "***";
}

/**
 * Mask email for display (e.g., "j***@example.com")
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes("@")) {
    return "***@***.***";
  }
  const [local, domain] = email.split("@");
  const maskedLocal = local.length > 1 ? local[0] + "***" : "***";
  return `${maskedLocal}@${domain}`;
}

/**
 * Mask phone for display (e.g., "***-***-5678")
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 4) {
    return "***-***-****";
  }
  const digits = phone.replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return `***-***-${last4}`;
}

/**
 * Mask license number for display (e.g., "***789")
 */
export function maskLicenseNumber(licenseNumber: string): string {
  if (!licenseNumber || licenseNumber.length < 3) {
    return "******";
  }
  const last3 = licenseNumber.slice(-3);
  return `***${last3}`;
}

// ============================================
// Client-side encryption key derivation
// ============================================

/**
 * Derive an encryption key from a password/session token
 * Useful for client-side encryption where env vars aren't available
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: string
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  const saltBytes = encoder.encode(salt);

  // Import password as key material
  const keyMaterial = await getCrypto().subtle.importKey(
    "raw",
    passwordBytes as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  // Derive AES key using PBKDF2
  return getCrypto().subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes as BufferSource,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt with a derived key (client-side use)
 */
export async function encryptWithKey(
  data: unknown,
  key: CryptoKey
): Promise<{ encrypted: string; iv: string }> {
  const iv = generateIV();
  const plaintext = typeof data === "string" ? data : JSON.stringify(data);
  const plaintextBytes = stringToBytes(plaintext);

  const encryptedBuffer = await getCrypto().subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    plaintextBytes as BufferSource
  );

  return {
    encrypted: bytesToHex(new Uint8Array(encryptedBuffer)),
    iv: bytesToHex(iv),
  };
}

/**
 * Decrypt with a derived key (client-side use)
 */
export async function decryptWithKey(
  encrypted: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  const encryptedBytes = hexToBytes(encrypted);
  const ivBytes = hexToBytes(iv);

  const decryptedBuffer = await getCrypto().subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes as BufferSource },
    key,
    encryptedBytes as BufferSource
  );

  return bytesToString(new Uint8Array(decryptedBuffer));
}
