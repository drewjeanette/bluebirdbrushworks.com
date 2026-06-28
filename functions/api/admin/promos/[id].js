// Deactivate a promotion code. Stripe doesn't delete codes — you set active=false
// so future customers can't use it. Redemption history is preserved.

import Stripe from 'stripe';

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

export async function onRequestPatch({ request, env, params }) {
  if (!(await requireAuth(request, env))) return new Response('Unauthorized', { status: 401 });
  try {
    const { active } = await request.json();
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
    });
    await stripe.promotionCodes.update(params.id, { active: !!active });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('Promo update failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
