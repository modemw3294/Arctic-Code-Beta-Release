import { useState, useEffect } from 'react';
import { t, setLocale, getLocale, initI18n, saveLocale } from '../lib/i18n';

export function useI18n() {
  const [locale, setLocaleState] = useState(getLocale());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Initialize i18n on first mount
    initI18n();

    // Listen for locale changes
    const handleLocaleChange = (e) => {
      setLocaleState(e.detail.locale);
      setTick((t) => t + 1);
    };

    window.addEventListener('arctic-locale-changed', handleLocaleChange);
    return () => {
      window.removeEventListener('arctic-locale-changed', handleLocaleChange);
    };
  }, []);

  const changeLocale = (newLocale) => {
    setLocale(newLocale);
    saveLocale(newLocale);
    setLocaleState(newLocale);
    setTick((t) => t + 1);
  };

  return {
    t,
    locale,
    changeLocale,
    tick, // Force re-render when locale changes
  };
}
