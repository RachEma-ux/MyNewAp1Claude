import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const repoRoot = process.cwd();
const indexPath = path.join(repoRoot, "Template", "Shell", "templates.index.json");

function sha256File(absPath) {
  const buf = fs.readFileSync(absPath);
  const hash = crypto.createHash("sha256").update(buf).digest("hex");
  return `sha256:${hash}`;
}

const indexJson = JSON.parse(fs.readFileSync(indexPath, "utf8"));

if (!Array.isArray(indexJson.objects)) {
  throw new Error("templates.index.json missing objects[]");
}

for (const obj of indexJson.objects) {
  if (!obj.paths || typeof obj.paths !== "object") continue;

  obj.checksums = obj.checksums && typeof obj.checksums === "object" ? obj.checksums : {};

  for (const [k, relPath] of Object.entries(obj.paths)) {
    if (typeof relPath !== "string" || relPath.length === 0) continue;

    const absPath = path.join(repoRoot, relPath);
    if (!fs.existsSync(absPath)) {
      obj.checksums[k] = "MISSING_FILE";
      continue;
    }
    obj.checksums[k] = sha256File(absPath);
  }
}

indexJson.generatedAt = new Date().toISOString();

fs.writeFileSync(indexPath, JSON.stringify(indexJson, null, 2) + "\n", "utf8");
console.log("Updated registry checksums:", indexPath);
