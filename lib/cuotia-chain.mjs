import { getChainConfiguration, isChainConfigured } from './chain-config.mjs';

export { getChainConfiguration, isChainConfigured };

const STROOPS_PER_USDC = 10_000_000n;
const CIRCLES_PER_PAGE = 30;
const TESTNET_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
export const BLEND_USDC_TOKEN_ID = 'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU';
const TESTNET_BLEND_USDC_ISSUER = 'GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56';
export const WRITZ_VAULT_ID = 'CBMHGL7GGGHODEDDJ5H2LKJEFHJWBRSQUKOXMC4FKOFDZK5HBKW6PI2S';
const WRITZ_RATE_REFERENCE_SHARES = 10_000_000n;
let writzVaultPromise;

function loadWritzVaultClient() {
  const { rpcUrl, networkPassphrase } = getChainConfiguration();
  if (!writzVaultPromise) {
    writzVaultPromise = import('@stellar/stellar-sdk')
      .then(({ contract }) => contract.Client.from({ contractId: WRITZ_VAULT_ID, rpcUrl, networkPassphrase }))
      .catch((cause) => { writzVaultPromise = undefined; throw cause; });
  }
  return writzVaultPromise;
}

// Reads how much Blend USDC (stroops) the Writz vault currently pays for the
// reference share bundle. Returns null when the vault cannot price shares yet.
export async function readWritzAssetsPerReferenceShare() {
  try {
    const vault = await loadWritzVaultClient();
    const call = await vault.get_asset_amounts_per_shares({ vault_shares: WRITZ_RATE_REFERENCE_SHARES });
    const value = call?.result !== undefined ? call.result : call;
    const unwrapped = value && typeof value.unwrap === 'function' ? value.unwrap() : value;
    const amount = Array.isArray(unwrapped) ? unwrapped[0] : unwrapped;
    if (typeof amount !== 'bigint' || amount <= 0n) return null;
    return amount;
  } catch { return null; }
}

// Converts a member's vault shares into their current Blend USDC value (stroops).
export function writzSharesToUsdc(shares, assetsPerReference) {
  if (!assetsPerReference) return null;
  const amount = BigInt(shares || 0);
  if (amount <= 0n) return 0n;
  return amount * assetsPerReference / WRITZ_RATE_REFERENCE_SHARES;
}

function unwrapContractResult(result, errorMessage) {
  if (result && typeof result.isErr === 'function' && result.isErr()) {
    throw new Error(errorMessage);
  }
  return result && typeof result.unwrap === 'function' ? result.unwrap() : result;
}

