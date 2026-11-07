// Server-side job that runs automatic contributions. A scheduled request (cron-job.org)
// calls /api/auto-pay, which runs this once. It never holds member funds: it only submits
// `collect` (the contract pulls one contribution through the member's own allowance) and
// `advance_round`, both permissionless contract functions. The keeper account only pays fees.
import { getChainConfiguration } from './chain-config.mjs';
import { toSavingsCircleView } from './cuotia-chain.mjs';

const PAGE_SIZE = 30;

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

async function send(client, method, args) {
  const transaction = await client[method](args);
  unwrap(transaction.result);
  const sent = await transaction.signAndSend();
  unwrap(sent.result);
  return sent.sendTransactionResponse?.hash || sent.hash || null;
}

// Decides what the keeper should do for one circle at `nowSeconds`. Pure, so it is unit-tested.
export function planCircle(circle, nowSeconds) {
  if (circle.status !== 'active' || !circle.earnReady) return { advance: false, collect: [] };
  const allPaid = circle.contributions.every((entry) => entry.paid);
  const advance = allPaid && circle.round + 1 < circle.roundsTotal && nowSeconds >= circle.roundDueAt;
  const windowOpen = nowSeconds <= circle.roundDueAt + circle.gracePeriodSeconds;
  const collect = windowOpen && !allPaid
    ? circle.members.filter((_, index) => circle.autoPay?.[index] && !circle.contributions[index]?.paid).map((member) => member.address)
    : [];
  return { advance, collect };
}

export async function runAutoPayKeeper({ secret }) {
  const { contractId, rpcUrl, networkPassphrase } = getChainConfiguration();
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

  const summary = { keeper: keypair.publicKey(), circlesChecked: 0, advanced: [], collected: [], failed: [] };
  let startId = 1;
  while (startId) {
    const page = unwrap((await client.list_circles({ start_id: startId, limit: PAGE_SIZE })).result);
    for (const raw of page) {
      let circle = toSavingsCircleView(raw);
      summary.circlesChecked += 1;
      const nowSeconds = Math.floor(Date.now() / 1000);

      if (planCircle(circle, nowSeconds).advance) {
        try {
          const hash = await send(client, 'advance_round', { id: circle.id });
          summary.advanced.push({ circle: circle.id, hash });
          circle = toSavingsCircleView(unwrap((await client.get_circle({ id: circle.id })).result));
        } catch (cause) {
          summary.failed.push({ circle: circle.id, action: 'advance_round', error: shortError(cause) });
        }
      }

      for (const member of planCircle(circle, nowSeconds).collect) {
        try {
          const hash = await send(client, 'collect', { id: circle.id, member });
          summary.collected.push({ circle: circle.id, member, hash });
        } catch (cause) {
          // Usually not enough balance or no trustline; it is retried on the next run.
          summary.failed.push({ circle: circle.id, member, action: 'collect', error: shortError(cause) });
        }
      }
    }
    startId = page.length === PAGE_SIZE ? Number(page.at(-1).id) + 1 : null;
  }
  return summary;
}
