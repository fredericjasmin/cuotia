import { writzClient } from '../../../../lib/writz-client.mjs';
import { errorResponse } from '../../../../lib/api-response.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(await writzClient.getApy(), {
      headers: { 'x-cuotia-fetched-at': new Date().toISOString(), 'cache-control': 'no-store' },
    });
  }
  catch (error) { return errorResponse(error); }
}
