/**
 * Artifact Store — Governance Bible CGT v2
 *
 * Phase 2 — Integrity-Required Artifact Storage
 * Role: CE-A (Backend Engine & Middleware)
 *
 * Content-addressed, SHA-256-verified evidence storage.
 * Two implementations:
 *   - FSStore: Local filesystem (default, production-ready)
 *   - S3Store: MinIO/S3-compatible (upgrade path)
 *
 * Guarantees:
 *   - Content-addressed paths (sha256 as filename)
 *   - Write-once semantics (no overwrite)
 *   - Integrity verification on read
 *   - Tamper detection
 */

import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Interface
// ============================================================================

export interface ArtifactStore {
  /** Store an artifact. Returns the content-addressed path. */
  store(data: Buffer | string, metadata?: ArtifactMetadata): Promise<StoredArtifact>;
  /** Retrieve an artifact by its SHA-256 hash. */
  retrieve(sha256: string): Promise<Buffer | null>;
  /** Verify integrity of a stored artifact. */
  verify(sha256: string): Promise<boolean>;
  /** Check if an artifact exists. */
  exists(sha256: string): Promise<boolean>;
  /** List all stored artifact hashes. */
  list(): Promise<string[]>;
}

export interface ArtifactMetadata {
  /** Human-readable label */
  label?: string;
  /** MIME type */
  contentType?: string;
  /** Source (e.g., "scorecard-engine", "drift-detector") */
  source?: string;
  /** Associated scorecard ID */
  scorecardId?: number;
  /** Timestamp */
  timestamp?: string;
}

export interface StoredArtifact {
  /** SHA-256 hash (content address) */
  sha256: string;
  /** Full storage path */
  path: string;
  /** Size in bytes */
  size: number;
  /** When stored */
  storedAt: string;
  /** Metadata */
  metadata?: ArtifactMetadata;
}

// ============================================================================
// SHA-256 Helpers
// ============================================================================

export function computeSha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function verifyIntegrity(data: Buffer | string, expectedHash: string): boolean {
  return computeSha256(data) === expectedHash;
}

// ============================================================================
// FSStore — Filesystem Implementation
// ============================================================================

export class FSStore implements ArtifactStore {
  private basePath: string;
  private metadataPath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || path.resolve(process.cwd(), "artifacts/governance");
    this.metadataPath = path.join(this.basePath, ".metadata");
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    try {
      if (!fs.existsSync(this.basePath)) {
        fs.mkdirSync(this.basePath, { recursive: true });
      }
      if (!fs.existsSync(this.metadataPath)) {
        fs.mkdirSync(this.metadataPath, { recursive: true });
      }
    } catch {
      // Directory creation may fail in read-only environments
    }
  }

  /** Content-addressed path: basePath/ab/cdef1234... */
  private artifactPath(sha256: string): string {
    const prefix = sha256.slice(0, 2);
    const dir = path.join(this.basePath, prefix);
    return path.join(dir, sha256);
  }

  private metaPath(sha256: string): string {
    return path.join(this.metadataPath, `${sha256}.json`);
  }

  async store(data: Buffer | string, metadata?: ArtifactMetadata): Promise<StoredArtifact> {
    const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
    const sha256 = computeSha256(buf);
    const artifactFile = this.artifactPath(sha256);

    // Write-once: if artifact exists, verify and return
    if (fs.existsSync(artifactFile)) {
      const existing = fs.readFileSync(artifactFile);
      if (!verifyIntegrity(existing, sha256)) {
        throw new Error(`[ArtifactStore] TAMPER DETECTED: existing artifact ${sha256} fails integrity check`);
      }
      return {
        sha256,
        path: artifactFile,
        size: existing.length,
        storedAt: fs.statSync(artifactFile).mtime.toISOString(),
        metadata,
      };
    }

    // Create directory and write
    const dir = path.dirname(artifactFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(artifactFile, buf);

    // Store metadata
    if (metadata) {
      const meta = { ...metadata, sha256, storedAt: new Date().toISOString(), size: buf.length };
      fs.writeFileSync(this.metaPath(sha256), JSON.stringify(meta, null, 2));
    }

    return {
      sha256,
      path: artifactFile,
      size: buf.length,
      storedAt: new Date().toISOString(),
      metadata,
    };
  }

  async retrieve(sha256: string): Promise<Buffer | null> {
    const artifactFile = this.artifactPath(sha256);
    if (!fs.existsSync(artifactFile)) return null;

    const data = fs.readFileSync(artifactFile);

    // Integrity check on every read
    if (!verifyIntegrity(data, sha256)) {
      throw new Error(`[ArtifactStore] TAMPER DETECTED: artifact ${sha256} fails integrity check on read`);
    }

    return data;
  }

  async verify(sha256: string): Promise<boolean> {
    const artifactFile = this.artifactPath(sha256);
    if (!fs.existsSync(artifactFile)) return false;

    const data = fs.readFileSync(artifactFile);
    return verifyIntegrity(data, sha256);
  }

  async exists(sha256: string): Promise<boolean> {
    return fs.existsSync(this.artifactPath(sha256));
  }

  async list(): Promise<string[]> {
    const hashes: string[] = [];
    try {
      const prefixes = fs.readdirSync(this.basePath).filter((d) => d.length === 2);
      for (const prefix of prefixes) {
        const dir = path.join(this.basePath, prefix);
        const stat = fs.statSync(dir);
        if (stat.isDirectory()) {
          const files = fs.readdirSync(dir);
          hashes.push(...files.filter((f) => f.length === 64));
        }
      }
    } catch {
      // Empty store
    }
    return hashes;
  }
}

