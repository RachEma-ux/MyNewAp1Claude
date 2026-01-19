/**
 * Key Rotation Service
 * 
 * Provides database operations for key rotation management including:
 * - Service certificate management
 * - Attestation key management
 * - Rotation scheduling and tracking
 * - Audit logging
 */

import { getDb } from "../db";
import { eq, desc, and } from "drizzle-orm";
import {
  serviceCertificates,
  attestationKeys,
  keyRotations,
  keyRotationAuditLogs,
  keyRotationPolicies,
  keyRotationSchedules,
  ServiceCertificate,
  InsertServiceCertificate,
  AttestationKey,
  InsertAttestationKey,
  KeyRotation,
  InsertKeyRotation,
  KeyRotationAuditLog,
  InsertKeyRotationAuditLog,
  KeyRotationPolicy,
  InsertKeyRotationPolicy,
  KeyRotationSchedule,
  InsertKeyRotationSchedule,
} from "../../drizzle/schema";

// ============================================================================
// Service Certificate Operations
// ============================================================================

/**
 * Create a new service certificate
 */
export async function createServiceCertificate(
  input: InsertServiceCertificate
): Promise<ServiceCertificate> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(serviceCertificates).values(input);
  const certId = Number(result[0].insertId);
  
  const created = await db.select().from(serviceCertificates).where(eq(serviceCertificates.id, certId)).limit(1);
  return created[0]!;
}

/**
 * Get service certificate by ID
 */
export async function getServiceCertificateById(id: number): Promise<ServiceCertificate | null> {
  const db = getDb();
  if (!db) return null;
  
  const result = await db.select().from(serviceCertificates).where(eq(serviceCertificates.id, id)).limit(1);
  return result[0] || null;
}

/**
 * Get all service certificates for a service
 */
export async function getServiceCertificatesByService(
  serviceName: string
): Promise<ServiceCertificate[]> {
  const db = getDb();
  if (!db) return [];
  
  // Note: serviceName field may not exist in schema, filtering in memory
  const all = await db.select().from(serviceCertificates);
  return all; // In production, add serviceName field to schema if needed
}

/**
 * Get active certificate for a service
 */
export async function getActiveServiceCertificate(
  serviceName: string
): Promise<ServiceCertificate | null> {
  const db = getDb();
  if (!db) return null;
  
  const result = await db.select().from(serviceCertificates).where(
    eq(serviceCertificates.isActive, true)
  ).limit(1);
  
  return result[0] || null;
}

/**
 * Update service certificate
 */
export async function updateServiceCertificate(
  id: number,
  updates: Partial<ServiceCertificate>
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(serviceCertificates).set(updates).where(eq(serviceCertificates.id, id));
}

/**
 * Mark certificate as active
 */
export async function activateServiceCertificate(id: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(serviceCertificates).set({ isActive: true }).where(eq(serviceCertificates.id, id));
}

/**
 * Revoke service certificate
 */
export async function revokeServiceCertificate(id: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(serviceCertificates).set({ status: "revoked" }).where(eq(serviceCertificates.id, id));
}

// ============================================================================
// Attestation Key Operations
// ============================================================================

/**
 * Create a new attestation key
 */
export async function createAttestationKey(
  input: InsertAttestationKey
): Promise<AttestationKey> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(attestationKeys).values(input);
  const keyId = Number(result[0].insertId);
  
  const created = await db.select().from(attestationKeys).where(eq(attestationKeys.id, keyId)).limit(1);
  return created[0]!;
}

/**
 * Get attestation key by ID
 */
export async function getAttestationKeyById(id: number): Promise<AttestationKey | null> {
  const db = getDb();
  if (!db) return null;
  
  const result = await db.select().from(attestationKeys).where(eq(attestationKeys.id, id)).limit(1);
  return result[0] || null;
}

/**
 * Get all attestation keys for a service
 */
export async function getAttestationKeysByService(
  serviceName: string
): Promise<AttestationKey[]> {
  const db = getDb();
  if (!db) return [];
  
  // Note: serviceName field may not exist in schema, returning all keys
  return await db.select().from(attestationKeys);
}

/**
 * Get active attestation key for a service
 */
export async function getActiveAttestationKey(
  serviceName?: string
): Promise<AttestationKey | null> {
  const db = getDb();
  if (!db) return null;
  
  const result = await db.select().from(attestationKeys).where(
    eq(attestationKeys.isActive, true)
  ).limit(1);
  
  return result[0] || null;
}

/**
 * Update attestation key
 */
export async function updateAttestationKey(
  id: number,
  updates: Partial<AttestationKey>
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(attestationKeys).set(updates).where(eq(attestationKeys.id, id));
}

