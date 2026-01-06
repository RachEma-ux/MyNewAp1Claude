import { describe, it, expect, beforeEach } from "vitest";
import { encrypt, decrypt, redact, isSecretReference, extractSecretKey, createSecretReference } from "./encryption";
import {
  createSecret,
  getSecretById,
  getSecretByKey,
  listSecrets,
  updateSecret,
  deleteSecret,
  resolveSecrets,
  redactSecretsInConfig,
} from "./secrets-service";

describe("Secrets Encryption", () => {
  it("should encrypt and decrypt correctly", () => {
    const plaintext = "my-secret-api-key-12345";
    const encrypted = encrypt(plaintext);
    expect(encrypted).toBeTruthy();
    expect(encrypted).not.toBe(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("should produce different ciphertexts for same plaintext", () => {
    const plaintext = "test-secret";
    const encrypted1 = encrypt(plaintext);
    const encrypted2 = encrypt(plaintext);
    expect(encrypted1).not.toBe(encrypted2);
    expect(decrypt(encrypted1)).toBe(plaintext);
    expect(decrypt(encrypted2)).toBe(plaintext);
  });

  it("should identify secret references", () => {
    expect(isSecretReference("{{secret:api_key}}")).toBe(true);
    expect(isSecretReference("not-a-secret")).toBe(false);
  });

  it("should extract secret keys", () => {
    expect(extractSecretKey("{{secret:api_key}}")).toBe("api_key");
    expect(extractSecretKey("not-a-secret")).toBeNull();
  });
});

describe("Secrets Service", () => {
  const mockUserId = 1;

  beforeEach(async () => {
    try {
      const secrets = await listSecrets(mockUserId);
      for (const secret of secrets) {
        await deleteSecret(secret.id, mockUserId);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it("should create a secret", async () => {
    const secret = await createSecret({
      userId: mockUserId,
      key: "test_api_key",
      value: "secret-value-123",
      description: "Test API key",
    });

    expect(secret).toBeTruthy();
    expect(secret.key).toBe("test_api_key");
    expect(secret.encryptedValue).not.toBe("secret-value-123");
  });

  it("should prevent duplicate keys", async () => {
    await createSecret({
      userId: mockUserId,
      key: "duplicate_key",
      value: "value1",
    });

    await expect(
      createSecret({
        userId: mockUserId,
        key: "duplicate_key",
        value: "value2",
      })
    ).rejects.toThrow("already exists");
  });

  it("should get secret by key with decrypted value", async () => {
    const originalValue = "my-secret-password";
    await createSecret({
      userId: mockUserId,
      key: "get_by_key_test",
      value: originalValue,
    });

    const retrieved = await getSecretByKey("get_by_key_test", mockUserId);
    expect(retrieved?.value).toBe(originalValue);
  });

  it("should list secrets with redacted values", async () => {
    await createSecret({
      userId: mockUserId,
      key: "list_test_1",
      value: "value1",
    });

    const secrets = await listSecrets(mockUserId);
    const secret1 = secrets.find((s) => s.key === "list_test_1");
    expect(secret1?.value).toBe("***REDACTED***");
  });

  it("should update secret value", async () => {
    const created = await createSecret({
      userId: mockUserId,
      key: "update_test",
      value: "original-value",
    });

    await updateSecret(created.id, mockUserId, {
      value: "new-value",
    });

    const retrieved = await getSecretByKey("update_test", mockUserId);
    expect(retrieved?.value).toBe("new-value");
  });

  it("should delete a secret", async () => {
    const created = await createSecret({
      userId: mockUserId,
      key: "delete_test",
      value: "value",
    });

    await deleteSecret(created.id, mockUserId);
    const retrieved = await getSecretById(created.id, mockUserId);
    expect(retrieved).toBeNull();
  });

  it("should resolve secret references in config", async () => {
    await createSecret({
      userId: mockUserId,
      key: "smtp_password",
      value: "actual-password-123",
    });

    const config = {
      smtpHost: "smtp.example.com",
      smtpPassword: "{{secret:smtp_password}}",
      publicValue: "not-a-secret",
    };

    const resolved = await resolveSecrets(config, mockUserId);
    expect(resolved.smtpPassword).toBe("actual-password-123");
    expect(resolved.publicValue).toBe("not-a-secret");
  });

  it("should redact secrets in config for logging", () => {
    const config = {
      username: "admin",
      password: "secret-password",
      apiKey: "secret-api-key",
      publicValue: "public",
    };

    const redacted = redactSecretsInConfig(config);
    expect(redacted.username).toBe("admin");
    expect(redacted.password).toBe("***REDACTED***");
    expect(redacted.apiKey).toBe("***REDACTED***");
    expect(redacted.publicValue).toBe("public");
  });
});
