// Admin content endpoint: GET all, PUT bulk-save.

async function requireAuth(request, env) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)bb_admin=([^;]+)/);
  const token = match ? match[1] : null;
  if (!token) return false;
  const row = await env.DB.prepare(
    'SELECT expires_at FROM admin_sessions WHERE token = ?'
  ).bind(token).first();
  return row && row.expires_at >= Math.floor(Date.now() / 1000);
}

export async function onRequestGet({ request, env }) {
  if (!(await requireAuth(request, env))) return new Response('Unauthorized', { status: 401 });
  const { results } = await env.DB.prepare('SELECT key, value FROM content_blocks').all();
  const out = {};
  for (const row of results) out[row.key] = row.value;
  return Response.json(out);
}

export async function onRequestPut({ request, env }) {
  if (!(await requireAuth(request, env))) return new Response('Unauthorized', { status: 401 });
  try {
    const updates = await request.json();
    if (!updates || typeof updates !== 'object') {
      return Response.json({ error: 'Invalid body' }, { status: 400 });
    }
    const now = Math.floor(Date.now() / 1000);
    const stmts = Object.entries(updates).map(([key, value]) =>
      env.DB.prepare(
        `INSERT INTO content_blocks (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).bind(String(key), String(value ?? ''), now)
    );
    await env.DB.batch(stmts);
    return Response.json({ ok: true, count: stmts.length });
  } catch (err) {
    console.error('Content save failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
