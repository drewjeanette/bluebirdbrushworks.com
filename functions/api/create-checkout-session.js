import Stripe from 'stripe';

const PRODUCTS = {
  1: { name: 'Eastern Bluebird',     price: 650 },
  2: { name: 'Wren in Morning Fog',  price: 650 },
  3: { name: 'Chickadee on Holly',   price: 650 },
  4: { name: 'Blue & Sage Wreath',   price: 750 },
  5: { name: 'Finch & Wildflowers',  price: 650 },
  6: { name: 'Songbird Gift Set',    price: 3400 },
};

export async function onRequestPost({ request, env }) {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  try {
    const { items } = await request.json();
    if (!Array.isArray(items) || !items.length) {
      return Response.json({ error: 'No items in cart' }, { status: 400 });
    }

    const line_items = items.map(({ id, qty }) => {
      const product = PRODUCTS[id];
      if (!product) throw new Error(`Unknown product: ${id}`);
      const quantity = Math.max(1, Math.min(99, parseInt(qty, 10) || 1));
      return {
        price_data: {
          currency: 'usd',
          product_data: { name: product.name },
          unit_amount: product.price,
        },
        quantity,
      };
    });

    const url = new URL(request.url);
    const origin = `${url.protocol}//${url.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      shipping_address_collection: { allowed_countries: ['US', 'CA'] },
      success_url: `${origin}/?paid=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?canceled=true`,
    });

    return Response.json({ url: session.url });
  } catch (err) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
