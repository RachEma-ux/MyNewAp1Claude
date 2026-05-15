/**
 * RAC Source Registry — public barrel (Phase 2).
 *
 * Re-exports the source-registry CRUD surface and types. P3 ingestion
 * adapters and P4 retrieval planner consume from here. Direct imports
 * of `./store` from outside this package are discouraged.
 */

export type {
  RacSourceType,
  RacOwnerModule,
  RacProfile,
  RacSource,
  RacPolicy,
  RacWorkspaceEmbeddingDefault,
  CreateProfileInput,
  UpdateProfileInput,
  CreateSourceInput,
  UpdateSourceInput,
  UpsertPolicyInput,
  UpsertWorkspaceEmbeddingDefaultInput,
} from "./types";

export {
  RAC_SOURCE_TYPES,
  RAC_OWNER_MODULES,
  RAC_OWNER_MODULE_METADATA,
  getRacOwnerModuleMetadata,
  EmbeddingDefaultRequiredError,
} from "./types";
export type { RacOwnerModuleMetadata } from "./types";

export {
  createProfile,
  getProfile,
  listProfilesForDraft,
  updateProfile,
  createSource,
  getSource,
  listSourcesForProfile,
  listSourcesForWorkspace,
  updateSource,
  deleteSource,
  getPolicyForProfile,
  upsertPolicy,
  getWorkspaceEmbeddingDefault,
  upsertWorkspaceEmbeddingDefault,
} from "./store";
