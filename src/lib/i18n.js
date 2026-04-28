// Lightweight i18n system for Arctic Code
// Supports dynamic language switching and fallback to default language

import zhCN from '../locales/zh-CN.js';
import enUS from '../locales/en-US.js';

export const AVAILABLE_LOCALES = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'en-US', name: 'English' },
];

const DEFAULT_LOCALE = 'zh-CN';
let currentLocale = DEFAULT_LOCALE;
const translations = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

// No-op kept for backwards compatibility.
export function loadTranslations() {}

function resolve(keys, dict) {
  let v = dict;
  for (const k of keys) {
    if (v && typeof v === 'object' && k in v) {
      v = v[k];
    } else {
      return undefined;
    }
  }
  return v;
}

// Get translation for a key
export function t(key, params = {}) {
  const keys = key.split('.');
  let value = resolve(keys, translations[currentLocale]);
  if (value === undefined && currentLocale !== DEFAULT_LOCALE) {
    value = resolve(keys, translations[DEFAULT_LOCALE]);
  }
  if (typeof value !== 'string') {
    return key;
  }
  return value.replace(/\{(\w+)\}/g, (match, param) => {
    return params[param] !== undefined ? params[param] : match;
  });
}

// Set current locale
export function setLocale(locale) {
  if (!translations[locale]) {
    console.warn(`Unknown locale: ${locale}, falling back to ${DEFAULT_LOCALE}`);
    locale = DEFAULT_LOCALE;
  }
  currentLocale = locale;
  try {
    window.dispatchEvent(new CustomEvent('arctic-locale-changed', { detail: { locale } }));
  } catch {
    // Ignore in environments without window
  }
}

// Get current locale
export function getLocale() {
  return currentLocale;
}

// Initialize with saved locale
export function initI18n() {
  let savedLocale = DEFAULT_LOCALE;
  try {
    savedLocale = localStorage.getItem('arctic-locale') || DEFAULT_LOCALE;
  } catch { /* ignore */ }
  setLocale(savedLocale);
}

// Save locale preference
export function saveLocale(locale) {
  localStorage.setItem('arctic-locale', locale);
}