export function toStroops(amount) {
  const value = String(amount).trim();
  if (!/^\d+(\.\d{1,7})?$/.test(value)) throw new Error('The contribution can have up to 7 decimal places.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * STROOPS_PER_USDC + BigInt(fraction.padEnd(7, '0'));
}

function nativeAddress(value) {
  return typeof value === 'string' ? value : value?.toString?.() || '';
}

async function loadClient(address) {
  const { contractId, tokenId, rpcUrl, networkPassphrase } = getChainConfiguration();
  if (!contractId || !tokenId) throw new Error('The Cuotia savings contract is not deployed and configured yet.');
  const { contract } = await import('@stellar/stellar-sdk');
  const options = { contractId, rpcUrl, networkPassphrase };
  if (address) {
    const { getCavosWallet, getWalletKit, ensureCavosWalletDeployed } = await import('./wallet-client.mjs');
    const cavosWallet = getCavosWallet(address);
    if (cavosWallet) {
      await ensureCavosWalletDeployed(cavosWallet);
      options.publicKey = address;
      options.signTransaction = async (xdr) => ({
        signedTxXdr: await cavosWallet.signXdr(xdr),
        signerAddress: address,
      });
      return contract.Client.from(options);
    }
    const { kit } = await getWalletKit();
    options.publicKey = address;
    options.signTransaction = (xdr, opts) => kit.signTransaction(xdr, {
      ...opts,
      address,
      networkPassphrase,
    });
    options.signAuthEntry = (xdr, opts) => kit.signAuthEntry(xdr, {
      ...opts,
      address,
      networkPassphrase,
    });
  }
  return contract.Client.from(options);
}

export async function getSavingsCircleActivity(id, limit = 20) {
  const { contractId, rpcUrl } = getChainConfiguration();
  if (!contractId) throw new Error('The Cuotia savings contract is not configured yet.');
  const { rpc, scValToNative } = await import('@stellar/stellar-sdk');
  const server = new rpc.Server(rpcUrl);
  const [health, latest] = await Promise.all([server.getHealth(), server.getLatestLedger()]);
  const startLedger = Math.max(health.oldestLedger, latest.sequence - 30_000);
  // The RPC allows at most 5 event filters per request and this circle has 6
  // event names, so fetch every contract event in a single filter and match
  // the circle id client-side below.
  const filters = [{ type: 'contract', contractIds: [contractId] }];
  const events = [];
  let page = await server.getEvents({ startLedger, filters, limit: 1_000 });
  events.push(...page.events);
  while (page.events.length === 1_000 && page.cursor) {
    page = await server.getEvents({ cursor: page.cursor, filters, limit: 1_000 });
    events.push(...page.events);
  }
  const labels = { created: 'Savings circle created', contrib: 'Contribution made', advanced: 'Round opened', cancelled: 'Circle cancelled', claimed: 'Funds claimed', earn_accepted: 'Writz Earn approved' };
  const activity = events.flatMap((event) => {
    if (event.type !== 'contract' || String(event.contractId) !== contractId || !Array.isArray(event.topic) || event.topic.length < 2) return [];
    const [eventName, circleId] = event.topic.slice(0, 2).map(scValToNative);
    if (Number(circleId) !== Number(id) || !labels[eventName]) return [];
    return [{ hash: event.txHash, label: labels[eventName], ledger: event.ledger, timestamp: event.ledgerClosedAt }];
  });
  return activity.sort((a, b) => b.ledger - a.ledger).slice(0, Math.max(1, Math.min(Number(limit) || 20, 50)));
}

function errorText(cause) {
  const parts = [];
  let current = cause;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (typeof current === 'string') parts.push(current);
    else if (current instanceof Error) parts.push(current.message);
    else if (current.message) parts.push(String(current.message));
    current = current.cause;
  }
  return parts.join(' ');
}

function missingTrustlineError(address) {
  const error = new Error(`The Stellar account ${address} has not added the configured USDC Testnet asset. No transfer was sent.`);
  error.code = 'USDC_TRUSTLINE_REQUIRED';
  error.address = address;
  return error;
}

function getHorizonSubmissionMessage(cause) {
  const response = cause?.getResponse?.() || cause?.response || cause?.cause?.response;
  const data = response?.data;
  let sdkCodes;
  try { sdkCodes = cause?.getResultCodes?.(); } catch { /* Use the raw Horizon response below. */ }
  const codes = sdkCodes || data?.extras?.result_codes || cause?.extras?.result_codes;
  const operationCodes = Array.isArray(codes?.operations) ? codes.operations.join(', ') : '';
  const transactionCode = codes?.transaction || '';
  if (/op_low_reserve|op_underfunded/.test(operationCodes)) {
    return 'This wallet needs more Testnet XLM to add the USDC trustline. Fund the same account with XLM, then try again.';
  }
  if (/tx_insufficient_balance/.test(transactionCode)) return 'This wallet needs more Testnet XLM to add the USDC trustline. Fund the same account with XLM, then try again.';
  if (/tx_bad_seq/.test(transactionCode)) return 'The wallet sequence changed before the USDC setup was submitted. Retry the setup once.';
  if (/tx_too_late|tx_too_early/.test(transactionCode)) return 'The USDC setup approval expired before it reached Stellar. Start setup again and approve it promptly.';
  if (/tx_insufficient_fee/.test(transactionCode)) return 'The transaction fee was too low. Please retry the USDC setup.';
  if (operationCodes || transactionCode) return `Stellar rejected the USDC setup (${[transactionCode, operationCodes].filter(Boolean).join(' / ')}).`;
  const detail = data?.detail || data?.title || data?.extras?.result_codes?.transaction;
  if (detail) return `Stellar rejected the USDC setup: ${detail}`;
  return cause?.message || 'Stellar rejected the USDC setup. Check that Freighter is on Testnet and try again.';
}

