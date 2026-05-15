/**
 * Cross-process pub-sub primitives — public API barrel.
 *
 * V1+ PR-V1-166. Extracted from the two existing in-tree
 * implementations (region cache invalidation + approval event bus
 * cross-process). The primitive is meant for any future
 * cross-process bus need; existing implementations stay as-is for
 * now.
 */

export {
  createPgListenNotifyBus,
  STRING_CODEC,
  jsonCodec,
  type PgListenNotifyBus,
  type PgListenNotifyBusConfig,
} from "./pg-listen-notify-bus.js";
