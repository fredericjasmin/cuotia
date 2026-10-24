const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const DEFAULT_RPC_URL = 'https://soroban-testnet.stellar.org';

export function getChainConfiguration() {
  return {
    contractId: process.env.NEXT_PUBLIC_CUOTIA_CONTRACT_ID || '',
    tokenId: process.env.NEXT_PUBLIC_CUOTIA_TOKEN_ID || '',
    rpcUrl: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || DEFAULT_RPC_URL,
    networkPassphrase: TESTNET_PASSPHRASE,
  };
}

export function isChainConfigured() {
  const { contractId, tokenId } = getChainConfiguration();
  return Boolean(contractId && tokenId);
}
