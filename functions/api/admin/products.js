// Admin product list + create. Auth is handled by /admin middleware, but admin
// API lives outside that path so we re-check the session cookie here.

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
  const { results } = await env.DB.prepare(
    `SELECT id, name, description, price_cents, tag, image_key, sold_out, sort_order
     FROM products
     ORDER BY sort_order ASC, id ASC`
  ).all();
  return Response.json(results);
}

export async function onRequestPost({ request, env }) {
  if (!(await requireAuth(request, env))) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await request.json();
    const { name, description, price_cents, tag, image_key, sold_out, sort_order } = body;
    if (!name || typeof price_cents !== 'number' || price_cents < 0) {
      return Response.json({ error: 'Name and a valid price are required' }, { status: 400 });
    }
    const result = await env.DB.prepare(
      `INSERT INTO products (name, description, price_cents, tag, image_key, sold_out, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      name.trim(),
      (description || '').trim(),
      Math.round(price_cents),
      tag ? tag.trim() : null,
      image_key || null,
      sold_out ? 1 : 0,
      Number.isFinite(sort_order) ? sort_order : 999,
    ).run();
    return Response.json({ ok: true, id: result.meta.last_row_id });
  } catch (err) {
    console.error('Product create failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
