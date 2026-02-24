/**
 * Workspace Seed Script — CLI
 *
 * Seeds capabilities, roles, and memberships for a workspace from YAML config.
 *
 * Usage:
 *   npx tsx server/workspace/seed/seed.ts --owner <userId> [options]
 *
 * Options:
 *   --owner <userId>         Owner user ID (required)
 *   --workspace <id>         Existing workspace ID (creates new if omitted)
 *   --workspaceType <type>   Workspace type preset: personal|team|enterprise|sandbox|readonly (default: team)
 *   --name <name>            Workspace name (for new workspaces, default: "Seeded Workspace")
 *   --withDefaultAI          Create AI agent placeholder memberships
 */

import { loadCapabilitiesCatalog, loadWorkspaceRolePresets } from "./loaders";
import {
  upsertCapabilities,
  upsertWorkspaceRole,
  upsertRoleCapability,
  upsertWorkspaceMember,
  getAllCapabilities,
} from "../../db/workspace-rbac";
import { getDb } from "../../db/connection";
import { workspaces, users } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";

// ============================================================================
// Arg Parsing
// ============================================================================

interface SeedArgs {
  owner: number;
  workspace?: number;
  workspaceType: string;
  name: string;
  withDefaultAI: boolean;
}

function parseArgs(argv: string[]): SeedArgs {
  const args: SeedArgs = {
    owner: 0,
    workspaceType: "team",
    name: "Seeded Workspace",
    withDefaultAI: false,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--owner":
        args.owner = parseInt(argv[++i], 10);
        break;
      case "--workspace":
        args.workspace = parseInt(argv[++i], 10);
        break;
      case "--workspaceType":
        args.workspaceType = argv[++i];
        break;
      case "--name":
        args.name = argv[++i];
        break;
      case "--withDefaultAI":
        args.withDefaultAI = true;
        break;
    }
  }

  if (!args.owner || isNaN(args.owner)) {
    throw new Error("--owner <userId> is required");
  }

  return args;
}

// ============================================================================
// Core Seed Logic (exported for testing)
// ============================================================================

export async function seedWorkspace(args: SeedArgs): Promise<{
  workspaceId: number;
  capabilitiesUpserted: number;
  rolesCreated: string[];
  mappingsCreated: number;
  ownerAssigned: boolean;
}> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  // 1. Verify owner user exists
  const ownerRows = await db
    .select()
    .from(users)
    .where(eq(users.id, args.owner))
    .limit(1);

  if (ownerRows.length === 0) {
    throw new Error(`Owner user ${args.owner} not found`);
  }

  // 2. Ensure workspace exists
  let workspaceId: number;
  if (args.workspace) {
    const wsRows = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, args.workspace))
      .limit(1);
    if (wsRows.length === 0) {
      throw new Error(`Workspace ${args.workspace} not found`);
    }
    workspaceId = args.workspace;
  } else {
    const [ws] = await db
      .insert(workspaces)
      .values({ name: args.name, ownerId: args.owner })
      .returning();
    workspaceId = ws.id;
    console.log(`[Seed] Created workspace "${args.name}" (id=${workspaceId})`);
  }

  // 3. Load YAML configs
  const catalog = loadCapabilitiesCatalog();
  const presets = loadWorkspaceRolePresets();

  // 4. Upsert all capabilities
  const capsUpserted = await upsertCapabilities(catalog.capabilities);
  console.log(`[Seed] Upserted ${capsUpserted} new capabilities (${catalog.capabilities.length} total)`);

  // 5. Build capability key→id map
  const allCaps = await getAllCapabilities();
  const capMap = new Map(allCaps.map((c) => [c.key, c.id]));

  // 6. Find workspace type preset
  const preset = presets.workspaceTypes.find((p) => p.type === args.workspaceType);
  const blockedSet = new Set(preset?.blockedCapabilities ?? []);

  // 7. Create roles and map capabilities
  const rolesCreated: string[] = [];
  let mappingsCreated = 0;

  for (const roleDef of presets.roles) {
    const role = await upsertWorkspaceRole(
      workspaceId,
      roleDef.name,
      roleDef.description,
      roleDef.isSystem
    );
    rolesCreated.push(roleDef.name);

    // Compute effective capabilities: allowed minus blocked
    const effectiveCaps = roleDef.allow.filter((cap) => !blockedSet.has(cap));

    for (const capKey of effectiveCaps) {
      const capId = capMap.get(capKey);
      if (capId) {
        await upsertRoleCapability(role.id, capId);
        mappingsCreated++;
      }
    }
  }

  console.log(`[Seed] Created ${rolesCreated.length} roles, ${mappingsCreated} capability mappings`);

  // 8. Assign owner membership with WorkspaceOwner role
  const ownerRole = await upsertWorkspaceRole(workspaceId, "WorkspaceOwner");
  await upsertWorkspaceMember(workspaceId, args.owner, ownerRole.id, "owner");
  console.log(`[Seed] Assigned user ${args.owner} as WorkspaceOwner`);

  return {
    workspaceId,
    capabilitiesUpserted: capsUpserted,
    rolesCreated,
    mappingsCreated,
    ownerAssigned: true,
  };
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    console.log("[Seed] Starting workspace seed...");
    console.log(`[Seed] Owner: ${args.owner}, Type: ${args.workspaceType}`);

    const result = await seedWorkspace(args);

    console.log("\n=== Seed Summary ===");
    console.log(`Workspace ID:       ${result.workspaceId}`);
    console.log(`Capabilities:       ${result.capabilitiesUpserted} new`);
    console.log(`Roles:              ${result.rolesCreated.join(", ")}`);
    console.log(`Role→Cap mappings:  ${result.mappingsCreated}`);
    console.log(`Owner assigned:     ${result.ownerAssigned}`);
    console.log("====================\n");
  } catch (err: any) {
    console.error(`[Seed] Error: ${err.message}`);
    process.exit(1);
  }
}

// Run only when executed directly
const isDirectRun =
  process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js");
if (isDirectRun) {
  main();
}
