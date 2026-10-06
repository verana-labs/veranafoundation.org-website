import { describe, expect, it } from "vitest";
import { WG_REGION_CODES, regionLabel } from "./regions";
import { languageLabel, languageNative } from "./languages";

describe("regions & languages", () => {
  it("labels regions and falls back to the code", () => {
    expect(regionLabel("latin_america")).toBe("Latin America");
    expect(WG_REGION_CODES[0]).toBe("global");
  });
  it("labels languages in English and in their own name", () => {
    expect(languageLabel("es")).toBe("Spanish");
    expect(languageNative("es")).toBe("Español");
    expect(languageNative("xx")).toBe("xx");
  });
});
