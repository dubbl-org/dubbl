export const locales = ["en", "fr", "fr-CA"] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = "en";
export const localeLabels: Record<AppLocale, string> = { en: "English", fr: "Français", "fr-CA": "Français (Canada)" };

export function resolveLocale(value?: string | null): AppLocale {
  if (locales.includes(value as AppLocale)) return value as AppLocale;
  return value?.toLowerCase().startsWith("fr") ? "fr" : defaultLocale;
}
