// Promo code management — wraps Stripe Coupons + Promotion Codes.
// List + create live here; deactivate lives in [id].js

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

function stripeClient(env) {
  return new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export async function onRequestGet({ request, env }) {
  if (!(await requireAuth(request, env))) return new Response('Unauthorized', { status: 401 });
  try {
    const stripe = stripeClient(env);
    const codes = await stripe.promotionCodes.list({ limit: 50, expand: ['data.coupon'] });

    const out = codes.data.map(pc => ({
      id: pc.id,
      code: pc.code,
      active: pc.active,
      times_redeemed: pc.times_redeemed,
      max_redemptions: pc.max_redemptions,
      expires_at: pc.expires_at,
      created: pc.created,
      coupon: pc.coupon ? {
        percent_off: pc.coupon.percent_off,
        amount_off: pc.coupon.amount_off,
        currency: pc.coupon.currency,
        duration: pc.coupon.duration,
      } : null,
      restrictions: pc.restrictions ? {
        minimum_amount: pc.restrictions.minimum_amount,
        first_time_transaction: pc.restrictions.first_time_transaction,
      } : null,
    }));

    // Newest first
    out.sort((a, b) => b.created - a.created);
    return Response.json(out);
  } catch (err) {
    console.error('Promo list failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function onRequestPost({ request, env }) {
  if (!(await requireAuth(request, env))) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await request.json();
    const {
      code,
      discount_type,           // 'percent' or 'amount'
      discount_value,          // % (1–100) or dollars
      max_redemptions,         // optional integer
      expires_at,              // optional unix seconds
      minimum_amount_dollars,  // optional minimum cart total in dollars
      first_time_only,         // optional bool
    } = body;

    const codeNorm = String(code || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(codeNorm)) {
      return Response.json({ error: 'Code must be 3–30 letters, numbers, dashes, or underscores' }, { status: 400 });
    }
    if (!['percent', 'amount'].includes(discount_type)) {
      return Response.json({ error: 'Invalid discount type' }, { status: 400 });
    }
    const value = parseFloat(discount_value);
    if (!Number.isFinite(value) || value <= 0) {
      return Response.json({ error: 'Discount value must be greater than 0' }, { status: 400 });
    }
    if (discount_type === 'percent' && value > 100) {
      return Response.json({ error: 'Percent off cannot exceed 100' }, { status: 400 });
    }

    const stripe = stripeClient(env);

    // Step 1: create the underlying coupon
    const couponParams = { duration: 'once', name: codeNorm };
    if (discount_type === 'percent') {
      couponParams.percent_off = value;
    } else {
      couponParams.amount_off = Math.round(value * 100);
      couponParams.currency = 'usd';
    }
    const coupon = await stripe.coupons.create(couponParams);

    // Step 2: create the customer-facing promotion code
    const pcParams = { coupon: coupon.id, code: codeNorm, active: true };
    if (max_redemptions) pcParams.max_redemptions = parseInt(max_redemptions, 10);
    if (expires_at) pcParams.expires_at = parseInt(expires_at, 10);

    const restrictions = {};
    if (minimum_amount_dollars) {
      restrictions.minimum_amount = Math.round(parseFloat(minimum_amount_dollars) * 100);
      restrictions.minimum_amount_currency = 'usd';
    }
    if (first_time_only) restrictions.first_time_transaction = true;
    if (Object.keys(restrictions).length) pcParams.restrictions = restrictions;

    const pc = await stripe.promotionCodes.create(pcParams);
    return Response.json({ ok: true, id: pc.id });
  } catch (err) {
    console.error('Promo create failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