export async function setupUsdcTrustline({ address, earnEnabled = false }) {
  const { tokenId, rpcUrl, networkPassphrase } = getChainConfiguration();
  const { getCavosWallet, getWalletKit, ensureCavosWalletDeployed } = await import('./wallet-client.mjs');
  const stellar = await import('@stellar/stellar-sdk');
  const expectedTokenId = earnEnabled ? BLEND_USDC_TOKEN_ID : tokenId;
  const issuer = earnEnabled ? TESTNET_BLEND_USDC_ISSUER : TESTNET_USDC_ISSUER;
  const asset = new stellar.Asset('USDC', issuer);
  if (asset.contractId(networkPassphrase) !== expectedTokenId) {
    throw new Error(earnEnabled
      ? 'The configured Writz Earn vault asset does not match Blend Testnet USDC. Cuotia cannot prepare its trustline automatically.'
      : 'The configured token is not the Circle USDC asset for Stellar Testnet. Cuotia cannot prepare its trustline automatically.');
  }

  const cavosWallet = getCavosWallet(address);
  if (cavosWallet) await ensureCavosWalletDeployed(cavosWallet);
  const horizon = new stellar.Horizon.Server('https://horizon-testnet.stellar.org');
  const account = await horizon.loadAccount(address);
  const hasTrustline = account.balances.some((balance) => balance.asset_code === asset.code && balance.asset_issuer === asset.issuer);
  if (hasTrustline) return { alreadyConfigured: true };

  if (cavosWallet) {
    const hash = await cavosWallet.addTrustline({ code: asset.code, issuer: asset.issuer }, { fee: 'sponsored' });
    return { alreadyConfigured: false, hash };
  }

  const { kit } = await getWalletKit();

  const transaction = new stellar.TransactionBuilder(account, {
    fee: stellar.BASE_FEE,
    networkPassphrase,
  })
    .addOperation(stellar.Operation.changeTrust({ asset }))
    // Use Stellar ledger time instead of the computer clock. TransactionBuilder.setTimeout()
    // derives maxTime from local UTC, which can immediately expire if the device clock is skewed.
    .setTimebounds(0, Number((await new stellar.rpc.Server(rpcUrl).getLatestLedger()).closeTime) + 300)
    .build();
  const { signedTxXdr, signerAddress } = await kit.signTransaction(transaction.toXDR(), { address, networkPassphrase });
  if (signerAddress && signerAddress !== address) throw new Error('Freighter signed with a different account. Switch to the circle member’s wallet and try again.');
  const signedTransaction = stellar.TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase);
  let result;
  try { result = await horizon.submitTransaction(signedTransaction); }
  catch (cause) { throw new Error(getHorizonSubmissionMessage(cause)); }
  return { alreadyConfigured: false, hash: result.hash };
}

export async function readUsdcBalance(address, tokenId, rpcUrl, networkPassphrase) {
  try {
    const { contract } = await import('@stellar/stellar-sdk');
    const tokenClient = await contract.Client.from({ contractId: tokenId, rpcUrl, networkPassphrase });
    const balanceTransaction = await tokenClient.balance({ id: address });
    const balanceResult = balanceTransaction.result;
    if (balanceResult && typeof balanceResult.unwrap === 'function' && typeof balanceResult.isErr === 'function' && balanceResult.isErr()) {
      balanceResult.unwrap();
    }
    const balance = balanceResult && typeof balanceResult.unwrap === 'function' ? balanceResult.unwrap() : balanceResult;
    return BigInt(String(balance));
  } catch (cause) {
    if (/trustline entry is missing|trustline.*missing/i.test(errorText(cause))) {
      throw missingTrustlineError(address);
    }
    if (cause instanceof Error && /No transfer was sent\./i.test(cause.message)) throw cause;
    throw new Error(`Could not verify the USDC Testnet balance for ${address}. No transfer was sent. Please try again. (${errorText(cause) || 'Stellar RPC error'})`);
  }
}

