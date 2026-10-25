const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
let kitPromise;
let activeCavosWallet = null;

export function setCavosWallet(wallet) {
  activeCavosWallet = wallet?.chain === 'stellar' ? wallet : null;
}

export function getCavosWallet(address) {
  return activeCavosWallet?.address === address ? activeCavosWallet : null;
}

export async function ensureCavosWalletDeployed(wallet) {
  if (!wallet?.isDeployed) {
    // The self-payment is 1 stroop and returns to the same address. It triggers
    // Cavos' lazy account creation; the relayer sponsors the reserve and fees.
    await wallet.execute(1n, wallet.address, { fee: 'sponsored' });
  }
}

export async function getWalletKit() {
  if (typeof window === 'undefined') throw new Error('A wallet can only be connected in the browser.');
  if (!kitPromise) {
    kitPromise = Promise.all([
      import('@creit.tech/stellar-wallets-kit/sdk'),
      import('@creit.tech/stellar-wallets-kit/modules/utils'),
      import('@stellar/stellar-sdk'),
    ]).then(async ([kitModule, walletModules, stellar]) => {
      const { StellarWalletsKit } = kitModule;
      const modules = walletModules.defaultModules();
      const walletConnectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
      if (walletConnectId) {
        const { WalletConnectModule, WalletConnectTargetChain } = await import('@creit.tech/stellar-wallets-kit/modules/wallet-connect');
        modules.push(new WalletConnectModule({
          projectId: walletConnectId,
          metadata: {
            name: 'Cuotia',
            description: 'Community savings circles on Stellar.',
            url: window.location.origin,
            icons: [],
          },
          allowedChains: [WalletConnectTargetChain.TESTNET],
        }));
      }
      StellarWalletsKit.init({
        modules,
        network: stellar.Networks.TESTNET,
      });
      return { kit: StellarWalletsKit, network: stellar.Networks };
    }).catch((error) => {
      kitPromise = undefined;
      throw error;
    });
  }
  const { kit, network } = await kitPromise;
  kit.setNetwork(network.TESTNET);
  return { kit, network };
}

async function checkedConnection(kit, network) {
  const [{ address }, selectedNetwork] = await Promise.all([kit.getAddress(), kit.getNetwork()]);
  if (selectedNetwork.networkPassphrase !== network.TESTNET) {
    throw new Error('Switch your wallet to Stellar Testnet to use this version of Cuotia.');
  }
  return { address, network: selectedNetwork.network };
}

export async function connectStellarWallet() {
  const { kit, network } = await getWalletKit();
  await kit.authModal();
  const connection = await checkedConnection(kit, network);
  try {
    const walletId = kit.selectedModule.productId;
    if (walletId) window.localStorage.setItem('cuotia.wallet-module', walletId);
  } catch { /* Wallet connection can still be used for this page session. */ }
  return connection;
}

export async function restoreStellarWallet() {
  let walletId;
  try { walletId = window.localStorage.getItem('cuotia.wallet-module'); } catch { return null; }
  if (!walletId) return null;
  const { kit, network } = await getWalletKit();
  try {
    kit.setWallet(walletId);
    const [{ address }, selectedNetwork] = await Promise.all([
      kit.selectedModule.getAddress(),
      kit.getNetwork(),
    ]);
    if (!address || selectedNetwork.networkPassphrase !== network.TESTNET) throw new Error('Wallet is not available on Testnet.');
    return { address, network: selectedNetwork.network };
  } catch {
    try { window.localStorage.removeItem('cuotia.wallet-module'); } catch { /* Ignore unavailable storage. */ }
    return null;
  }
}

export async function disconnectStellarWallet() {
  try {
    const { kit } = await getWalletKit();
    await kit.disconnect();
  } finally {
    try { window.localStorage.removeItem('cuotia.wallet-module'); } catch { /* Ignore unavailable storage. */ }
  }
}
