/**
 * Agent Studio Native Graph Workspace — Extension framework tables.
 *
 * V1+ Phase 18-α enabling tables. ASDB-resident.
 *
 * Extensions are third-party / operator-installed bundles that hook
 * into RACT lanes (Retrieve / Assemble / Compose / Tool). The
 * registry is one row per (workspace, extension key), with
 * capability declarations + governance status.
 *
 * Hard-rule compliance:
 *   - Extensions DO NOT bypass the MCP dispatcher. The wrapper
 *     entry point at
 *     `server/agent-studio/services/extensions/runtime.ts:
 *      invokeFromExtension()` is the ONLY path; direct
 *     `dispatchMcpToolCall` imports from extension code are
 *     source-scan forbidden (acceptance criterion #5).
 *   - Approval reuses the existing `ags_approval_steps` table.
 *   - Capability-pinned dispatch: extensions declare the tools
 *     they intend to invoke; runtime asserts the declared set
 *     matches actual calls (acceptance criterion #4).
 *
 * ADR: docs/architecture/agent-studio-extension-framework-strategy.md.
 */

import {
  boolean,
  index,
  integer,
  json,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const agsExtensions = pgTable(
  "ags_extensions",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    /** Stable identity (e.g. `"slack-broadcaster"`). Unique per
     *  workspace. */
    extensionKey: varchar("extension_key", { length: 120 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    version: varchar("version", { length: 40 }).notNull(),
    /** Issuer-signed payload identity (public key id used to verify
     *  the manifest signature). Null = unsigned / dev-mode. */
    signingKeyId: varchar("signing_key_id", { length: 120 }),
    /** Closed taxonomy: `pending_approval` | `approved` |
     *  `rejected` | `disabled` | `revoked`. Validated at the
     *  service layer; varchar for additive growth. */
    governanceStatus: varchar("governance_status", { length: 40 })
      .notNull()
      .default("pending_approval"),
    /** Declared RACT lane(s) the extension wants to hook
     *  (`retrieve` | `assemble` | `compose` | `tool`). Used for
     *  capability-pinned dispatch. */
    capabilityLanes: json("capability_lanes").$type<string[]>(),
    /** Declared toolNames the extension intends to invoke
     *  (capability-pinned dispatch contract). Runtime enforces
     *  that actual invocations are a subset of this set. */
    declaredToolNames: json("declared_tool_names").$type<string[]>(),
    /** Operator-tunable per-extension config (rate limits, dry-run
     *  flag, etc.). */
    config: json("config"),
    installedByUserId: integer("installed_by_user_id"),
    installedAt: timestamp("installed_at").defaultNow().notNull(),
    approvedAt: timestamp("approved_at"),
    approvedByUserId: integer("approved_by_user_id"),
    disabledAt: timestamp("disabled_at"),
    disabledByUserId: integer("disabled_by_user_id"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    extKeyIdx: uniqueIndex("uniq_ags_extensions_workspace_key").on(
      t.workspaceId,
      t.extensionKey,
    ),
    workspaceIdx: index("idx_ags_extensions_workspace").on(t.workspaceId),
    statusIdx: index("idx_ags_extensions_status").on(t.governanceStatus),
  }),
);

export const agsExtensionInvocations = pgTable(
  "ags_extension_invocations",
  {
    id: serial("id").primaryKey(),
    extensionId: integer("extension_id")
      .notNull()
      .references(() => agsExtensions.id),
    /** The lane the invocation hit (`retrieve` | `assemble` |
     *  `compose` | `tool`). Used for capability-mismatch detection. */
    lane: varchar("lane", { length: 30 }).notNull(),
    /** For `lane="tool"`, the tool name being invoked. For other
     *  lanes the field is null. The runtime checks this against
     *  `agsExtensions.declaredToolNames` to enforce capability
     *  pinning (acceptance criterion #4). */
    invokedToolName: varchar("invoked_tool_name", { length: 200 }),
    /** Outcome of the capability check: `allowed` | `denied_undeclared`
     *  | `denied_revoked` | `denied_disabled`. */
    capabilityCheck: varchar("capability_check", { length: 40 }).notNull(),
    /** Whether the actual invocation succeeded after the
     *  capability check (only meaningful when capabilityCheck =
     *  "allowed"). */
    succeeded: boolean("succeeded"),
    errorMessage: text("error_message"),
    details: json("details"),
    invokedAt: timestamp("invoked_at").defaultNow().notNull(),
  },
  (t) => ({
    extensionIdx: index("idx_ags_ext_inv_extension").on(t.extensionId),
    laneIdx: index("idx_ags_ext_inv_lane").on(t.lane),
    invokedAtIdx: index("idx_ags_ext_inv_invoked_at").on(t.invokedAt),
  }),
);

export type AgsExtension = typeof agsExtensions.$inferSelect;
export type NewAgsExtension = typeof agsExtensions.$inferInsert;
export type AgsExtensionInvocation = typeof agsExtensionInvocations.$inferSelect;
export type NewAgsExtensionInvocation =
  typeof agsExtensionInvocations.$inferInsert;
