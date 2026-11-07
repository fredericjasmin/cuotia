import { getChainConfiguration, isChainConfigured } from './chain-config.mjs';
import { localizedError } from './i18n.mjs';

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

function unwrapContractResult(result, errorKey) {
  if (result && typeof result.isErr === 'function' && result.isErr()) {
    throw localizedError(errorKey);
  }
  return result && typeof result.unwrap === 'function' ? result.unwrap() : result;
}

export function toStroops(amount) {
  const value = String(amount).trim();
  if (!/^\d+(\.\d{1,7})?$/.test(value)) throw localizedError('err.decimals');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * STROOPS_PER_USDC + BigInt(fraction.padEnd(7, '0'));
}

function nativeAddress(value) {
  return typeof value === 'string' ? value : value?.toString?.() || '';
}

async function loadClient(address) {
  const { contractId, tokenId, rpcUrl, networkPassphrase } = getChainConfiguration();
  if (!contractId || !tokenId) throw localizedError('err.notDeployed');
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
    options.signTransaction = async (xdr, opts) => {
      const signed = await kit.signTransaction(xdr, {
        ...opts,
        address,
        networkPassphrase,
      });
      if (signed?.signerAddress && signed.signerAddress !== address) {
        throw localizedError('err.wrongSigner');
      }
      return signed;
    };
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
  if (!contractId) throw localizedError('err.notConfigured');
  const { rpc, scValToNative } = await import('@stellar/stellar-sdk');
  const server = new rpc.Server(rpcUrl);
  const { sequence: latestLedger } = await server.getLatestLedger();
  // Soroban RPC silently returns an empty result when the event query spans
  // more than 10,000 ledgers, so stay just under that cap (~15.6 hours of
  // history at ~5.9 s per ledger).
  const startLedger = Math.max(1, latestLedger - 9_500);
  // The RPC allows at most 5 event filters per request and this circle has 8
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
  const labels = { created: 'Savings circle created', contrib: 'Contribution made', advanced: 'Round opened', cancelled: 'Circle cancelled', claimed: 'Funds claimed', earn_accepted: 'Writz Earn approved', auto_pay: 'Automatic contribution setting changed', auto_paid: 'Automatic contribution collected' };
  const activity = events.flatMap((event) => {
    if (event.type !== 'contract' || String(event.contractId) !== contractId || !Array.isArray(event.topic) || event.topic.length < 2) return [];
    const [eventName, circleId] = event.topic.slice(0, 2).map(scValToNative);
    if (Number(circleId) !== Number(id) || !labels[eventName]) return [];
    return [{ hash: event.txHash, event: eventName, label: labels[eventName], labelKey: `activity.${eventName}`, ledger: event.ledger, timestamp: event.ledgerClosedAt }];
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
  return localizedError('err.trustlineMissing', { address }, { code: 'USDC_TRUSTLINE_REQUIRED', address });
}

function getHorizonSubmissionError(cause) {
  const response = cause?.getResponse?.() || cause?.response || cause?.cause?.response;
  const data = response?.data;
  let sdkCodes;
  try { sdkCodes = cause?.getResultCodes?.(); } catch { /* Use the raw Horizon response below. */ }
  const codes = sdkCodes || data?.extras?.result_codes || cause?.extras?.result_codes;
  const operationCodes = Array.isArray(codes?.operations) ? codes.operations.join(', ') : '';
  const transactionCode = codes?.transaction || '';
  if (/op_low_reserve|op_underfunded/.test(operationCodes)) {
    return localizedError('err.lowXlm');
  }
  if (/tx_insufficient_balance/.test(transactionCode)) return localizedError('err.lowXlm');
  if (/tx_bad_seq/.test(transactionCode)) return localizedError('err.badSeq');
  if (/tx_too_late|tx_too_early/.test(transactionCode)) return localizedError('err.setupExpired');
  if (/tx_insufficient_fee/.test(transactionCode)) return localizedError('err.lowFee');
  if (operationCodes || transactionCode) return localizedError('err.setupRejectedCodes', { codes: [transactionCode, operationCodes].filter(Boolean).join(' / ') });
  const detail = data?.detail || data?.title || data?.extras?.result_codes?.transaction;
  if (detail) return localizedError('err.setupRejectedDetail', { detail: String(detail) });
  return cause?.message ? new Error(cause.message) : localizedError('err.setupRejected');
}

export async function setupUsdcTrustline({ address, earnEnabled = false }) {
  const { tokenId, rpcUrl, networkPassphrase } = getChainConfiguration();
  const { getCavosWallet, getWalletKit, ensureCavosWalletDeployed } = await import('./wallet-client.mjs');
  const stellar = await import('@stellar/stellar-sdk');
  const expectedTokenId = earnEnabled ? BLEND_USDC_TOKEN_ID : tokenId;
  const issuer = earnEnabled ? TESTNET_BLEND_USDC_ISSUER : TESTNET_USDC_ISSUER;
  const asset = new stellar.Asset('USDC', issuer);
  if (asset.contractId(networkPassphrase) !== expectedTokenId) {
    throw localizedError(earnEnabled ? 'err.earnAssetMismatch' : 'err.tokenMismatch');
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
  if (signerAddress && signerAddress !== address) throw localizedError('err.wrongSignerMember');
  const signedTransaction = stellar.TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase);
  let result;
  try { result = await horizon.submitTransaction(signedTransaction); }
  catch (cause) { throw getHorizonSubmissionError(cause); }
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
    throw localizedError('err.balanceCheck', { address, detail: errorText(cause) || 'Stellar RPC error' });
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
    autoPay: circle.members.map((_, index) => Boolean(circle.auto_pay?.[index])),
    pot: paidTotals.reduce((sum, amount) => sum + amount, 0),
  };
}

export async function listSavingsCircles(startId = 1) {
  const client = await loadClient(null);
  const transaction = await client.list_circles({ start_id: startId, limit: CIRCLES_PER_PAGE });
  const result = unwrapContractResult(transaction.result, 'err.listFailed');
  if (!Array.isArray(result)) throw localizedError('err.listFormat');
  const circles = result.map(toSavingsCircleView);
  const lastCircle = circles.at(-1);
  return { circles, nextStartId: circles.length === CIRCLES_PER_PAGE && lastCircle ? lastCircle.id + 1 : null };
}

export async function getSavingsCircle(id) {
  const client = await loadClient(null);
  const transaction = await client.get_circle({ id: Number(id) });
  const result = unwrapContractResult(transaction.result, 'err.circleNotFound');
  if (!result || typeof result !== 'object') throw localizedError('err.circleFormat');
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
  const result = unwrapContractResult(sent.result, 'err.createRejected');
  const id = Number(result);
  if (!Number.isSafeInteger(id) || id < 1) throw localizedError('err.badCircleId');
  return { id, contractId, hash: sent.hash };
}

async function savingsAction({ address, id, method, errorKey, enabled = false }) {
  const { tokenId, rpcUrl, networkPassphrase } = getChainConfiguration();
  try {
    const client = await loadClient(address);
    let circle;
    const enablingAutoPay = method === 'set_auto_pay' && enabled;
    if (method === 'contribute' || method === 'claim' || enablingAutoPay) {
      const circleTransaction = await client.get_circle({ id: Number(id) });
      circle = unwrapContractResult(circleTransaction.result, 'err.verifyCircle');
    }
    if (method === 'claim' || enablingAutoPay) {
      // Receiving a claim and being collected automatically both need the circle's USDC
      // trustline. readUsdcBalance throws USDC_TRUSTLINE_REQUIRED so the UI offers to add it.
      await readUsdcBalance(address, nativeAddress(circle.token), rpcUrl, networkPassphrase);
    }
    if (method === 'contribute') {
      const circleTokenId = nativeAddress(circle.token);
      const balance = await readUsdcBalance(address, circleTokenId, rpcUrl, networkPassphrase);
      if (balance < BigInt(circle.contribution)) {
        const isBlendUsdc = circleTokenId === BLEND_USDC_TOKEN_ID;
        const currentBalance = Number(balance) / Number(STROOPS_PER_USDC);
        const requiredAmount = Number(circle.contribution) / Number(STROOPS_PER_USDC);
        throw localizedError(isBlendUsdc ? 'err.insufficientBlend' : 'err.insufficientCircle', { balance: currentBalance, required: requiredAmount });
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
              : method === 'set_auto_pay'
                ? await client.set_auto_pay({ id: Number(id), member: address, enabled })
                : await client.cancel_circle({ id: Number(id) });
    const sent = await transaction.signAndSend();
    unwrapContractResult(sent.result, errorKey);
    return sent.hash;
  } catch (cause) {
    if (/account not found:\s*G[A-Z2-7]{55}/i.test(errorText(cause))) {
      throw localizedError('err.notActivated');
    }
    throw cause;
  }
}

export const contributeToSavingsCircle = ({ address, id }) => savingsAction({ address, id, method: 'contribute', errorKey: 'err.contribRejected' });
export const advanceSavingsCircleRound = ({ address, id }) => savingsAction({ address, id, method: 'advance_round', errorKey: 'err.advanceRejected' });
export const cancelSavingsCircle = ({ address, id }) => savingsAction({ address, id, method: 'cancel_circle', errorKey: 'err.cancelRejected' });
export const claimSavingsCircle = ({ address, id }) => savingsAction({ address, id, method: 'claim', errorKey: 'err.claimRejected' });
export const acceptSavingsCircleEarn = ({ address, id }) => savingsAction({ address, id, method: 'accept_earn', errorKey: 'err.earnRejected' });
export const setSavingsCircleAutoPay = ({ address, id, enabled }) => savingsAction({ address, id, method: 'set_auto_pay', enabled: Boolean(enabled), errorKey: 'err.autoPayRejected' });
export const cancelUnstartedSavingsCircle = ({ address, id }) => savingsAction({ address, id, method: 'cancel_unstarted', errorKey: 'err.cancelUnstartedRejected' });

// Stellar Testnet closes a ledger roughly every 5–6 seconds; used only to estimate a date.
const AVERAGE_LEDGER_SECONDS = 5.5;

// Automatic-payment allowance of a member for a token: how much Cuotia may still collect and
// approximately until when. `expired` means collections fail until the member renews it.
export async function readAutoPayGrant({ address, token }) {
  const { rpcUrl } = getChainConfiguration();
  const client = await loadClient(null);
  const { rpc } = await import('@stellar/stellar-sdk');
  const [transaction, latest] = await Promise.all([
    client.auto_pay_grant({ member: address, token_address: token }),
    new rpc.Server(rpcUrl).getLatestLedger(),
  ]);
  const grant = unwrapContractResult(transaction.result, 'err.autoPayStatus');
  const expiresLedger = Number(grant?.expires_ledger || 0);
  const latestLedger = Number(latest.sequence);
  const committed = Number(grant?.committed || 0) / Number(STROOPS_PER_USDC);
  const secondsLeft = Math.max(0, expiresLedger - latestLedger) * AVERAGE_LEDGER_SECONDS;
  return {
    committed,
    expiresLedger,
    latestLedger,
    expired: committed > 0 && expiresLedger <= latestLedger,
    expiresAt: expiresLedger ? Date.now() + secondsLeft * 1000 : null,
  };
}
