/** KGRA Agent — Provided ports. */
import type { KgraRunRequest, KgraRunResponse } from "./contracts";

export interface KgraRunPort {
  run(req: KgraRunRequest): Promise<KgraRunResponse>;
}
