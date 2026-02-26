import crypto from "crypto";
import fs from "fs";

export function sha256File(path: string) {
  const buf = fs.readFileSync(path);
  return crypto.createHash("sha256").update(buf).digest("hex");
}
