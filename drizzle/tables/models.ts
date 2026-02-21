import { integer, serial, varchar, pgTable, text, timestamp, boolean, json } from "drizzle-orm/pg-core";
import { users } from "./users";

// ============================================================================
// Model Management
// ============================================================================

export const models = pgTable("models", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  displayName: varchar("displayName", { length: 255 }).notNull(),
  modelType: varchar("modelType", { length: 50 }).notNull(),

  // Model metadata
  huggingFaceId: varchar("huggingFaceId", { length: 255 }),
  architecture: varchar("architecture", { length: 100 }),
  parameterCount: varchar("parameterCount", { length: 50 }),
  quantization: varchar("quantization", { length: 50 }),
  contextLength: integer("contextLength"),

  // File information
  fileSize: varchar("fileSize", { length: 50 }),
  filePath: text("filePath"),
  fileFormat: varchar("fileFormat", { length: 50 }).default("gguf"),

  // Status
  status: varchar("status", { length: 50 }).default("ready"),
  downloadProgress: integer("downloadProgress").default(0),

  // Performance metrics
  tokensPerSecond: integer("tokensPerSecond"),
  memoryUsageMb: integer("memoryUsageMb"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Model = typeof models.$inferSelect;
export type InsertModel = typeof models.$inferInsert;

export const modelConfigs = pgTable("model_configs", {
  id: serial("id").primaryKey(),
  modelId: integer("modelId").notNull().references(() => models.id),
  userId: integer("userId").notNull().references(() => users.id),

  // Inference parameters
  temperature: varchar("temperature", { length: 10 }).default("0.7"),
  topP: varchar("topP", { length: 10 }).default("0.9"),
  topK: integer("topK").default(40),
  maxTokens: integer("maxTokens").default(2048),
  repeatPenalty: varchar("repeatPenalty", { length: 10 }).default("1.1"),

  // Advanced settings
  stopSequences: json("stopSequences"),
  systemPrompt: text("systemPrompt"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ModelConfig = typeof modelConfigs.$inferSelect;
export type InsertModelConfig = typeof modelConfigs.$inferInsert;

// Model Downloads
export const modelDownloads = pgTable("model_downloads", {
  id: serial("id").primaryKey(),
  modelId: integer("modelId").notNull(),
  userId: integer("userId").notNull(),

  // Download info
  sourceUrl: text("sourceUrl").notNull(),
  destinationPath: text("destinationPath"),
  fileSize: varchar("fileSize", { length: 50 }),

  // Progress tracking
  status: varchar("status", { length: 50 }).default("queued"),
  progress: integer("progress").default(0),
  bytesDownloaded: varchar("bytesDownloaded", { length: 50 }).default("0"),
  downloadSpeed: varchar("downloadSpeed", { length: 50 }),

  // Scheduling
  priority: integer("priority").default(0),
  scheduledFor: timestamp("scheduledFor"),
  bandwidthLimit: integer("bandwidthLimit"),

  // Error handling
  errorMessage: text("errorMessage"),
  retryCount: integer("retryCount").default(0),

  // Timestamps
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ModelDownload = typeof modelDownloads.$inferSelect;
export type InsertModelDownload = typeof modelDownloads.$inferInsert;

// Model Versions
export const modelVersions = pgTable("model_versions", {
  id: serial("id").primaryKey(),
  modelId: integer("modelId").notNull(),

  // Version info
  version: varchar("version", { length: 50 }).notNull(),
  releaseDate: timestamp("releaseDate"),

  // Model details
  sourceUrl: text("sourceUrl"),
  fileSize: varchar("fileSize", { length: 50 }),
  checksum: varchar("checksum", { length: 128 }),

  // Changelog
  changelog: text("changelog"),

  // Status
  isLatest: boolean("isLatest").default(false),
  isDeprecated: boolean("isDeprecated").default(false),

  // Metadata
  downloadCount: integer("downloadCount").default(0),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ModelVersion = typeof modelVersions.$inferSelect;
export type InsertModelVersion = typeof modelVersions.$inferInsert;

// Model Conversions
export const modelConversions = pgTable("model_conversions", {
  id: serial("id").primaryKey(),
  modelId: integer("modelId").notNull(),
  userId: integer("userId").notNull(),

  // Conversion details
  sourceFormat: varchar("sourceFormat", { length: 50 }).notNull(),
  targetFormat: varchar("targetFormat", { length: 50 }).notNull(),
  quantization: varchar("quantization", { length: 50 }),

  // Files
  sourcePath: text("sourcePath").notNull(),
  outputPath: text("outputPath"),

  // Progress
  status: varchar("status", { length: 50 }).default("queued"),
  progress: integer("progress").default(0),

  // Results
  outputSize: varchar("outputSize", { length: 50 }),
  errorMessage: text("errorMessage"),

  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ModelConversion = typeof modelConversions.$inferSelect;
export type InsertModelConversion = typeof modelConversions.$inferInsert;

// Download Analytics
export const downloadAnalytics = pgTable("download_analytics", {
  id: serial("id").primaryKey(),
  downloadId: integer("downloadId").notNull(),
  modelId: integer("modelId").notNull(),
  userId: integer("userId").notNull(),

  // Bandwidth metrics
  instantSpeed: varchar("instantSpeed", { length: 50 }),
  averageSpeed: varchar("averageSpeed", { length: 50 }),
  bytesDownloaded: varchar("bytesDownloaded", { length: 50 }),

  // Time metrics
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  elapsedSeconds: integer("elapsedSeconds").default(0),

  // Network info
  connectionType: varchar("connectionType", { length: 50 }),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DownloadAnalytic = typeof downloadAnalytics.$inferSelect;
export type InsertDownloadAnalytic = typeof downloadAnalytics.$inferInsert;

// Model Shares
export const modelShares = pgTable("model_shares", {
  id: serial("id").primaryKey(),
  modelId: integer("modelId").notNull(),

  // Storage info
  storagePath: text("storagePath").notNull(),
  fileSize: varchar("fileSize", { length: 50 }),
  checksum: varchar("checksum", { length: 128 }),

  // Reference counting
  referenceCount: integer("referenceCount").default(1).notNull(),

  // Sharing scope
  shareScope: varchar("shareScope", { length: 50 }).default("user"),
  ownerId: integer("ownerId").notNull(),

  // Metadata
  lastAccessedAt: timestamp("lastAccessedAt").defaultNow(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ModelShare = typeof modelShares.$inferSelect;
export type InsertModelShare = typeof modelShares.$inferInsert;

// Model Share References
export const modelShareReferences = pgTable("model_share_references", {
  id: serial("id").primaryKey(),
  shareId: integer("shareId").notNull(),

  // Reference owner
  userId: integer("userId"),
  workspaceId: integer("workspaceId"),

  // Access tracking
  lastUsedAt: timestamp("lastUsedAt").defaultNow(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ModelShareReference = typeof modelShareReferences.$inferSelect;
export type InsertModelShareReference = typeof modelShareReferences.$inferInsert;

// Model Benchmarks
export const modelBenchmarks = pgTable("model_benchmarks", {
  id: serial("id").primaryKey(),
  modelId: integer("modelId").notNull(),

  // Benchmark type
  benchmarkType: varchar("benchmarkType", { length: 50 }).notNull(),
  benchmarkName: varchar("benchmarkName", { length: 255 }).notNull(),

  // Results
  score: varchar("score", { length: 50 }),
  tokensPerSecond: integer("tokensPerSecond"),
  memoryUsageMb: integer("memoryUsageMb"),
  costPer1kTokens: varchar("costPer1kTokens", { length: 20 }),

  // Metadata
  metadata: json("metadata"),

  runBy: integer("runBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ModelBenchmark = typeof modelBenchmarks.$inferSelect;
export type InsertModelBenchmark = typeof modelBenchmarks.$inferInsert;

// Hardware Detection
export const hardwareProfiles = pgTable("hardware_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),

  // CPU info
  cpuModel: varchar("cpuModel", { length: 255 }),
  cpuCores: integer("cpuCores"),
  cpuThreads: integer("cpuThreads"),

  // GPU info
  gpuModel: varchar("gpuModel", { length: 255 }),
  gpuVram: integer("gpuVram"),
  gpuDriver: varchar("gpuDriver", { length: 100 }),
  gpuComputeCapability: varchar("gpuComputeCapability", { length: 50 }),

  // Memory
  totalRamMb: integer("totalRamMb"),
  availableRamMb: integer("availableRamMb"),

  // Capabilities
  supportsCuda: boolean("supportsCuda").default(false),
  supportsRocm: boolean("supportsRocm").default(false),
  supportsMetal: boolean("supportsMetal").default(false),

  // Score
  performanceScore: integer("performanceScore"),

  detectedAt: timestamp("detectedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type HardwareProfile = typeof hardwareProfiles.$inferSelect;
export type InsertHardwareProfile = typeof hardwareProfiles.$inferInsert;
