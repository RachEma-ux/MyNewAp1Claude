import fs from "fs";
import crypto from "crypto";

export function validateRegistry(indexPath: string) {
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));

  for (const obj of index.objects) {
    if (obj.status === "locked" && !obj.checksums) {
      throw new Error(`Locked object missing checksums: ${obj.id}`);
    }
  }

  return true;
}
