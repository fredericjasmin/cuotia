// Server-side job that runs automatic contributions. A scheduled request (cron-job.org)
// calls /api/auto-pay, which runs this once. It never holds member funds: it only submits
// `collect` (the contract pulls one contribution through the member's own allowance) and
// `advance_round`, both permissionless contract functions. The keeper account only pays fees.
import { getChainConfiguration } from './chain-config.mjs';
import { BLEND_USDC_TOKEN_ID, toSavingsCircleView } from './cuotia-chain.mjs';

const PAGE_SIZE = 30;
// Anyone can create circles, so bound the fees one run can spend and only act on circles
// that use the app's own assets (not an arbitrary token someone deployed).
const MAX_TRANSACTIONS_PER_RUN = 25;
// Simulations are free but take time; cap them separately so a run always finishes.
const MAX_SIMULATIONS_PER_RUN = 300;

function unwrap(result) {
  if (result && typeof result.isErr === 'function' && result.isErr()) {
    const error = result.unwrapErr?.();
    throw new Error(`Contract error ${error?.message || error?.code || JSON.stringify(error)}`);
  }
  return result && typeof result.unwrap === 'function' ? result.unwrap() : result;
}

function shortError(cause) {
  const text = String(cause?.message || cause || 'Unknown error');
  const contractError = text.match(/Error\(Contract, #\d+\)/);
  return contractError ? contractError[0] : text.slice(0, 200);
}

// Simulates first (free). Only a call that would succeed is signed and submitted, so failing
// collections (no balance, no trustline) never consume the per-run transaction budget.
async function simulate(client, method, args) {
  const transaction = await client[method](args);
  unwrap(transaction.result);
  return transaction;
}

async function submit(transaction) {
  const sent = await transaction.signAndSend();
  unwrap(sent.result);
  return sent.sendTransactionResponse?.hash || sent.hash || null;
}

// Starts the scan at a random circle so circles with a high id are not always last.
export function rotate(items, offset) {
  if (!items.length) return items;
  const start = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

// Decides what the keeper should do for one circle at `nowSeconds`. Pure, so it is unit-tested.
export function planCircle(circle, nowSeconds, allowedTokens = null) {
  if (circle.status !== 'active' || !circle.earnReady) return { advance: false, collect: [] };
  if (allowedTokens && !allowedTokens.has(circle.token)) return { advance: false, collect: [] };
  // Rounds only need to be opened by the keeper when someone relies on automatic payment.
  if (!circle.autoPay?.some(Boolean)) return { advance: false, collect: [] };
  const allPaid = circle.contributions.every((entry) => entry.paid);
  const advance = allPaid && circle.round + 1 < circle.roundsTotal && nowSeconds >= circle.roundDueAt;
  const windowOpen = nowSeconds <= circle.roundDueAt + circle.gracePeriodSeconds;
  const collect = windowOpen && !allPaid
    ? circle.members.filter((_, index) => circle.autoPay?.[index] && !circle.contributions[index]?.paid).map((member) => member.address)
    : [];
  return { advance, collect };
}

export async function runAutoPayKeeper({ secret }) {
  const { contractId, tokenId, rpcUrl, networkPassphrase } = getChainConfiguration();
  const allowedTokens = new Set([tokenId, BLEND_USDC_TOKEN_ID].filter(Boolean));
  if (!contractId) throw new Error('NEXT_PUBLIC_CUOTIA_CONTRACT_ID is not configured.');
  const { contract, Keypair } = await import('@stellar/stellar-sdk');
  const keypair = Keypair.fromSecret(secret);
  const client = await contract.Client.from({
    contractId,
    rpcUrl,
    networkPassphrase,
    publicKey: keypair.publicKey(),
    ...contract.basicNodeSigner(keypair, networkPassphrase),
  });

  const summary = { keeper: keypair.publicKey(), circlesChecked: 0, advanced: [], collected: [], failed: [], stoppedAtLimit: false };
  let submitted = 0;
  let simulations = 0;
  const canSimulate = () => simulations < MAX_SIMULATIONS_PER_RUN;

  async function attempt(method, args, record) {
    if (!canSimulate() || submitted >= MAX_TRANSACTIONS_PER_RUN) { summary.stoppedAtLimit = true; return false; }
    simulations += 1;
    let transaction;
    try { transaction = await simulate(client, method, args); }
    catch (cause) { summary.failed.push({ ...record, action: method, error: shortError(cause) }); return false; }
    submitted += 1;
    try {
      const hash = await submit(transaction);
      (method === 'collect' ? summary.collected : summary.advanced).push({ ...record, hash });
      return true;
    } catch (cause) {
      summary.failed.push({ ...record, action: method, error: shortError(cause) });
      return false;
    }
  }

  // Reading circles is free; read them all, then act starting from a random position.
  const circles = [];
  let startId = 1;
  while (startId) {
    const page = unwrap((await client.list_circles({ start_id: startId, limit: PAGE_SIZE })).result);
    circles.push(...page.map(toSavingsCircleView));
    startId = page.length === PAGE_SIZE ? Number(page.at(-1).id) + 1 : null;
  }
  summary.circlesChecked = circles.length;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const candidates = circles.filter((circle) => {
    const plan = planCircle(circle, nowSeconds, allowedTokens);
    return plan.advance || plan.collect.length;
  });

  for (let circle of rotate(candidates, Math.floor(Math.random() * candidates.length))) {
    if (summary.stoppedAtLimit) break;
    if (planCircle(circle, nowSeconds, allowedTokens).advance
      && await attempt('advance_round', { id: circle.id }, { circle: circle.id })) {
      try { circle = toSavingsCircleView(unwrap((await client.get_circle({ id: circle.id })).result)); }
      catch { continue; }
    }
    for (const member of planCircle(circle, nowSeconds, allowedTokens).collect) {
      await attempt('collect', { id: circle.id, member }, { circle: circle.id, member });
      if (summary.stoppedAtLimit) break;
    }
  }
  return summary;
}