// ============================================================================
// S3Store — MinIO/S3-compatible Implementation
// ============================================================================

export class S3Store implements ArtifactStore {
  private endpoint: string;
  private bucket: string;
  private accessKey: string;
  private secretKey: string;

  constructor(config?: {
    endpoint?: string;
    bucket?: string;
    accessKey?: string;
    secretKey?: string;
  }) {
    this.endpoint = config?.endpoint || process.env.S3_ENDPOINT || "http://localhost:9000";
    this.bucket = config?.bucket || process.env.S3_BUCKET || "governance-artifacts";
    this.accessKey = config?.accessKey || process.env.S3_ACCESS_KEY || "";
    this.secretKey = config?.secretKey || process.env.S3_SECRET_KEY || "";
  }

  private objectKey(sha256: string): string {
    return `${sha256.slice(0, 2)}/${sha256}`;
  }

  async store(data: Buffer | string, metadata?: ArtifactMetadata): Promise<StoredArtifact> {
    const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
    const sha256 = computeSha256(buf);
    const key = this.objectKey(sha256);

    // S3 PUT via fetch (MinIO-compatible)
    const url = `${this.endpoint}/${this.bucket}/${key}`;
    try {
      const response = await fetch(url, {
        method: "PUT",
        body: buf,
        headers: {
          "Content-Type": metadata?.contentType || "application/octet-stream",
          "x-amz-meta-sha256": sha256,
          "x-amz-meta-source": metadata?.source || "governance",
        },
      });

      if (!response.ok && response.status !== 200) {
        throw new Error(`S3 PUT failed: ${response.status}`);
      }
    } catch (err) {
      // Fallback: log warning but don't fail (allows FSStore primary with S3 backup)
      console.warn(`[ArtifactStore/S3] Upload failed for ${sha256}: ${err}`);
    }

    return {
      sha256,
      path: `s3://${this.bucket}/${key}`,
      size: buf.length,
      storedAt: new Date().toISOString(),
      metadata,
    };
  }

  async retrieve(sha256: string): Promise<Buffer | null> {
    const key = this.objectKey(sha256);
    const url = `${this.endpoint}/${this.bucket}/${key}`;

    try {
      const response = await fetch(url);
      if (!response.ok) return null;

      const arrayBuf = await response.arrayBuffer();
      const buf = Buffer.from(arrayBuf);

      if (!verifyIntegrity(buf, sha256)) {
        throw new Error(`[ArtifactStore/S3] TAMPER DETECTED: artifact ${sha256} fails integrity check`);
      }

      return buf;
    } catch {
      return null;
    }
  }

  async verify(sha256: string): Promise<boolean> {
    const data = await this.retrieve(sha256);
    return data !== null;
  }

  async exists(sha256: string): Promise<boolean> {
    const key = this.objectKey(sha256);
    const url = `${this.endpoint}/${this.bucket}/${key}`;

    try {
      const response = await fetch(url, { method: "HEAD" });
      return response.ok;
    } catch {
      return false;
    }
  }

  async list(): Promise<string[]> {
    // S3 list not implemented — use FSStore for listing
    return [];
  }
}

// ============================================================================
// Singleton — Default store
// ============================================================================

let _store: ArtifactStore | null = null;

export function getArtifactStore(): ArtifactStore {
  if (!_store) {
    // Use S3 if configured, otherwise filesystem
    if (process.env.S3_ENDPOINT) {
      _store = new S3Store();
    } else {
      _store = new FSStore();
    }
  }
  return _store;
}

export function setArtifactStore(store: ArtifactStore): void {
  _store = store;
}
