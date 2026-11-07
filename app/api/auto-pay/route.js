import { timingSafeEqual } from 'node:crypto';
import { runAutoPayKeeper } from '../../../lib/auto-pay-keeper.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(request) {
  const expected = process.env.AUTO_PAY_CRON_KEY || '';
  const received = request.headers.get('x-cron-key') || '';
  if (!expected || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

// Called on a schedule by cron-job.org with the header `x-cron-key: <AUTO_PAY_CRON_KEY>`.
async function handle(request) {
  if (!process.env.AUTO_PAY_CRON_KEY || !process.env.CUOTIA_KEEPER_SECRET) {
    return Response.json({ ok: false, error: 'Automatic contributions are not configured on this server.' }, { status: 503 });
  }
  if (!authorized(request)) return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  try {
    const summary = await runAutoPayKeeper({ secret: process.env.CUOTIA_KEEPER_SECRET });
    return Response.json({ ok: true, ...summary });
  } catch (cause) {
    return Response.json({ ok: false, error: String(cause?.message || cause).slice(0, 300) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
