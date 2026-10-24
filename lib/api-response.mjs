export async function readJson(request) {
  try { return await request.json(); }
  catch { throw Object.assign(new Error('The request body must be valid JSON.'), { status: 400 }); }
}

export function parseId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw Object.assign(new Error('The circle ID is invalid.'), { status: 400 });
  return id;
}

export function errorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const message = status === 500 ? 'An internal error occurred.' : error.message;
  if (status === 500) console.error(error);
  return Response.json({ error: message }, { status });
}
