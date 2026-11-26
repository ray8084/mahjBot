import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Card, type CardPatternJson } from "./card";

/** Node/CLI helper — keeps fs out of the browser bundle. */
export function loadCard2026(path?: string): Card {
  const here = dirname(fileURLToPath(import.meta.url));
  const jsonPath = path ?? join(here, "..", "data", "card2026.json");
  const patterns = JSON.parse(readFileSync(jsonPath, "utf8")) as CardPatternJson[];
  return Card.fromPatterns(patterns);
}
