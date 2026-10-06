/**
 * Working languages a group can pick (ADR-0004 + regional groups): what the
 * group writes in and the language of its drafted minutes. English groups show
 * no badge; others show the language's own name.
 */
export const MINUTES_LANGUAGES: { code: string; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "fr", label: "French", native: "Français" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "it", label: "Italian", native: "Italiano" },
  { code: "nl", label: "Dutch", native: "Nederlands" },
];

export function languageLabel(code: string): string {
  return MINUTES_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

/** The language as its speakers call it, for badges. */
export function languageNative(code: string): string {
  return MINUTES_LANGUAGES.find((l) => l.code === code)?.native ?? code;
}