function normalizeCircleStatus(status) {
  const knownStatuses = new Set(['active', 'complete', 'cancelled']);
  const normalize = (value) => String(value).trim().toLowerCase().replace(/[^a-z]/g, '');
  if (typeof status === 'string') {
    const normalized = normalize(status);
    return knownStatuses.has(normalized) ? normalized : 'unknown';
  }
  if (status && typeof status === 'object') {
    const taggedVariant = normalize(status.tag);
    if (knownStatuses.has(taggedVariant)) return taggedVariant;
    for (const variant of Object.keys(status)) {
      const normalized = normalize(variant);
      if (knownStatuses.has(normalized)) return normalized;
    }
  }
  return 'unknown';
}

export function toSavingsCircleView(circle) {
  const members = circle.members.map((member) => ({
    address: nativeAddress(member.address),
    name: member.name,
  }));
  const contributions = [...circle.contributed];
  const paidTotals = [...circle.paid_totals].map((value) => Number(value) / Number(STROOPS_PER_USDC));
  const claimed = [...circle.claimed];
  const status = normalizeCircleStatus(circle.status);
  const contribution = Number(circle.contribution) / Number(STROOPS_PER_USDC);
  return {
    id: Number(circle.id),
    owner: nativeAddress(circle.owner),
    token: nativeAddress(circle.token),
    tokenCompatible: Boolean(getChainConfiguration().tokenId) && nativeAddress(circle.token) === getChainConfiguration().tokenId,
    name: circle.name,
    frequency: circle.frequency,
    members,
    contribution,
    round: Number(circle.round),
    roundsTotal: Number(circle.rounds_total),
    roundDueAt: Number(circle.round_due_at),
    createdAt: Number(circle.created_at),
    status,
    complete: status === 'complete',
    cancelled: status === 'cancelled',
    gracePeriodSeconds: 3 * 24 * 60 * 60,
    contributions: contributions.map((paid, index) => ({ paid, total: paidTotals[index] || 0, claimed: claimed[index] || false })),
    earnEnabled: Boolean(circle.earn_enabled),
    earnAccepted: [...(circle.earn_accepted || [])],
    earnReady: !circle.earn_enabled || [...(circle.earn_accepted || [])].every(Boolean),
    earnShares: [...(circle.earn_shares || [])].map((amount) => String(amount)),
    pot: paidTotals.reduce((sum, amount) => sum + amount, 0),
  };
}

export async function listSavingsCircles(startId = 1) {
  const client = await loadClient(null);
  const transaction = await client.list_circles({ start_id: startId, limit: CIRCLES_PER_PAGE });
  const result = unwrapContractResult(transaction.result, 'Stellar could not return the savings circle list.');
  if (!Array.isArray(result)) throw new Error('Stellar returned the savings circle list in an unexpected format.');
  const circles = result.map(toSavingsCircleView);
  const lastCircle = circles.at(-1);
  return { circles, nextStartId: circles.length === CIRCLES_PER_PAGE && lastCircle ? lastCircle.id + 1 : null };
}

export async function getSavingsCircle(id) {
  const client = await loadClient(null);
  const transaction = await client.get_circle({ id: Number(id) });
  const result = unwrapContractResult(transaction.result, 'Stellar could not find that savings circle.');
  if (!result || typeof result !== 'object') throw new Error('Stellar returned the savings circle in an unexpected format.');
  return toSavingsCircleView(result);
}

export async function createSavingsCircle({ address, name, frequency, amount, rounds, members, earnEnabled = false }) {
  const { contractId, tokenId } = getChainConfiguration();
  const circleTokenId = earnEnabled ? BLEND_USDC_TOKEN_ID : tokenId;
  const client = await loadClient(address);
  const transaction = await client.create_circle({
    owner: address,
    token_address: circleTokenId,
    name,
    frequency,
    members: [
      { address, name: members.ownerName },
      ...members.others.map(({ address: memberAddress, name: memberName }) => ({ address: memberAddress, name: memberName })),
    ],
    contribution: toStroops(amount),
    rounds_total: Number(rounds),
    earn_enabled: earnEnabled,
  });
  const sent = await transaction.signAndSend();
  const result = unwrapContractResult(sent.result, 'Stellar rejected savings circle creation. Check the details and try again.');
  const id = Number(result);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('The transaction was confirmed, but Stellar did not return a valid circle ID.');
  return { id, contractId, hash: sent.hash };
}

