import { describe, it, expect } from "vitest";
import { sha384, versionLabel, listVersionFiles, readVersionFile } from "./agreement-versions";

describe("sha384", () => {
  it("returns deterministic SRI-form sha384", () => {
    const h = sha384("hello");
    expect(h).toMatch(/^sha384-[A-Za-z0-9+/]+=*$/);
    expect(sha384("hello")).toBe(h);
    expect(sha384("hellp")).not.toBe(h);
  });
});

describe("versionLabel", () => {
  it("extracts a vN label from the filename", () => {
    expect(versionLabel("membership-agreement-v1.md")).toBe("v1");
    expect(versionLabel("membership-agreement-v2.3.md")).toBe("v2.3");
    expect(versionLabel("plain.md")).toBe("plain");
  });
});

describe("listVersionFiles / readVersionFile", () => {
  it("lists the bundled v1 file", async () => {
    expect(await listVersionFiles()).toContain("membership-agreement-v1.md");
  });

  it("reads a known version file", async () => {
    expect(await readVersionFile("membership-agreement-v1.md")).toContain("MEMBERSHIP AGREEMENT");
  });

  it("rejects path traversal and non-markdown names", async () => {
    await expect(readVersionFile("../package.json")).rejects.toThrow(/invalid filename/);
    await expect(readVersionFile("foo.txt")).rejects.toThrow(/invalid filename/);
    await expect(readVersionFile("a/b.md")).rejects.toThrow(/invalid filename/);
  });
});
