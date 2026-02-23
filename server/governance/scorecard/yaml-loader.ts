/**
 * YAML Control Catalog Loader
 *
 * Loads control definitions from controls/*.yaml files.
 * Falls back gracefully if js-yaml is not installed.
 */

import * as fs from "fs";
import * as path from "path";
import type { ControlDefinition } from "./control-catalog";

// Try to load js-yaml, fall back gracefully
let yaml: any = null;
try {
  yaml = require("js-yaml");
} catch {
  // js-yaml not available, will use fallback
}

export function loadControlsFromYaml(): ControlDefinition[] | null {
  if (!yaml) return null;

  const controlsDir = path.resolve(process.cwd(), "controls");
  if (!fs.existsSync(controlsDir)) return null;

  const packFiles = ["base", "provider", "llm", "model", "agent", "bot"];
  const controls: ControlDefinition[] = [];

  for (const pack of packFiles) {
    const filePath = path.join(controlsDir, `${pack}.yaml`);
    if (!fs.existsSync(filePath)) continue;

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = yaml.load(content) as { pack: string; controls: ControlDefinition[] };
      if (parsed?.controls && Array.isArray(parsed.controls)) {
        controls.push(
          ...parsed.controls.map(
            (c) => ({ ...c, pack: parsed.pack || pack } as ControlDefinition)
          )
        );
      }
    } catch (err) {
      console.warn(`[YAMLLoader] Failed to load ${filePath}:`, err);
    }
  }

  return controls.length > 0 ? controls : null;
}
