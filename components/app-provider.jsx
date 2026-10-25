'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isChainConfigured } from '../lib/chain-config.mjs';
import { connectStellarWallet, disconnectStellarWallet, restoreStellarWallet, setCavosWallet } from '../lib/wallet-client.mjs';
import { useCavosWallet } from './cavos-wallet-provider.jsx';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [walletAddress, setWalletAddress] = useState('');
  const [walletProvider, setWalletProvider] = useState('');
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletReady, setWalletReady] = useState(false);
  const [toast, setToast] = useState(null);
  const cavosLoginPending = useRef(false);
  const cavosModalAfterNavigation = useRef(false);
  const browserConnectLock = useRef(false);
  const cavos = useCavosWallet();

  const showToast = useCallback((message, type = 'success') => {
    setToast({ id: Date.now(), message, type });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (pathname !== '/' || !cavosModalAfterNavigation.current || !cavos?.openModal) return;
    cavosModalAfterNavigation.current = false;
    cavos.openModal();
  }, [pathname, cavos?.openModal]);

  useEffect(() => {
    if (!cavos?.address || !cavos?.isAuthenticated || typeof window === 'undefined') return;
    let returnPath = '';
    try {
      returnPath = window.sessionStorage.getItem('cuotia.cavos.return-path') || '';
      if (returnPath) window.sessionStorage.removeItem('cuotia.cavos.return-path');
    } catch { /* The user can still continue from the callback page. */ }
    if (returnPath.startsWith('/') && returnPath !== pathname) router.replace(returnPath);
  }, [cavos?.address, cavos?.isAuthenticated, pathname, router]);

  useEffect(() => {
    let active = true;
    let selectedProvider = '';
    try {
      selectedProvider = window.localStorage.getItem('cuotia.wallet-provider') || '';
      if (!selectedProvider && window.localStorage.getItem('cuotia.wallet-module')) selectedProvider = 'stellar';
    } catch { /* Wallet choice can still be made for this session. */ }
    if (selectedProvider === 'cavos') {
      if (cavos?.enabled) setWalletProvider('cavos');
      else setWalletReady(true);
      return () => { active = false; };
    }
    if (selectedProvider === 'stellar') setWalletProvider('stellar');
    restoreStellarWallet()
      .then((connection) => { if (active && connection?.address) setWalletAddress(connection.address); })
      .catch(() => {})
      .finally(() => { if (active) setWalletReady(true); });
    return () => { active = false; };
  }, [cavos?.enabled]);

  useEffect(() => {
    // Cavos can finish its auth callback just before/after this app's pending
    // flag is set (for example after returning from email/OAuth). Treat the
    // SDK's authenticated session as the source of truth when no other wallet
    // provider has been selected, and keep syncing while Cavos is selected.
    const shouldAdoptCavos = cavos?.address && (
      cavosLoginPending.current ||
      walletProvider === 'cavos' ||
      (!walletProvider && cavos?.isAuthenticated)
    );
    if (shouldAdoptCavos) {
      cavosLoginPending.current = false;
      setWalletProvider('cavos');
      setWalletAddress(cavos.address);
      try { window.localStorage.setItem('cuotia.wallet-provider', 'cavos'); } catch { /* Keep the active session in memory. */ }
    }
    if (walletProvider === 'cavos') {
      const stellarWallet = cavos?.wallet?.chain === 'stellar' ? cavos.wallet : null;
      setCavosWallet(stellarWallet);
      setWalletAddress(cavos?.address || '');
      if (!cavos?.isLoading) setWalletReady(true);
    } else {
      setCavosWallet(null);
    }
  }, [cavos?.address, cavos?.wallet, cavos?.isAuthenticated, cavos?.isLoading, walletProvider]);

  useEffect(() => {
    if (!cavos?.authError) return;
    const expiredLogin = /registry (?:lookup|register) failed:\s*401\b/i.test(cavos.authError);
    showToast(expiredLogin ? 'Your sign-in expired. Connect again to continue.' : cavos.authError, 'error');

    // Social-recovery credentials are single-use. If an attestation or recovery
    // request fails, clear Cavos' in-memory credential so another attempt cannot
    // replay the same provider token and become stuck on HTTP 409.
    if (expiredLogin || /auth_credential_replayed|kit\/nitro:|kit\/social-recovery:|kit\/stellar: this wallet is protected by recovery/i.test(cavos.authError)) {
      cavosLoginPending.current = false;
      cavos.logout();
      try { window.localStorage.removeItem('cuotia.wallet-provider'); } catch { /* Ignore unavailable storage. */ }
      setCavosWallet(null);
      setWalletProvider('');
      setWalletAddress('');
      setWalletReady(true);
    }
  }, [cavos?.authError, cavos?.logout, showToast]);

  const connectWallet = useCallback(async () => {
    if (browserConnectLock.current) return;
    browserConnectLock.current = true;
    setWalletBusy(true);
    try {
      const connection = await connectStellarWallet();
      setWalletProvider('stellar');
      setWalletAddress(connection.address);
      try { window.localStorage.setItem('cuotia.wallet-provider', 'stellar'); } catch { /* Keep the active session in memory. */ }
      return connection;
    } catch (cause) {
      const message = cause?.message || '';
      const wasDismissed = /user closed the modal|closed the modal|modal.*closed|user cancelled|user canceled|request rejected/i.test(message);
      if (!wasDismissed) showToast('Could not connect your wallet. Check that it is on Stellar Testnet and try again.', 'error');
      throw cause;
    } finally {
      browserConnectLock.current = false;
      setWalletBusy(false);
    }
  }, [showToast]);

  const connectCavosWallet = useCallback(async () => {
    if (!cavos?.enabled) throw new Error('Cavos is not configured for this app yet.');
    setWalletBusy(true);
    try {
      if (cavos.address) {
        setWalletProvider('cavos');
        setWalletAddress(cavos.address);
        try { window.localStorage.setItem('cuotia.wallet-provider', 'cavos'); } catch { /* Keep the active session in memory. */ }
        return;
      }
      // A failed prior recovery can leave a one-time provider credential in
      // memory. Reset that incomplete attempt before requesting a fresh login.
      cavos.logout();
      cavosLoginPending.current = true;
      if (pathname !== '/') {
        try { window.sessionStorage.setItem('cuotia.cavos.return-path', pathname); } catch { /* Continue login at the canonical callback URL. */ }
        cavosModalAfterNavigation.current = true;
        router.replace('/');
        return;
      }
      cavos.openModal();
    } catch (cause) {
      cavosLoginPending.current = false;
      if (cause?.message) showToast(cause.message, 'error');
      throw cause;
    } finally {
      setWalletBusy(false);
    }
  }, [cavos, pathname, router, showToast]);

  const disconnectWallet = useCallback(async () => {
    if (walletProvider === 'cavos') cavos?.logout();
    else {
      try { await disconnectStellarWallet(); } catch { /* The wallet may not respond to the disconnect request. */ }
    }
    setCavosWallet(null);
    try { window.localStorage.removeItem('cuotia.wallet-provider'); } catch { /* Ignore unavailable storage. */ }
    setWalletProvider('');
    setWalletAddress('');
  }, [walletProvider, cavos]);

  const value = useMemo(() => ({
    walletAddress,
    walletProvider,
    cavosEnabled: Boolean(cavos?.enabled),
    walletBusy,
    walletReady,
    toast,
    showToast,
    dismissToast,
    connectWallet,
    connectCavosWallet,
    disconnectWallet,
    chainConfigured: isChainConfigured(),
  }), [walletAddress, walletProvider, walletBusy, walletReady, toast, showToast, dismissToast, connectWallet, connectCavosWallet, disconnectWallet, cavos?.enabled]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useCuotia() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useCuotia must be used inside AppProvider.');
  return context;
}
