'use client';

import { createContext, useContext } from 'react';
import { CavosAuth } from '@cavos/kit';
import { CavosProvider, useCavos } from '@cavos/kit/react';

const CavosWalletContext = createContext(null);

// @cavos/kit 0.4.4 documents this as a one-time consume, but its implementation
// returns the credential without clearing it. The same provider token can then
// be submitted to /recovery/social/sessions again and Cavos rejects it as replayed.
const consumePatch = Symbol.for('cuotia.cavos.consume-social-credential-patch');
if (!CavosAuth.prototype[consumePatch]) {
  const sdkConsume = CavosAuth.prototype.consumeSocialRecoveryCredential;
  CavosAuth.prototype.consumeSocialRecoveryCredential = function consumeSocialRecoveryCredentialOnce() {
    const credential = sdkConsume.call(this);
    this.recoveryCredential = null;
    return credential;
  };
  Object.defineProperty(CavosAuth.prototype, consumePatch, { value: true });
}

const appId = process.env.NEXT_PUBLIC_CAVOS_APP_ID || '';
const config = appId ? {
  chain: 'stellar',
  network: 'testnet',
  appSalt: 'cuotia-stellar-v1',
  appId,
  environment: process.env.NEXT_PUBLIC_CAVOS_ENVIRONMENT === 'production' ? 'production' : 'development',
  // Keep the identity and auth token scoped to the same browser tab session.
  // This prevents a stale localStorage identity from triggering a registry lookup
  // after its session token has expired or disappeared.
  persistSession: false,
  socialRecovery: true,
} : null;
const modal = {
  appName: 'Cuotia',
  appLogo: '/brand-nav.png',
  providers: ['email', 'google', 'apple'],
  theme: 'light',
  secureStep: 'optional',
};

function CavosWalletBridge({ children }) {
  const session = useCavos();
  return <CavosWalletContext.Provider value={{ ...session, enabled: true }}>{children}</CavosWalletContext.Provider>;
}

export function CavosWalletProvider({ children }) {
  if (!config) return <CavosWalletContext.Provider value={null}>{children}</CavosWalletContext.Provider>;

  return <CavosProvider config={config} modal={modal}><CavosWalletBridge>{children}</CavosWalletBridge></CavosProvider>;
}

export function useCavosWallet() {
  return useContext(CavosWalletContext);
}
