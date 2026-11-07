'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, hasMessage, intlLocale, normalizeLocale, translate } from '../lib/i18n.mjs';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  // The server always renders the default locale; the stored choice is applied
  // after mount so the first client render matches the server HTML.
  const [locale, setLocaleState] = useState(DEFAULT_LOCALE);

  useEffect(() => {
    let stored = '';
    try { stored = window.localStorage.getItem(LOCALE_STORAGE_KEY) || ''; } catch { /* Storage can be unavailable. */ }
    if (stored) setLocaleState(normalizeLocale(stored));
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next) => {
    const value = normalizeLocale(next);
    setLocaleState(value);
    try { window.localStorage.setItem(LOCALE_STORAGE_KEY, value); } catch { /* Keep the choice for this session only. */ }
  }, []);

  const value = useMemo(() => {
    const intl = intlLocale(locale);
    const t = (key, vars) => translate(locale, key, vars);
    return {
      locale,
      setLocale,
      intlLocale: intl,
      t,
      // Translates an Error thrown by lib code (via its i18nKey) or falls back
      // to its raw message, then to a translated fallback key.
      tError: (cause, fallbackKey) => {
        if (cause?.i18nKey && hasMessage(cause.i18nKey)) return t(cause.i18nKey, cause.i18nVars);
        const message = typeof cause === 'string' ? cause : cause?.message;
        return message || (fallbackKey ? t(fallbackKey) : '');
      },
      formatNumber: (number, options) => Number(number || 0).toLocaleString(intl, options),
      formatDate: (date, options) => new Intl.DateTimeFormat(intl, options).format(date),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider.');
  return context;
}
