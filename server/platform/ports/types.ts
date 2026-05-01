/**
 * Platform Port Registry — Types
 *
 * Centralized type definitions for the runtime endpoint registry.
 * The registry tracks every port / URL / external endpoint a module
 * declares and verifies them at boot before two modules reach for
 * the same socket.
 *
 * Design notes:
 *  - "Port" here means any addressable runtime endpoint, not strictly
 *    a TCP port. URLs to external services (OpenCode HTTP, Ollama,
 *    Postgres) are first-class so the registry can render the full
 *    runtime topology.
 *  - Ranges (e.g. OpenCode Web 4200-4299) are declared once with
 *    mode="range"; runtime allocations from inside that range are
 *    tracked as PortReservation rows so duplicates surface fast.
 *  - "External" mode is for endpoints we point at but don't own
 *    (Ollama, Postgres). We still register them so health/topology
 *    views are complete, but we don't try to bind/listen.
 */

export type PortMode = "single" | "range" | "external" | "derived" | "disabled";

export type PortProtocol =
  | "http"
  | "https"
  | "tcp"
  | "ws"
  | "wss"
  | "postgres"
  | "custom";

export type PortHealthStatus =
  | "unknown"
  | "healthy"
  | "unreachable"
  | "conflict"
  | "reserved"
  | "disabled"
  | "degraded";

/**
 * Static declaration a module makes at registration time.
 *
 * `defaultPort` is used when `mode === "single"`.
 * `defaultRange` ([min, max] inclusive) is used when `mode === "range"`.
 * `defaultUrl` is used when the endpoint is purely URL-addressed
 *   (`mode === "external"` or `mode === "derived"`).
 * `env` / `envBase` / `envMax` name the environment variables that may
 *   override the defaults, so the registry can render where the value
 *   came from in topology dashboards.
 */
export interface ModulePortDeclaration {
  moduleKey: string;
  key: string;
  label: string;
  mode: PortMode;
  protocol: PortProtocol;

  env?: string;
  envBase?: string;
  envMax?: string;

  defaultPort?: number;
  defaultHost?: string;
  defaultUrl?: string;
  defaultRange?: [number, number];

  required?: boolean;
  runtimeOwned?: boolean;
  externallyManaged?: boolean;
  description?: string;
}

/**
 * A live reservation against a declared port or range.
 *
 * For `mode === "single"` declarations, exactly one reservation is
 * expected. For `mode === "range"` declarations, multiple reservations
 * may exist concurrently (one per running instance).
 *
 * `ownerRef` is an opaque module-supplied tag (e.g. an OpenCode Web
 * instance id) used so the owner can release the reservation later
 * without remembering the generated reservationId.
 */
export interface PortReservation {
  reservationId: string;
  moduleKey: string;
  key: string;
  port: number;
  host: string;
  protocol: PortProtocol;
  status: PortHealthStatus;
  ownerRef?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Snapshot suitable for dashboards / health endpoints.
 *
 * `conflictWith` is populated when detectConflicts found another
 * declaration or reservation pointing at the same host:port pair.
 */
export interface PortStatusSnapshot {
  moduleKey: string;
  key: string;
  label: string;
  mode: PortMode;
  protocol: PortProtocol;
  host?: string;
  port?: number;
  url?: string;
  range?: [number, number];
  health: PortHealthStatus;
  conflictWith?: Array<{ moduleKey: string; key: string }>;
  reservations?: PortReservation[];
  message?: string;
}
