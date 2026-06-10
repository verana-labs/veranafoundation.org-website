import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { processLogo, LogoError, LOGO_MAX_BYTES } from "./logo";

const f = { name: "logo", type: "" };

async function png(w: number, h: number): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 4, background: { r: 118, g: 62, b: 240, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

describe("processLogo — SVG", () => {
  const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>`;

  it("accepts a plain SVG verbatim", async () => {
    const res = await processLogo(f, Buffer.from(SVG));
    expect(res.ext).toBe("svg");
    expect(res.data.toString()).toBe(SVG);
  });

  it("accepts an SVG with an XML prolog", async () => {
    const res = await processLogo(f, Buffer.from(`<?xml version="1.0"?>\n${SVG}`));
    expect(res.ext).toBe("svg");
  });

  for (const [label, evil] of [
    ["script", `<svg xmlns="a"><script>alert(1)</script></svg>`],
    ["event handler", `<svg onload="alert(1)"></svg>`],
    ["javascript: URL", `<svg><a href="javascript:alert(1)"><rect/></a></svg>`],
    ["foreignObject", `<svg><foreignObject><body/></foreignObject></svg>`],
    ["external href", `<svg><image href="https://evil.example/x.png"/></svg>`],
    ["external xlink", `<svg><image xlink:href="//evil.example/x"/></svg>`],
  ] as const) {
    it(`rejects SVG with ${label}`, async () => {
      await expect(processLogo(f, Buffer.from(evil))).rejects.toThrow(LogoError);
    });
  }
});

describe("processLogo — rasters", () => {
  it("re-encodes a PNG to WebP, downscaling to 512", async () => {
    const res = await processLogo(f, await png(1024, 700));
    expect(res.ext).toBe("webp");
    const meta = await sharp(res.data).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width!, meta.height!)).toBe(512);
  });

  it("never upscales small-but-valid images", async () => {
    const res = await processLogo(f, await png(100, 80));
    const meta = await sharp(res.data).metadata();
    expect(meta.width).toBe(100);
  });

  it("rejects images below 64px", async () => {
    await expect(processLogo(f, await png(32, 32))).rejects.toThrow(/too small/);
  });

  it("rejects non-image junk", async () => {
    await expect(processLogo(f, Buffer.from("not an image"))).rejects.toThrow(LogoError);
  });

  it("rejects oversize uploads", async () => {
    await expect(
      processLogo(f, Buffer.alloc(LOGO_MAX_BYTES + 1)),
    ).rejects.toThrow(/1 MB/);
  });
});
