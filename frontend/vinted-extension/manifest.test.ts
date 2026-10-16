import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

type Manifest = {
  manifest_version: number;
  permissions?: string[];
  host_permissions?: string[];
  background?: { service_worker?: string };
  content_scripts?: Array<{ matches: string[]; js: string[]; css?: string[] }>;
};

describe("Vinted Assistant extension manifest", () => {
  it("grants only the loopback and Vinted form access needed by the bridge", () => {
    const manifest = JSON.parse(
      readFileSync(resolve("vinted-extension/manifest.json"), "utf8"),
    ) as Manifest;

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions ?? []).toEqual([]);
    expect(manifest.host_permissions).toEqual(["http://127.0.0.1:8000/*"]);
    expect(manifest.background?.service_worker).toBe("background.js");
    expect(manifest.content_scripts).toEqual([
      {
        matches: ["https://www.vinted.it/items/new*"],
        js: ["bridge-core.js", "content.js"],
        css: ["content.css"],
      },
    ]);
    expect(JSON.stringify(manifest)).not.toMatch(/cookies|webRequest|<all_urls>|tabs/i);
    for (const filename of [
      manifest.background?.service_worker,
      ...(manifest.content_scripts?.flatMap((script) => [
        ...script.js,
        ...(script.css ?? []),
      ]) ?? []),
    ]) {
      expect(filename && existsSync(resolve("vinted-extension", filename))).toBe(true);
    }
  });
});