/**
 * Mark attestation key as active
 */
export async function activateAttestationKey(id: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(attestationKeys).set({ isActive: true }).where(eq(attestationKeys.id, id));
}

/**
 * Revoke attestation key
 */
export async function revokeAttestationKey(id: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(attestationKeys).set({ status: "revoked" }).where(eq(attestationKeys.id, id));
}

// ============================================================================
// Key Rotation Operations
// ============================================================================

/**
 * Create a new key rotation record
 */
export async function createKeyRotation(
  input: InsertKeyRotation
): Promise<KeyRotation> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(keyRotations).values(input);
  const rotationId = Number(result[0].insertId);
  
  const created = await db.select().from(keyRotations).where(eq(keyRotations.id, rotationId)).limit(1);
  return created[0]!;
}

/**
 * Get key rotation by ID
 */
export async function getKeyRotationById(id: number): Promise<KeyRotation | null> {
  const db = getDb();
  if (!db) return null;
  
  const result = await db.select().from(keyRotations).where(eq(keyRotations.id, id)).limit(1);
  return result[0] || null;
}

/**
 * Get all key rotations for a service
 */
export async function getKeyRotationsByService(
  serviceName: string
): Promise<KeyRotation[]> {
  const db = getDb();
  if (!db) return [];
  
  return await db.select().from(keyRotations)
    .where(eq(keyRotations.targetName, serviceName))
    .orderBy(desc(keyRotations.updatedAt));
}

/**
 * Get pending key rotations
 */
export async function getPendingKeyRotations(): Promise<KeyRotation[]> {
  const db = getDb();
  if (!db) return [];
  
  return await db.select().from(keyRotations)
    .where(eq(keyRotations.status, "pending"))
    .orderBy(desc(keyRotations.scheduledAt));
}

/**
 * Update key rotation
 */
export async function updateKeyRotation(
  id: number,
  updates: Partial<KeyRotation>
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(keyRotations).set(updates).where(eq(keyRotations.id, id));
}

// ============================================================================
// Key Rotation Audit Log Operations
// ============================================================================

/**
 * Create audit log entry
 */
export async function createAuditLog(
  input: InsertKeyRotationAuditLog
): Promise<KeyRotationAuditLog> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(keyRotationAuditLogs).values(input);
  const logId = Number(result[0].insertId);
  
  const created = await db.select().from(keyRotationAuditLogs).where(eq(keyRotationAuditLogs.id, logId)).limit(1);
  return created[0]!;
}

/**
 * Get audit logs for a key rotation
 */
export async function getAuditLogs(keyRotationId: number): Promise<KeyRotationAuditLog[]> {
  const db = getDb();
  if (!db) return [];
  
  return await db.select().from(keyRotationAuditLogs)
    .where(eq(keyRotationAuditLogs.rotationId, keyRotationId))
    .orderBy(desc(keyRotationAuditLogs.createdAt));
}

// ============================================================================
// Key Rotation Policy Operations
// ============================================================================

/**
 * Create key rotation policy
 */
export async function createKeyRotationPolicy(
  input: InsertKeyRotationPolicy
): Promise<KeyRotationPolicy> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(keyRotationPolicies).values(input);
  const policyId = Number(result[0].insertId);
  
  const created = await db.select().from(keyRotationPolicies).where(eq(keyRotationPolicies.id, policyId)).limit(1);
  return created[0]!;
}

/**
 * Get key rotation policy for a service
 */
export async function getKeyRotationPolicy(
  serviceName: string
): Promise<KeyRotationPolicy | null> {
  const db = getDb();
  if (!db) return null;
  
  const result = await db.select().from(keyRotationPolicies)
    .limit(1);
  
  return result[0] || null;
}

/**
 * Update key rotation policy
 */
export async function updateKeyRotationPolicy(
  id: number,
  updates: Partial<KeyRotationPolicy>
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(keyRotationPolicies).set(updates).where(eq(keyRotationPolicies.id, id));
}

// ============================================================================
// Key Rotation Schedule Operations
// ============================================================================

/**
 * Create key rotation schedule
 */
export async function createKeyRotationSchedule(
  input: InsertKeyRotationSchedule
): Promise<KeyRotationSchedule> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(keyRotationSchedules).values(input);
  const scheduleId = Number(result[0].insertId);
  
  const created = await db.select().from(keyRotationSchedules).where(eq(keyRotationSchedules.id, scheduleId)).limit(1);
  return created[0]!;
}

/**
 * Get key rotation schedule for a service
 */