async function savingsAction({ address, id, method, errorMessage }) {
  const { tokenId, rpcUrl, networkPassphrase } = getChainConfiguration();
  try {
    const client = await loadClient(address);
    let circle;
    if (method === 'contribute' || method === 'claim') {
      const circleTransaction = await client.get_circle({ id: Number(id) });
      circle = unwrapContractResult(circleTransaction.result, 'Could not verify this circle before the action. No transaction was sent.');
    }
    if (method === 'contribute') {
      const circleTokenId = nativeAddress(circle.token);
      const balance = await readUsdcBalance(address, circleTokenId, rpcUrl, networkPassphrase);
      if (balance < BigInt(circle.contribution)) {
        const isBlendUsdc = circleTokenId === BLEND_USDC_TOKEN_ID;
        const currentBalance = Number(balance) / Number(STROOPS_PER_USDC);
        const requiredAmount = Number(circle.contribution) / Number(STROOPS_PER_USDC);
        throw new Error(`This wallet holds ${currentBalance} of this circle's Testnet USDC, but each contribution is ${requiredAmount} USDC. ${isBlendUsdc ? 'This circle uses Blend Testnet USDC (get it at testnet.blend.capital).' : 'This circle uses Circle Testnet USDC (get it at faucet.circle.com).'} Fund the same wallet with at least ${requiredAmount} USDC, then try again. No contribution was sent.`);
      }
    }
    const transaction = method === 'contribute'
      ? await client.contribute({ id: Number(id), member: address })
      : method === 'claim'
        ? await client.claim({ id: Number(id), member: address })
        : method === 'advance_round'
          ? await client.advance_round({ id: Number(id) })
          : method === 'accept_earn'
            ? await client.accept_earn({ id: Number(id), member: address })
            : method === 'cancel_unstarted'
              ? await client.cancel_unstarted({ id: Number(id), member: address })
              : await client.cancel_circle({ id: Number(id) });
    const sent = await transaction.signAndSend();
    unwrapContractResult(sent.result, errorMessage);
    return sent.hash;
  } catch (cause) {
    if (/account not found:\s*G[A-Z2-7]{55}/i.test(errorText(cause))) {
      throw new Error('This wallet has not been activated on Stellar Testnet yet. For a browser wallet, fund it with Testnet XLM to create the account. A Cavos wallet should create it on its first sponsored action; check that sponsorship is enabled, then reconnect and retry. Writz consent itself needs no USDC, and no approval was sent.');
    }
    throw cause;
  }
}

export const contributeToSavingsCircle = ({ address, id }) => savingsAction({ address, id, method: 'contribute', errorMessage: 'The contract rejected the contribution. Check your balance, membership, and current round status.' });
export const advanceSavingsCircleRound = ({ address, id }) => savingsAction({ address, id, method: 'advance_round', errorMessage: 'The round cannot advance yet. Confirm every member contributed and that its period elapsed.' });
export const cancelSavingsCircle = ({ address, id }) => savingsAction({ address, id, method: 'cancel_circle', errorMessage: 'The circle cannot be cancelled until a round is incomplete past its grace period.' });
export const claimSavingsCircle = ({ address, id }) => savingsAction({ address, id, method: 'claim', errorMessage: 'The contract rejected the claim. It may already be claimed or the circle may still be active.' });
export const acceptSavingsCircleEarn = ({ address, id }) => savingsAction({ address, id, method: 'accept_earn', errorMessage: 'The contract rejected your Writz Earn acceptance.' });
export const cancelUnstartedSavingsCircle = ({ address, id }) => savingsAction({ address, id, method: 'cancel_unstarted', errorMessage: 'This circle can no longer be cancelled before contributions.' });
