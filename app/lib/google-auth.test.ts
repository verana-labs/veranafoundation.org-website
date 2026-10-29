import { afterEach, describe, expect, it, vi } from "vitest";
import { hostForLanguage } from "./google-auth";

describe("hostForLanguage", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is the default host (null) when no mapping is set", () => {
    vi.stubEnv("GOOGLE_MEETINGS_HOSTS", "");
    expect(hostForLanguage("es")).toBeNull();
    expect(hostForLanguage("en")).toBeNull();
  });

  it("maps a language to its host, case- and space-insensitively", () => {
    vi.stubEnv("GOOGLE_MEETINGS_HOSTS", " es = Meeting-ES@veranafoundation.org , fr=meetings-fr@veranafoundation.org");
    expect(hostForLanguage("es")).toBe("meeting-es@veranafoundation.org");
    expect(hostForLanguage("ES")).toBe("meeting-es@veranafoundation.org");
    expect(hostForLanguage("fr")).toBe("meetings-fr@veranafoundation.org");
    expect(hostForLanguage("en")).toBeNull();
  });

  it("treats an entry naming the default host as no entry", () => {
    vi.stubEnv("GOOGLE_CALENDAR_IMPERSONATE", "meetings@veranafoundation.org");
    vi.stubEnv("GOOGLE_MEETINGS_HOSTS", "en=Meetings@veranafoundation.org");
    expect(hostForLanguage("en")).toBeNull();
  });

  it("ignores malformed pairs", () => {
    vi.stubEnv("GOOGLE_MEETINGS_HOSTS", "es,=x@y.org,de=");
    expect(hostForLanguage("es")).toBeNull();
    expect(hostForLanguage("de")).toBeNull();
  });
});
