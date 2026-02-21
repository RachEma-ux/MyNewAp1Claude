/**
 * Encryption utilities for sensitive data (API keys, credentials)
 * Uses AES-256-GCM for encryption
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Get encryption key from environment
 * Falls back to a default key for development (DO NOT USE IN PRODUCTION)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[Encryption] ENCRYPTION_KEY is required in production. Set it in your environment variables.");
    }
    console.warn('[Encryption] WARNING: No ENCRYPTION_KEY set. Using dev fallback (NOT safe for production)');
    return scryptSync('dev-fallback-key', randomBytes(0).toString() || 'dev-salt', KEY_LENGTH);
  }

  // Derive a key from the environment variable using a per-deployment salt
  // The salt is derived from the key itself to ensure different keys produce different derived keys
  const salt = Buffer.from(key.slice(0, SALT_LENGTH).padEnd(SALT_LENGTH, '0'));
  return scryptSync(key, salt, KEY_LENGTH);
}

/**
 * Encrypt a string value
 * Returns base64 encoded: salt + iv + tag + encrypted data
 */
export function encrypt(plaintext: string): string {
  try {
    const key = getEncryptionKey();

    // Generate random IV
    const iv = randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = createCipheriv(ALGORITHM, key, iv);

    // Encrypt
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get auth tag
    const tag = cipher.getAuthTag();

    // Combine: iv + tag + encrypted data
    const combined = Buffer.concat([
      iv,
      tag,
      Buffer.from(encrypted, 'hex')
    ]);

    // Return as base64
    return combined.toString('base64');
  } catch (error) {
    console.error('[Encryption] Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt an encrypted string
 * Expects base64 encoded: salt + iv + tag + encrypted data
 */
export function decrypt(ciphertext: string): string {
  try {
    const key = getEncryptionKey();

    // Decode from base64
    const combined = Buffer.from(ciphertext, 'base64');

    // Extract components
    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH);

    // Create decipher
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    // Decrypt
    let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('[Encryption] Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Check if a string appears to be encrypted
 */
export function isEncrypted(value: string): boolean {
  try {
    // Encrypted values are base64 and have minimum length
    const minLength = IV_LENGTH + TAG_LENGTH + 16; // At least 16 bytes of data
    const decoded = Buffer.from(value, 'base64');
    return decoded.length >= minLength;
  } catch {
    return false;
  }
}

/**
 * Securely hash a value (one-way, for verification)
 */
export function hash(value: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = scryptSync(value, salt, KEY_LENGTH);
  return Buffer.concat([salt, key]).toString('base64');
}

/**
 * Verify a value against a hash
 */
export function verifyHash(value: string, hashedValue: string): boolean {
  try {
    const decoded = Buffer.from(hashedValue, 'base64');
    const salt = decoded.subarray(0, SALT_LENGTH);
    const originalKey = decoded.subarray(SALT_LENGTH);
    const key = scryptSync(value, salt, KEY_LENGTH);
    return key.equals(originalKey);
  } catch {
    return false;
  }
}
