const baseUrl = process.env.WRITZ_RELAYER_URL || 'https://api.testnet.writz.xyz';

async function getJson(path) {
  let response;
  try {
    response = await fetch(new URL(path, baseUrl), {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw Object.assign(new Error('Could not connect to the Writz service.'), { status: 502 });
  }

  let body;
  try { body = await response.json(); }
  catch { body = {}; }
  if (!response.ok) {
    const message = typeof body?.error === 'string' ? body.error : `Writz returned status ${response.status}.`;
    throw Object.assign(new Error(message), { status: response.status >= 400 && response.status < 500 ? response.status : 502 });
  }
  return body;
}

export const writzClient = {
  getApy: () => getJson('/defindex/apy'),
};
