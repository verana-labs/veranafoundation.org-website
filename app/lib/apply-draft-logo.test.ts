import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, utimesSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// The stash lives in the file store (STORAGE_DIR). Point it at a temp dir
// before importing the modules under test (storage.ts reads the env at load).
const root = mkdtempSync(path.join(tmpdir(), "apply-draft-logo-"));
process.env.STORAGE_DIR = root;

const mod = await import("./apply-draft-logo");

const TOKEN = "0123456789abcdef0123456789abcdef";
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';

describe("apply draft logo stash", () => {
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("stashes a valid SVG, reads it back, and deletes it", async () => {
    const file = new File([SVG], "logo.svg", { type: "image/svg+xml" });
    const stashed = await mod.stashDraftLogo(file);
    expect(stashed).not.toBeNull();
    expect(stashed!.ext).toBe("svg");
    expect(stashed!.token).toMatch(/^[a-f0-9]{32}$/);
    const bytes = await mod.readDraftLogo(stashed!.token, "svg");
    expect(bytes?.toString("utf8")).toBe(SVG);
    await mod.deleteDraftLogo(stashed!.token, "svg");
    expect(await mod.readDraftLogo(stashed!.token, "svg")).toBeNull();
  });

  it("rejects a logo with active content instead of stashing it", async () => {
    const file = new File([SVG.replace("<rect", "<script>alert(1)</script><rect")], "x.svg", {
      type: "image/svg+xml",
    });
    expect(await mod.stashDraftLogo(file)).toBeNull();
  });

  it("refuses malformed tokens and never resolves outside the stash", async () => {
    expect(() => mod.draftLogoKey("../x", "svg")).toThrow();
    expect(await mod.readDraftLogo("../../etc/passwd", "svg")).toBeNull();
    await mod.deleteDraftLogo("../x", "svg"); // no-op, no throw
  });

  it("sweeps stashes older than the draft lifetime and keeps fresh ones", async () => {
    const dir = path.join(root, "apply-drafts");
    const fresh = path.join(dir, `${TOKEN}.svg`);
    const stale = path.join(dir, `${TOKEN.replace("0", "f")}.webp`);
    writeFileSync(fresh, SVG);
    writeFileSync(stale, "x");
    const old = (Date.now() - 2 * 60 * 60 * 1000) / 1000;
    utimesSync(stale, old, old);
    await mod.sweepDraftLogos();
    expect(existsSync(fresh)).toBe(true);
    expect(existsSync(stale)).toBe(false);
  });
});
