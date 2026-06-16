/**
 * Languages supported across the platform (UI + notifications).
 * Single source of truth reused by DTO validation and the notification i18n layer.
 * Values are ISO 639-1 codes.
 */
export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr'] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'en';

/** Narrow an arbitrary value to a supported Language, falling back to the default. */
export function resolveLanguage(value: unknown): Language {
  return SUPPORTED_LANGUAGES.includes(value as Language)
    ? (value as Language)
    : DEFAULT_LANGUAGE;
}
