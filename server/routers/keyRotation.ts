/**
 * Key Rotation tRPC Router
 * 
 * Provides RPC endpoints for key rotation management:
 * - Certificate management (create, list, activate, revoke)
 * - Attestation key management (create, list, activate, deprecate)
 * - Rotation scheduling and execution
 * - Audit logging and compliance tracking
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import * as keyRotationService from "../services/keyRotationService";

// ============================================================================
// Input Schemas
// ============================================================================

const createServiceCertificateSchema = z.object({
  serviceName: z.string().min(1, "Service name required"),
  certificateType: z.enum(["tls", "mtls", "signing"]),
  certificate: z.string().min(1, "Certificate required"),
  privateKey: z.string().min(1, "Private key required"),
  publicKey: z.string().optional(),
  subject: z.string().optional(),
  issuer: z.string().optional(),
  serialNumber: z.string().optional(),
  fingerprint: z.string(),
  issuedAt: z.date(),
  expiresAt: z.date(),
  notes: z.string().optional(),
});

const createAttestationKeySchema = z.object({
  keyName: z.string().min(1, "Key name required"),
  keyType: z.enum(["rsa", "ecdsa", "ed25519"]).default("ed25519"),
  keySize: z.number().optional(),
  publicKey: z.string().min(1, "Public key required"),
  privateKey: z.string().optional(),
  keyId: z.string().min(1, "Key ID required"),
  thumbprint: z.string(),
  generatedAt: z.date(),
  expiresAt: z.date().optional(),
  notes: z.string().optional(),
});

const createKeyRotationSchema = z.object({
  rotationType: z.enum(["service_cert", "attestation_key"]),
  targetName: z.string().min(1, "Target name required"),
  reason: z.enum(["scheduled", "manual", "emergency", "compromise"]).default("manual"),
  scheduledAt: z.date().optional(),
  notes: z.string().optional(),
});

const createRotationPolicySchema = z.object({
  policyName: z.string().min(1, "Policy name required"),
  description: z.string().optional(),
  targetType: z.enum(["service_cert", "attestation_key", "all"]),
  targetName: z.string().optional(),
  rotationIntervalDays: z.number().int().positive(),
  rotationIntervalHours: z.number().int().optional(),
  daysBeforeExpiry: z.number().int().optional(),
  overlapWindowDays: z.number().int().default(7),
  autoRotate: z.boolean().default(true),
  requireApproval: z.boolean().default(false),
  notifyBefore: z.number().int().optional(),
});

// ============================================================================
// Service Certificate Procedures
// ============================================================================

const serviceCertificatesRouter = router({
  /**
   * Create a new service certificate
   */
  create: protectedProcedure
    .input(createServiceCertificateSchema)
    .mutation(async ({ input }) => {
      try {
        const cert = await keyRotationService.createServiceCertificate({
          ...input,
          status: "active",
          isActive: true,
        });
        return { success: true, certificate: cert };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create certificate: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * List all service certificates for a service
   */
  list: protectedProcedure
    .input(z.object({ serviceName: z.string() }))
    .query(async ({ input }) => {
      try {
        const certs = await keyRotationService.getServiceCertificatesByService(input.serviceName);
        return {
          success: true,
          certificates: certs.map((cert) => ({
            ...cert,
            // Redact sensitive data
            privateKey: "***REDACTED***",
          })),
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to list certificates: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * Get active certificate for a service
   */
  getActive: protectedProcedure
    .input(z.object({ serviceName: z.string() }))
    .query(async ({ input }) => {
      try {
        const cert = await keyRotationService.getActiveServiceCertificate(input.serviceName);
        if (!cert) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `No active certificate found for service: ${input.serviceName}`,
          });
        }
        return {
          success: true,
          certificate: {
            ...cert,
            privateKey: "***REDACTED***",
          },
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to get active certificate: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * Activate a certificate
   */
  activate: protectedProcedure
    .input(z.object({ certificateId: z.number() }))
    .mutation(async ({ input }) => {
      try {
        await keyRotationService.activateServiceCertificate(input.certificateId);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to activate certificate: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * Revoke a certificate
   */
  revoke: protectedProcedure
    .input(z.object({ certificateId: z.number() }))
    .mutation(async ({ input }) => {
      try {
        await keyRotationService.revokeServiceCertificate(input.certificateId);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to revoke certificate: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),
});

// ============================================================================
// Attestation Key Procedures
// ============================================================================

const attestationKeysRouter = router({
  /**
   * Create a new attestation key
   */
  create: protectedProcedure
    .input(createAttestationKeySchema)
    .mutation(async ({ input }) => {
      try {
        const key = await keyRotationService.createAttestationKey({
          ...input,
          status: "active",
          isActive: true,
          usageCount: 0,
        });
        return { success: true, key };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create attestation key: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * List all attestation keys
   */
  list: protectedProcedure.query(async () => {
    try {
      const keys = await keyRotationService.getAllAttestationKeys();
      return {
        success: true,
        keys: keys.map((key) => ({
          ...key,
          privateKey: key.privateKey ? "***REDACTED***" : null,
        })),
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to list attestation keys: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }),

  /**
   * Get active attestation key
   */
  getActive: protectedProcedure.query(async () => {
    try {
      const key = await keyRotationService.getActiveAttestationKey();
      if (!key) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No active attestation key found",
        });
      }
      return {
        success: true,
        key: {
          ...key,
          privateKey: key.privateKey ? "***REDACTED***" : null,
        },
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to get active attestation key: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }),

  /**
   * Activate an attestation key
   */
  activate: protectedProcedure
    .input(z.object({ keyId: z.number() }))
    .mutation(async ({ input }) => {
      try {
        await keyRotationService.activateAttestationKey(input.keyId);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to activate attestation key: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * Deprecate an attestation key
   */
  deprecate: protectedProcedure
    .input(z.object({ keyId: z.number() }))
    .mutation(async ({ input }) => {
      try {
        await keyRotationService.deprecateAttestationKey(input.keyId);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to deprecate attestation key: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),
});

// ============================================================================
// Key Rotation Procedures
// ============================================================================

const rotationsRouter = router({
  /**
   * Create a new key rotation event
   */
  create: protectedProcedure
    .input(createKeyRotationSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const rotation = await keyRotationService.createKeyRotation({
          ...input,
          status: "pending",
          initiatedBy: ctx.user.id,
          scheduledAt: input.scheduledAt || new Date(),
        });

        // Log the action
        await keyRotationService.logRotationAction(
          rotation.id,
          `Rotation initiated for ${input.targetName}`,
          JSON.stringify({ reason: input.reason })
        );

        return { success: true, rotation };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create rotation: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * List all key rotations
   */
  list: protectedProcedure.query(async () => {
    try {
      const rotations = await keyRotationService.getAllKeyRotations();
      return { success: true, rotations };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to list rotations: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }),

  /**
   * Get rotation by ID with audit logs
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      try {
        const rotation = await keyRotationService.getKeyRotationById(input.id);
        if (!rotation) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Rotation not found",
          });
        }

        const auditLogs = await keyRotationService.getAuditLogsForRotation(input.id);

        return {
          success: true,
          rotation,
          auditLogs,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to get rotation: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * Get rotation status summary
   */
  getStatusSummary: protectedProcedure.query(async () => {
    try {
      const summary = await keyRotationService.getRotationStatusSummary();
      return { success: true, summary };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to get status summary: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }),

  /**
   * Complete a rotation
   */
  complete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await keyRotationService.completeKeyRotation(input.id);
        await keyRotationService.logRotationAction(
          input.id,
          "Rotation completed",
          JSON.stringify({})
        );
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to complete rotation: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * Fail a rotation
   */
  fail: protectedProcedure
    .input(z.object({ id: z.number(), error: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await keyRotationService.failKeyRotation(input.id, input.error);
        await keyRotationService.logRotationAction(
          input.id,
          `Rotation failed: ${input.error}`,
          JSON.stringify({ error: input.error })
        );
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fail rotation: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * Rollback a rotation
   */
  rollback: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await keyRotationService.rollbackKeyRotation(input.id);
        await keyRotationService.logRotationAction(
          input.id,
          `Rotation rolled back: ${input.reason}`,
          JSON.stringify({ reason: input.reason })
        );
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to rollback rotation: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),
});

// ============================================================================
// Rotation Policy Procedures
// ============================================================================

const policiesRouter = router({
  /**
   * Create a rotation policy
    create: protectedProcedure
    .input(createRotationPolicySchema)
    .mutation(async ({ input }) => {
      try {
        const policy = await keyRotationService.createKeyRotationPolicy(input as any);         ...input,
          isActive: true,
        });
        return { success: true, policy };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create policy: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * List all rotation policies
   */
  list: protectedProcedure.query(async () => {
    try {
      const policies = await keyRotationService.getAllRotationPolicies();
      return { success: true, policies };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to list policies: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }),

  /**
   * Get active policies
   */
  listActive: protectedProcedure.query(async () => {
    try {
      const policies = await keyRotationService.getActiveRotationPolicies();
      return { success: true, policies };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to list active policies: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }),

  /**
   * Activate a policy
   */
  activate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      try {
        await keyRotationService.activateRotationPolicy(input.id);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to activate policy: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * Deactivate a policy
   */
  deactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      try {
        await keyRotationService.deactivateRotationPolicy(input.id);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to deactivate policy: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),
});

// ============================================================================
// Main Router Export
// ============================================================================

export const keyRotationRouter = router({
  serviceCertificates: serviceCertificatesRouter,
  attestationKeys: attestationKeysRouter,
  rotations: rotationsRouter,
  policies: policiesRouter,
});
