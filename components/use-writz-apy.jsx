'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from './i18n-provider.jsx';

export function useWritzApy() {
  const { t, formatNumber } = useI18n();
  // undefined while loading, null when unavailable, otherwise the APY ratio.
  const [value, setValue] = useState(undefined);
  const [updatedAt, setUpdatedAt] = useState('');

  const refreshApy = useCallback(async () => {
    try {
      const response = await fetch('/api/earn/apy', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error('APY unavailable');
      const ratio = data.apy;
      setValue(typeof ratio === 'number' && Number.isFinite(ratio) && ratio >= 0 ? ratio : null);
      setUpdatedAt(response.headers.get('x-cuotia-fetched-at') || new Date().toISOString());
    } catch {
      setValue(null);
      setUpdatedAt('');
    }
  }, []);

  useEffect(() => {
    refreshApy();
    const timer = window.setInterval(refreshApy, 60_000);
    return () => window.clearInterval(timer);
  }, [refreshApy]);

  const apy = value === undefined ? '' : value === null ? t('common.unavailable') : `${formatNumber(value * 100, { maximumFractionDigits: 2 })}%`;
  return { apy, updatedAt };
}
