import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db";
import { secrets } from "../../drizzle/schema";
import { encrypt, decrypt, redact, isSecretReference, extractSecretKey } from "./encryption";
import type { Secret } from "../../drizzle/schema";

/**
 * Create a new secret
 */
export async function createSecret(input: {
  userId: number;
  key: string;
  value: string;
  description?: string;
}): Promise<Secret> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  // Check if secret with this key already exists for user
  const existing = await getSecretByKey(input.key, input.userId);
  if (existing) {
    throw new Error(`Secret with key "${input.key}" already exists`);
  }

  const encryptedValue = encrypt(input.value);

  const [result] = await database
    .insert(secrets)
    .values({
      userId: input.userId,
      key: input.key,
      encryptedValue,
      description: input.description || null,
    });

  const insertId = Number(result.insertId);
  return (await getSecretById(insertId, input.userId))!;
}

/**
 * Get secret by ID (without decrypting value)
 */
export async function getSecretById(
  id: number,
  userId: number
): Promise<Secret | null> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const [secret] = await database
    .select()
    .from(secrets)
    .where(and(eq(secrets.id, id), eq(secrets.userId, userId)))
    .limit(1);

  return secret || null;
}

/**
 * Get secret by key with decrypted value
 */
export async function getSecretByKey(
  key: string,
  userId: number
): Promise<(Secret & { value: string }) | null> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const [secret] = await database
    .select()
    .from(secrets)
    .where(and(eq(secrets.key, key), eq(secrets.userId, userId)))
    .limit(1);

  if (!secret) return null;

  const value = decrypt(secret.encryptedValue);
  return { ...secret, value };
}

/**
 * List all secrets for a user (with redacted values)
 */
export async function listSecrets(
  userId: number
): Promise<(Secret & { value: string })[]> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const secretsList = await database
    .select()
    .from(secrets)
    .where(eq(secrets.userId, userId))
    .orderBy(desc(secrets.createdAt));

  return secretsList.map((secret) => ({
    ...secret,
    value: redact(secret.encryptedValue),
  }));
}

/**
 * Update a secret
 */
export async function updateSecret(
  id: number,
  userId: number,
  updates: {
    value?: string;
    description?: string;
  }
): Promise<Secret> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const updateData: any = {};
  if (updates.value !== undefined) {
    updateData.encryptedValue = encrypt(updates.value);
  }
  if (updates.description !== undefined) {
    updateData.description = updates.description;
  }

  await database
    .update(secrets)
    .set(updateData)
    .where(and(eq(secrets.id, id), eq(secrets.userId, userId)));

  return (await getSecretById(id, userId))!;
}

/**
 * Delete a secret
 */
export async function deleteSecret(id: number, userId: number): Promise<void> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  await database
    .delete(secrets)
    .where(and(eq(secrets.id, id), eq(secrets.userId, userId)));
}

/**
 * Resolve secret references in a config object
 * Replaces {{secret:key}} with actual secret values
 */
export async function resolveSecrets(
  config: any,
  userId: number
): Promise<any> {
  if (!config || typeof config !== "object") {
    return config;
  }

  if (Array.isArray(config)) {
    return Promise.all(config.map((item) => resolveSecrets(item, userId)));
  }

  const resolved: any = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "string" && isSecretReference(value)) {
      const secretKey = extractSecretKey(value);
      if (secretKey) {
        const secret = await getSecretByKey(secretKey, userId);
        resolved[key] = secret?.value || value;
      } else {
        resolved[key] = value;
      }
    } else if (typeof value === "object" && value !== null) {
      resolved[key] = await resolveSecrets(value, userId);
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

/**
 * Redact secrets in config for logging
 * Redacts fields with sensitive names (password, secret, token, key, etc.)
 */
export function redactSecretsInConfig(config: any): any {
  if (!config || typeof config !== "object") {
    return config;
  }

  if (Array.isArray(config)) {
    return config.map(redactSecretsInConfig);
  }

  const redacted: any = {};
  const sensitiveKeys = [
    "password",
    "secret",
    "token",
    "key",
    "apikey",
    "apisecret",
    "accesstoken",
    "refreshtoken",
  ];

  for (const [key, value] of Object.entries(config)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some((sensitive) =>
      lowerKey.includes(sensitive)
    );

    if (isSensitive && typeof value === "string") {
      redacted[key] = redact(value);
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = redactSecretsInConfig(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}
