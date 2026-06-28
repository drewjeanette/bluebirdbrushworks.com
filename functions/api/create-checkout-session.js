import Stripe from 'stripe';

const SHIPPING_FLAT_CENTS = 500;          // $5.00 flat shipping
const FREE_SHIPPING_THRESHOLD = 5000;     // $50.00 — orders at/above this ship free

export async function onRequestPost({ request, env }) {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  try {
    const { items } = await request.json();
    if (!Array.isArray(items) || !items.length) {
      return Response.json({ error: 'No items in cart' }, { status: 400 });
    }

    // Fetch live prices from D1 so customers can't tamper with amounts
    const requestedIds = items.map(i => parseInt(i.id, 10)).filter(Boolean);
    const placeholders = requestedIds.map(() => '?').join(',');
    const { results: dbProducts } = await env.DB.prepare(
      `SELECT id, name, price_cents, sold_out FROM products WHERE id IN (${placeholders})`
    ).bind(...requestedIds).all();
    const productMap = new Map(dbProducts.map(p => [p.id, p]));

    let subtotal = 0;
    const line_items = items.map(({ id, qty }) => {
      const product = productMap.get(parseInt(id, 10));
      if (!product) throw new Error(`Product ${id} no longer available`);
      if (product.sold_out) throw new Error(`${product.name} is sold out`);
      const quantity = Math.max(1, Math.min(99, parseInt(qty, 10) || 1));
      subtotal += product.price_cents * quantity;
      return {
        price_data: {
          currency: 'usd',
          product_data: { name: product.name },
          unit_amount: product.price_cents,
        },
        quantity,
      };
    });

    const qualifiesForFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD;
    const shippingAmount = qualifiesForFreeShipping ? 0 : SHIPPING_FLAT_CENTS;
    const shippingLabel = qualifiesForFreeShipping
      ? 'Free shipping (orders $50+)'
      : 'Standard shipping (USPS First Class)';

    const url = new URL(request.url);
    const origin = `${url.protocol}//${url.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      shipping_address_collection: { allowed_countries: ['US', 'CA'] },
      shipping_options: [{
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: shippingAmount, currency: 'usd' },
          display_name: shippingLabel,
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 3 },
            maximum: { unit: 'business_day', value: 7 },
          },
        },
      }],
      allow_promotion_codes: true,
      success_url: `${origin}/?paid=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?canceled=true`,
    });

    return Response.json({ url: session.url });
  } catch (err) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
