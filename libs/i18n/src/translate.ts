import { DEFAULT_LANGUAGE, resolveLanguage } from '@app/models';
import { CATALOGS, en, TranslationKey } from './translations';

/**
 * Translate a key into the given language, interpolating `{param}` placeholders.
 *
 * - Unknown/unsupported languages fall back to the default (English).
 * - A key missing from the target catalog falls back to English, then to the
 *   raw key — it never throws and never renders an empty string.
 */
export function translate(
  key: TranslationKey,
  language?: string | null,
  params?: Record<string, string | number>,
): string {
  const lang = resolveLanguage(language);
  const catalog = CATALOGS[lang] ?? CATALOGS[DEFAULT_LANGUAGE];
  let text = catalog[key] ?? en[key] ?? key;

  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }

  return text;
}
