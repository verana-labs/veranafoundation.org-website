/** Languages a working group can pick for its drafted minutes (ADR-0004). */
export const MINUTES_LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
];

export function languageLabel(code: string): string {
  return MINUTES_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
