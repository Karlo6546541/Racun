import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildContent } from "./normalize";

/** Node-only: reads content/*.json from disk (seed, validation, tests). */
export function loadContentFromDisk(dir = join(process.cwd(), "content")) {
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  const files: Record<string, unknown> = {};
  for (const f of (meta.unitFiles ?? []) as string[]) {
    try {
      files[f] = JSON.parse(readFileSync(join(dir, f), "utf8"));
    } catch {
      /* reported as missing by buildContent */
    }
  }
  return buildContent(meta, files);
}
