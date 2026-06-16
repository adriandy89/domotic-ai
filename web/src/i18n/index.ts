import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';

export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: AppLanguage = 'en';

// Human-readable names shown in the language selector (each in its own language).
export const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
};

const STORAGE_KEY = 'app-language';

export function isAppLanguage(value: unknown): value is AppLanguage {
  return SUPPORTED_LANGUAGES.includes(value as AppLanguage);
}

function getStoredLanguage(): AppLanguage {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isAppLanguage(stored) ? stored : DEFAULT_LANGUAGE;
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    fr: { translation: fr },
  },
  // Initial language comes from the last persisted choice (so the pre-auth
  // login screen is already localized); the server value overrides it after login.
  lng: getStoredLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  interpolation: { escapeValue: false },
});

/**
 * Apply and persist a language. Unsupported/empty values fall back to the
 * default. Returns the language that was actually applied.
 */
export function setAppLanguage(
  language: string | null | undefined,
): AppLanguage {
  const lang = isAppLanguage(language) ? language : DEFAULT_LANGUAGE;
  localStorage.setItem(STORAGE_KEY, lang);
  if (i18n.language !== lang) {
    void i18n.changeLanguage(lang);
  }
  return lang;
}

export default i18n;
