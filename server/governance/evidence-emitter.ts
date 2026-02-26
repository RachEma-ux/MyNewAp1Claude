import fs from "fs";

export function emitEvidence(path: string, payload: any) {
  fs.writeFileSync(path, JSON.stringify(payload, null, 2));
}
