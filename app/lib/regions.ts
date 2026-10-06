import type { WgRegion } from "@prisma/client";

/** Regions a working group can be scoped to; `global` is the default and shows no badge. */
export const WG_REGIONS: { code: WgRegion; label: string }[] = [
  { code: "global", label: "Global" },
  { code: "europe", label: "Europe" },
  { code: "latin_america", label: "Latin America" },
  { code: "north_america", label: "North America" },
  { code: "africa", label: "Africa" },
  { code: "asia_pacific", label: "Asia-Pacific" },
];

export const WG_REGION_CODES = WG_REGIONS.map((r) => r.code) as [WgRegion, ...WgRegion[]];

export function regionLabel(code: WgRegion): string {
  return WG_REGIONS.find((r) => r.code === code)?.label ?? code;
}
