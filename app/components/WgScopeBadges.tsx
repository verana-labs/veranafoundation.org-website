import type { WgRegion } from "@prisma/client";
import { regionLabel } from "@/app/lib/regions";
import { languageNative } from "@/app/lib/languages";

/**
 * Region and working-language badges of a group (regional groups). Global
 * English groups, the default, show nothing so the board stays quiet.
 */
export default function WgScopeBadges({
  region,
  language,
  className = "",
}: {
  region: WgRegion;
  language: string;
  className?: string;
}) {
  const badges: string[] = [];
  if (region !== "global") badges.push(regionLabel(region));
  if (language !== "en") badges.push(languageNative(language));
  if (badges.length === 0) return null;
  return (
    <>
      {badges.map((b) => (
        <span key={b} className={`badge ${className}`.trim()}>
          {b}
        </span>
      ))}
    </>
  );
}
