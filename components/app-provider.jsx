'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isChainConfigured } from '../lib/chain-config.mjs';
import { connectStellarWallet, disconnectStellarWallet, restoreStellarWallet } from '../lib/wallet-client.mjs';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [walletAddress, setWalletAddress] = useState('');
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletReady, setWalletReady] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ id: Date.now(), message, type });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    let active = true;
    restoreStellarWallet()
      .then((connection) => { if (active && connection?.address) setWalletAddress(connection.address); })
      .catch(() => {})
      .finally(() => { if (active) setWalletReady(true); });
    return () => { active = false; };
  }, []);

  const connectWallet = useCallback(async () => {
    setWalletBusy(true);
    try {
      const connection = await connectStellarWallet();
      setWalletAddress(connection.address);
      return connection;
    } catch (cause) {
      const message = cause?.message || '';
      const wasDismissed = /user closed the modal|closed the modal|modal.*closed|user cancelled|user canceled|request rejected/i.test(message);
      if (!wasDismissed) showToast('Could not connect your wallet. Check that it is on Stellar Testnet and try again.', 'error');
      throw cause;
    } finally {
      setWalletBusy(false);
    }
  }, [showToast]);

  const disconnectWallet = useCallback(async () => {
    try { await disconnectStellarWallet(); } catch { /* The wallet may not respond to the disconnect request. */ }
    setWalletAddress('');
  }, []);

  const value = useMemo(() => ({
    walletAddress,
    walletBusy,
    walletReady,
    toast,
    showToast,
    dismissToast,
    connectWallet,
    disconnectWallet,
    chainConfigured: isChainConfigured(),
  }), [walletAddress, walletBusy, walletReady, toast, showToast, dismissToast, connectWallet, disconnectWallet]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useCuotia() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useCuotia must be used inside AppProvider.');
  return context;
}
