// Single-product operations: update and delete.

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

export async function onRequestPut({ request, env, params }) {
  if (!(await requireAuth(request, env))) return new Response('Unauthorized', { status: 401 });
  const id = parseInt(params.id, 10);
  if (!id) return Response.json({ error: 'Invalid id' }, { status: 400 });
  try {
    const body = await request.json();
    const { name, description, price_cents, tag, image_key, image_key_2, image_key_3, sold_out, sort_order } = body;
    if (!name || typeof price_cents !== 'number' || price_cents < 0) {
      return Response.json({ error: 'Name and a valid price are required' }, { status: 400 });
    }

    // Clean up any R2 images that were removed or replaced
    const prev = await env.DB.prepare(
      'SELECT image_key, image_key_2, image_key_3 FROM products WHERE id = ?'
    ).bind(id).first();
    const nextKeys = new Set([image_key, image_key_2, image_key_3].filter(Boolean));
    const removedKeys = [prev?.image_key, prev?.image_key_2, prev?.image_key_3]
      .filter(Boolean)
      .filter(k => !nextKeys.has(k));
    for (const key of removedKeys) {
      try { await env.IMAGES.delete(key); } catch (e) { console.warn('R2 delete failed:', e); }
    }

    await env.DB.prepare(
      `UPDATE products
       SET name = ?, description = ?, price_cents = ?, tag = ?, image_key = ?, image_key_2 = ?, image_key_3 = ?, sold_out = ?, sort_order = ?
       WHERE id = ?`
    ).bind(
      name.trim(),
      (description || '').trim(),
      Math.round(price_cents),
      tag ? tag.trim() : null,
      image_key || null,
      image_key_2 || null,
      image_key_3 || null,
      sold_out ? 1 : 0,
      Number.isFinite(sort_order) ? sort_order : 999,
      id,
    ).run();
    return Response.json({ ok: true });
  } catch (err) {
    console.error('Product update failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function onRequestDelete({ request, env, params }) {
  if (!(await requireAuth(request, env))) return new Response('Unauthorized', { status: 401 });
  const id = parseInt(params.id, 10);
  if (!id) return Response.json({ error: 'Invalid id' }, { status: 400 });
  try {
    // Fetch the image keys so we can clean up R2
    const row = await env.DB.prepare(
      'SELECT image_key, image_key_2, image_key_3 FROM products WHERE id = ?'
    ).bind(id).first();
    await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
    const keys = [row?.image_key, row?.image_key_2, row?.image_key_3].filter(Boolean);
    for (const key of keys) {
      try { await env.IMAGES.delete(key); } catch (e) { console.warn('R2 delete failed:', e); }
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error('Product delete failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
