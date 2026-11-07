// Contribution receipts. Horizon keeps the full transaction history (the Soroban RPC used for
// the activity list only keeps a few hours), so a receipt link keeps working over time.
import { getChainConfiguration } from './chain-config.mjs';
import { localizedError } from './i18n.mjs';

const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const ASSET_LABELS = {
  GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5: 'Circle USDC',
  GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56: 'Blend USDC',
};

export function isTransactionHash(value) {
  return /^[0-9a-f]{64}$/i.test(String(value || ''));
}

// Finds, inside a Horizon operation list, the contribution of circle `id` made in that
// transaction. Only accepts a successful `contribute` or `collect` call on the configured
// Cuotia contract with a transfer from the member to the contract. Pure; unit-tested.
export function findContribution(operations, { id, contractId, decode }) {
  for (const operation of operations || []) {
    if (operation.type !== 'invoke_host_function' || operation.transaction_successful === false) continue;
    if (!Array.isArray(operation.parameters) || operation.parameters.length < 4) continue;
    let contract; let method; let circleId; let member;
    try { [contract, method, circleId, member] = operation.parameters.slice(0, 4).map(decode).map(String); }
    catch { continue; }
    if (contract !== contractId || !['contribute', 'collect'].includes(method) || Number(circleId) !== Number(id)) continue;
    const transfer = (operation.asset_balance_changes || []).find((change) => change.type === 'transfer' && change.from === member && change.to === contractId);
    if (!transfer) continue;
    return {
      circleId: Number(circleId),
      member,
      amount: Number(transfer.amount),
      asset: ASSET_LABELS[transfer.asset_issuer] || transfer.asset_code || 'USDC',
      automatic: method === 'collect',
      createdAt: operation.created_at,
    };
  }
  return null;
}

export async function readContributionReceipt({ id, hash }) {
  if (!isTransactionHash(hash)) throw localizedError('receipt.invalid');
  const { contractId } = getChainConfiguration();
  if (!contractId) throw localizedError('err.notConfigured');
  const response = await fetch(`${HORIZON_URL}/transactions/${hash.toLowerCase()}/operations?limit=20`);
  if (response.status === 404) throw localizedError('receipt.notFound');
  if (!response.ok) throw localizedError('receipt.loadFailed');
  const operations = (await response.json())?._embedded?.records || [];
  const { xdr, scValToNative } = await import('@stellar/stellar-sdk');
  const decode = (parameter) => scValToNative(xdr.ScVal.fromXDR(parameter.value, 'base64'));
  const contribution = findContribution(operations, { id, contractId, decode });
  if (!contribution) throw localizedError('receipt.notContribution');
  return { hash: hash.toLowerCase(), ...contribution };
}
