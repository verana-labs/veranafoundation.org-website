import { describe, it, expect } from "vitest";
import {
  parseFrontMatter,
  stripLeadingHeading,
  trackModuleCodes,
  trackHours,
  pickLatestVersion,
  documentVersionLabel,
  getCertificationDocument,
  type Track,
  type ModuleMeta,
} from "./certification";

const modules: ModuleMeta[] = [
  { code: "C1", title: "a", hours: 4, assessment: "exam", status: "published", group: "core", summary: "" },
  { code: "C2", title: "b", hours: 4, assessment: "exam", status: "published", group: "core", summary: "" },
  { code: "C4", title: "c", hours: 3, assessment: "lab", status: "published", group: "core", summary: "" },
  { code: "T1", title: "d", hours: 8, assessment: "lab", status: "outline", group: "technical", summary: "" },
  { code: "T2", title: "e", hours: 12, assessment: "lab", status: "outline", group: "technical", summary: "" },
  { code: "T3", title: "f", hours: 8, assessment: "lab", status: "outline", group: "technical", summary: "" },
  { code: "T6", title: "g", hours: 4, assessment: "exam", status: "outline", group: "technical", summary: "" },
  { code: "B1", title: "h", hours: 8, assessment: "case study", status: "outline", group: "business", summary: "" },
];

const developer: Track = {
  slug: "developer-integrator",
  name: "Developer and Integrator",
  level: 2,
  phase: 1,
  core: ["C1", "C2", "C4"],
  modules: ["T2", "T6"],
  choice: [["T3", "T1"]],
  audience: "",
  summary: "",
};

describe("parseFrontMatter", () => {
  it("reads flat key: value pairs and returns the body", () => {
    const { data, body } = parseFrontMatter(
      "---\ncode: C1\ntitle: Verifiable Trust fundamentals\nhours: 4\n---\n\n# C1. Title\n\nText.",
    );
    expect(data.code).toBe("C1");
    expect(data.title).toBe("Verifiable Trust fundamentals");
    expect(data.hours).toBe("4");
    expect(body.trim().startsWith("# C1. Title")).toBe(true);
  });

  it("returns the whole text as body without fences", () => {
    expect(parseFrontMatter("plain").body).toBe("plain");
  });
});

describe("stripLeadingHeading", () => {
  it("drops only the first H1", () => {
    expect(stripLeadingHeading("# A\n\n## B\n\ntext")).toBe("## B\n\ntext");
    expect(stripLeadingHeading("## B\n\ntext")).toBe("## B\n\ntext");
  });
});

describe("trackModuleCodes / trackHours", () => {
  it("lists core, required, choice and reduced modules once", () => {
    expect(trackModuleCodes({ ...developer, reduced: ["B1", "C1"] })).toEqual([
      "C1", "C2", "C4", "T2", "T6", "T3", "T1", "B1",
    ]);
  });

  it("sums fixed hours and spans the choice group", () => {
    // core 11 + T2 12 + T6 4 = 27; choice T3 8 or T1 8
    expect(trackHours(developer, modules)).toEqual({ min: 35, max: 35 });
    const wide = { ...developer, choice: [["T3", "T2"]], modules: ["T6"] };
    // core 11 + T6 4 = 15; choice 8 or 12
    expect(trackHours(wide, modules)).toEqual({ min: 23, max: 27 });
  });

  it("ignores reduced modules in the hours", () => {
    expect(trackHours({ ...developer, reduced: ["B1"] }, modules)).toEqual({ min: 35, max: 35 });
  });
});

describe("pickLatestVersion / documentVersionLabel", () => {
  it("picks the highest numeric version and ignores other files", () => {
    const files = ["README.md", "certification-policy-v1.md", "certification-policy-v10.md", "certification-policy-v2.md", "candidate-terms-v3.md"];
    expect(pickLatestVersion(files, "certification-policy")).toBe("certification-policy-v10.md");
    expect(pickLatestVersion(files, "candidate-terms")).toBe("candidate-terms-v3.md");
    expect(pickLatestVersion(files, "authorized-certificator-agreement")).toBeNull();
  });

  it("compares dotted versions numerically", () => {
    expect(pickLatestVersion(["x-v1.2.md", "x-v1.10.md"], "x")).toBe("x-v1.10.md");
    expect(documentVersionLabel("certification-policy-v1.10.md")).toBe("v1.10");
  });
});

describe("getCertificationDocument", () => {
  it("returns null or a hashed document, never throws", async () => {
    const doc = await getCertificationDocument("certification-policy");
    if (doc) {
      expect(doc.version).toMatch(/^v\d+/);
      expect(doc.sha384).toMatch(/^sha384-/);
      expect(doc.markdown).toContain("CERTIFICATION POLICY");
    } else {
      expect(doc).toBeNull();
    }
  });
});
