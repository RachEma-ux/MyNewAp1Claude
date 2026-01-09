/**
 * Provider Credential Management
 * Handles secure storage and retrieval of provider API keys and credentials
 */

import { encrypt, decrypt, isEncrypted } from '../_core/encryption';
import { getDb } from '../db';
import { providers } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

const db = getDb();

export interface ProviderCredentials {
  apiKey?: string;
  apiSecret?: string;
  endpoint?: string;
  organizationId?: string;
  projectId?: string;
  [key: string]: string | undefined;
}

/**
 * Store provider credentials (automatically encrypts sensitive fields)
 */
export async function storeProviderCredentials(
  providerId: number,
  credentials: ProviderCredentials
): Promise<void> {
  // Fields that should be encrypted
  const sensitiveFields = ['apiKey', 'apiSecret'];

  // Encrypt sensitive fields
  const encryptedConfig: Record<string, string> = {};

  for (const [key, value] of Object.entries(credentials)) {
    if (value === undefined) continue;

    if (sensitiveFields.includes(key)) {
      encryptedConfig[key] = encrypt(value);
    } else {
      encryptedConfig[key] = value;
    }
  }

  // Get existing provider config
  const [provider] = await db!.select().from(providers).where(eq(providers.id, providerId));

  if (!provider) {
    throw new Error(`Provider ${providerId} not found`);
  }

  // Merge with existing config
  const existingConfig = (provider.config as Record<string, any>) || {};
  const updatedConfig = {
    ...existingConfig,
    credentials: encryptedConfig,
  };

  // Update provider
  await db!.update(providers)
    .set({ config: updatedConfig })
    .where(eq(providers.id, providerId));

  console.log(`[ProviderCredentials] Stored encrypted credentials for provider ${providerId}`);
}

/**
 * Retrieve provider credentials (automatically decrypts sensitive fields)
 */
export async function getProviderCredentials(
  providerId: number
): Promise<ProviderCredentials | null> {
  const [provider] = await db!.select().from(providers).where(eq(providers.id, providerId));

  if (!provider) {
    return null;
  }

  const config = (provider.config as Record<string, any>) || {};
  const encryptedCreds = config.credentials as Record<string, string> | undefined;

  if (!encryptedCreds) {
    return null;
  }

  // Decrypt sensitive fields
  const sensitiveFields = ['apiKey', 'apiSecret'];
  const decryptedCreds: ProviderCredentials = {};

  for (const [key, value] of Object.entries(encryptedCreds)) {
    if (sensitiveFields.includes(key) && isEncrypted(value)) {
      try {
        decryptedCreds[key] = decrypt(value);
      } catch (error) {
        console.error(`[ProviderCredentials] Failed to decrypt ${key} for provider ${providerId}`);
        decryptedCreds[key] = undefined;
      }
    } else {
      decryptedCreds[key] = value;
    }
  }

  return decryptedCreds;
}

/**
 * Delete provider credentials
 */
export async function deleteProviderCredentials(providerId: number): Promise<void> {
  const [provider] = await db!.select().from(providers).where(eq(providers.id, providerId));

  if (!provider) {
    return;
  }

  const config = (provider.config as Record<string, any>) || {};
  delete config.credentials;

  await db!.update(providers)
    .set({ config })
    .where(eq(providers.id, providerId));

  console.log(`[ProviderCredentials] Deleted credentials for provider ${providerId}`);
}

/**
 * Check if provider has credentials configured
 */
export async function hasProviderCredentials(providerId: number): Promise<boolean> {
  const credentials = await getProviderCredentials(providerId);
  return credentials !== null && (credentials.apiKey !== undefined || credentials.apiSecret !== undefined);
}

/**
 * Mask sensitive credential for display (show only last 4 characters)
 */
export function maskCredential(credential: string): string {
  if (!credential || credential.length < 8) {
    return '••••••••';
  }
  return '••••' + credential.slice(-4);
}
