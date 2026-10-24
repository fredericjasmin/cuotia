import { isChainConfigured } from '../../../lib/chain-config.mjs';

export const runtime = 'nodejs';

export async function GET() {
  return Response.json({
    app: 'cuotia',
    status: 'ok',
    network: 'testnet',
    storage: isChainConfigured() ? 'soroban' : 'unconfigured',
  });
}
