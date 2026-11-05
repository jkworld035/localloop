import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../translations/en.json';
import te from '../translations/te.json';

export type AppLanguage = 'en' | 'te';
export const LANGUAGES: AppLanguage[] = ['en', 'te'];

/**
 * Initialised synchronously with English; app/_layout.tsx switches to the
 * stored or device language before the splash screen hides, so users never
 * see a flash of the wrong language.
 */
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, te: { translation: te } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
});

export default i18n;
