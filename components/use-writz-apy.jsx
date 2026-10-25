'use client';

import { useCallback, useEffect, useState } from 'react';

function formatApy(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 'Unavailable';
  return `${(value * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
}

export function useWritzApy() {
  const [apy, setApy] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');

  const refreshApy = useCallback(async () => {
    try {
      const response = await fetch('/api/earn/apy', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error('APY unavailable');
      setApy(formatApy(data.apy));
      setUpdatedAt(response.headers.get('x-cuotia-fetched-at') || new Date().toISOString());
    } catch {
      setApy('Unavailable');
      setUpdatedAt('');
    }
  }, []);

  useEffect(() => {
    refreshApy();
    const timer = window.setInterval(refreshApy, 60_000);
    return () => window.clearInterval(timer);
  }, [refreshApy]);

  return { apy, updatedAt };
}
