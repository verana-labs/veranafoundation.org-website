import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

// storage.ts resolves its root from STORAGE_DIR at import time, so point it at a
// throwaway temp dir before importing the module.
const tmpRoot = path.join(os.tmpdir(), `verana-storage-test-${Date.now()}`);
process.env.STORAGE_DIR = tmpRoot;
const { putFile, getFile, deleteFile } = await import("./storage");

afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe("storage", () => {
  it("round-trips bytes through a nested key", async () => {
    const data = Buffer.from("%PDF-1.7 hello");
    const key = await putFile("agreements/member-123.pdf", data);
    expect(key).toBe("agreements/member-123.pdf");
    const back = await getFile(key);
    expect(back.equals(data)).toBe(true);
  });

  it("deleteFile is idempotent", async () => {
    await putFile("x/y.bin", Buffer.from("z"));
    await deleteFile("x/y.bin");
    await deleteFile("x/y.bin"); // no throw on missing
    await expect(getFile("x/y.bin")).rejects.toThrow();
  });

  it("rejects path traversal", async () => {
    await expect(putFile("../escape.bin", Buffer.from("no"))).rejects.toThrow(/invalid key/);
    await expect(getFile("../../etc/passwd")).rejects.toThrow(/invalid key/);
  });
});
