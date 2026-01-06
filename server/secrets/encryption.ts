import crypto from "crypto";

/**
 * Secrets encryption module using AES-256-GCM
 * 
 * Features:
 * - AES-256-GCM authenticated encryption
 * - PBKDF2 key derivation
 * - Random IV for each encryption
 * - Authentication tag verification
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits
const ITERATIONS = 100000;

// Cache the encryption key to ensure consistency within a process
let cachedEncryptionKey: string | null = null;

/**
 * Get encryption key from environment or generate one
 */
function getEncryptionKey(): string {
  if (cachedEncryptionKey) {
    return cachedEncryptionKey;
  }
  
  const envKey = process.env.SECRETS_ENCRYPTION_KEY;
  if (envKey && envKey.length >= 32) {
    cachedEncryptionKey = envKey;
    return cachedEncryptionKey;
  }
  
  // Generate a random key if not set (for development/testing)
  console.warn("[Secrets] SECRETS_ENCRYPTION_KEY not set, using random key (data will not persist across restarts)");
  cachedEncryptionKey = crypto.randomBytes(32).toString("hex");
  return cachedEncryptionKey;
}

/**
 * Derive encryption key from password using PBKDF2
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, "sha256");
}

/**
 * Encrypt a plaintext value
 * Returns base64-encoded string: salt:iv:authTag:ciphertext
 */
export function encrypt(plaintext: string): string {
  const password = getEncryptionKey();
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(password, salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  
  const authTag = cipher.getAuthTag();
  
  // Combine: salt:iv:authTag:ciphertext
  const combined = Buffer.concat([
    salt,
    iv,
    authTag,
    Buffer.from(encrypted, "base64"),
  ]);
  
  return combined.toString("base64");
}

/**
 * Decrypt an encrypted value
 * Input format: base64-encoded salt:iv:authTag:ciphertext
 */
export function decrypt(encrypted: string): string {
  try {
    const password = getEncryptionKey();
    const combined = Buffer.from(encrypted, "base64");
    
    // Extract components
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = combined.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + TAG_LENGTH
    );
    const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    const key = deriveKey(password, salt);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext.toString("base64"), "base64", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } catch (error) {
    console.error("[Decryption] Failed to decrypt:", error);
    throw new Error("Decryption failed");
  }
}

/**
 * Redact a value for logging/display
 */
export function redact(value: string | null | undefined): string {
  if (!value) return "";
  return "***REDACTED***";
}

/**
 * Check if a string is a secret reference ({{secret:key}})
 */
export function isSecretReference(value: string): boolean {
  return /^\{\{secret:[a-zA-Z0-9_-]+\}\}$/.test(value);
}

/**
 * Extract secret key from reference
 * {{secret:api_key}} -> "api_key"
 */
export function extractSecretKey(reference: string): string | null {
  const match = reference.match(/^\{\{secret:([a-zA-Z0-9_-]+)\}\}$/);
  return match ? match[1] : null;
}

/**
 * Create a secret reference
 * "api_key" -> "{{secret:api_key}}"
 */
export function createSecretReference(key: string): string {
  return `{{secret:${key}}}`;
}