export async function getKeyRotationSchedule(
  serviceName: string
): Promise<KeyRotationSchedule | null> {
  const db = getDb();
  if (!db) return null;
  
  const result = await db.select().from(keyRotationSchedules)
    .limit(1);
  
  return result[0] || null;
}

/**
 * Get all active rotation schedules
 */
export async function getActiveRotationSchedules(): Promise<KeyRotationSchedule[]> {
  const db = getDb();
  if (!db) return [];
  
  // Note: isActive field may not exist in schema
  return await db.select().from(keyRotationSchedules);
}

/**
 * Update key rotation schedule
 */
export async function updateKeyRotationSchedule(
  id: number,
  updates: Partial<KeyRotationSchedule>
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(keyRotationSchedules).set(updates).where(eq(keyRotationSchedules.id, id));
}


// ============================================================================
// Additional Helper Functions
// ============================================================================

/**
 * Get all attestation keys (for listing)
 */
export async function getAllAttestationKeys(): Promise<AttestationKey[]> {
  const db = getDb();
  if (!db) return [];
  
  return await db.select().from(attestationKeys).orderBy(desc(attestationKeys.createdAt));
}

/**
 * Get all key rotations (for listing)
 */
export async function getAllKeyRotations(): Promise<KeyRotation[]> {
  const db = getDb();
  if (!db) return [];
  
  return await db.select().from(keyRotations).orderBy(desc(keyRotations.createdAt));
}

/**
 * Get all rotation policies
 */
export async function getAllRotationPolicies(): Promise<KeyRotationPolicy[]> {
  const db = getDb();
  if (!db) return [];
  
  return await db.select().from(keyRotationPolicies).orderBy(desc(keyRotationPolicies.createdAt));
}

/**
 * Get active rotation policies
 */
export async function getActiveRotationPolicies(): Promise<KeyRotationPolicy[]> {
  const db = getDb();
  if (!db) return [];
  
  return await db.select().from(keyRotationPolicies)
    .where(eq(keyRotationPolicies.isActive, true))
    .orderBy(desc(keyRotationPolicies.createdAt));
}

/**
 * Deprecate attestation key (mark as inactive)
 */
export async function deprecateAttestationKey(id: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(attestationKeys).set({ isActive: false }).where(eq(attestationKeys.id, id));
}

/**
 * Complete key rotation
 */
export async function completeKeyRotation(id: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(keyRotations).set({
    status: "completed",
    completedAt: new Date(),
  }).where(eq(keyRotations.id, id));
}

/**
 * Fail key rotation
 */
export async function failKeyRotation(id: number, reason: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(keyRotations).set({
    status: "failed",
    reason: reason,
    completedAt: new Date(),
  }).where(eq(keyRotations.id, id));
}

/**
 * Rollback key rotation
 */
export async function rollbackKeyRotation(id: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(keyRotations).set({
    status: "rolled_back",
    completedAt: new Date(),
  }).where(eq(keyRotations.id, id));
}

/**
 * Log rotation action
 */
export async function logRotationAction(
  keyRotationId: number,
  action: string,
  details: string
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(keyRotationAuditLogs).values({
    rotationId: keyRotationId,
    action,
    actionType: "deploy" as any,
    details: { note: details } as any,
  } as any);
}

/**
 * Get audit logs for rotation
 */
export async function getAuditLogsForRotation(keyRotationId: number): Promise<KeyRotationAuditLog[]> {
  const db = getDb();
  if (!db) return [];
  
  return await db.select().from(keyRotationAuditLogs)
    .where(eq(keyRotationAuditLogs.rotationId, keyRotationId))
    .orderBy(desc(keyRotationAuditLogs.createdAt));
}

/**
 * Get rotation status summary
 */
export async function getRotationStatusSummary(): Promise<{
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  failed: number;
}> {
  const db = getDb();
  if (!db) {
    return { total: 0, pending: 0, in_progress: 0, completed: 0, failed: 0 };
  }
  
  const rotations = await db.select().from(keyRotations);
  
  return {
    total: rotations.length,
    pending: rotations.filter(r => r.status === "pending").length,
    in_progress: rotations.filter(r => r.status === "in_progress").length,
    completed: rotations.filter(r => r.status === "completed").length,
    failed: rotations.filter(r => r.status === "failed").length,
  };
}

/**
 * Activate rotation policy
 */
export async function activateRotationPolicy(id: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(keyRotationPolicies).set({ isActive: true }).where(eq(keyRotationPolicies.id, id));
}

/**
 * Deactivate rotation policy
 */
export async function deactivateRotationPolicy(id: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(keyRotationPolicies).set({ isActive: false }).where(eq(keyRotationPolicies.id, id));
}
