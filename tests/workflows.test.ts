import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = new URL("../.github/workflows/", import.meta.url);

describe("GitHub workflows", () => {
  it("use the .yaml extension", () => {
    expect(readdirSync(dir).filter((f) => f.endsWith(".yml"))).toEqual([]);
  });

  it("publish a tarball by a local path, not as a GitHub shorthand", () => {
    // npm reads "release/x.tgz" as the GitHub repository "release/x.tgz".
    const release = readFileSync(new URL("release.yaml", dir), "utf8");
    const args = [...release.matchAll(/npm publish\s+"([^"]+\.tgz)"/g)].map((m) => m[1]);
    expect(args.length).toBeGreaterThan(0);
    for (const arg of args) expect(arg).toMatch(/^\.\//);
  });
});
