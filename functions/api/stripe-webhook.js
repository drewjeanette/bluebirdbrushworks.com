import Stripe from 'stripe';

export async function onRequestPost({ request, env }) {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  const sig = request.headers.get('stripe-signature');
  const body = await request.text();

  let stripeEvent;
  try {
    stripeEvent = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });

    const itemsList = lineItems.data
      .map(li => `${li.description} ×${li.quantity} — $${(li.amount_total / 100).toFixed(2)}`)
      .join('\n');

    const ship = session.collected_information?.shipping_details || session.shipping_details || {};
    const addr = ship.address || {};
    const customerName = ship.name || session.customer_details?.name || '';
    const customerEmail = session.customer_details?.email || '';
    const shippingAddress = [
      customerName,
      addr.line1,
      addr.line2,
      [addr.city, addr.state, addr.postal_code].filter(Boolean).join(', '),
      addr.country,
    ].filter(Boolean).join('\n');

    // Record the order in D1 for stats (Phase 4 dashboard reads this)
    if (env.DB) {
      try {
        const orderResult = await env.DB.prepare(
          `INSERT OR IGNORE INTO orders
           (stripe_session_id, amount_cents, customer_email, customer_name, shipping_address)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(
          session.id,
          session.amount_total,
          customerEmail,
          customerName,
          shippingAddress,
        ).run();

        const orderId = orderResult.meta.last_row_id;
        if (orderId) {
          // Map line item descriptions back to product ids by name
          const { results: dbProducts } = await env.DB.prepare(
            'SELECT id, name FROM products'
          ).all();
          const nameToId = new Map(dbProducts.map(p => [p.name, p.id]));

          for (const li of lineItems.data) {
            await env.DB.prepare(
              `INSERT INTO order_items (order_id, product_id, product_name, qty, unit_price_cents)
               VALUES (?, ?, ?, ?, ?)`
            ).bind(
              orderId,
              nameToId.get(li.description) || null,
              li.description,
              li.quantity,
              Math.round(li.amount_total / li.quantity),
            ).run();
          }
        }
      } catch (err) {
        console.error('Failed to record order in D1:', err);
      }
    }

    // Send the order confirmation email to the shop owner via Formspree
    if (env.FORMSPREE_ORDER_FORM_ID) {
      try {
        const formspreeRes = await fetch(`https://formspree.io/f/${env.FORMSPREE_ORDER_FORM_ID}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Origin': 'https://bluebirdbrushworks.com',
            'Referer': 'https://bluebirdbrushworks.com/',
          },
          body: JSON.stringify({
            _subject: `New Paid Order — $${(session.amount_total / 100).toFixed(2)}`,
            customer_email: customerEmail,
            customer_name: customerName,
            shipping_address: shippingAddress,
            items: itemsList,
            amount_paid: `$${(session.amount_total / 100).toFixed(2)}`,
            stripe_session_id: session.id,
          }),
        });
        const responseText = await formspreeRes.text();
        console.log('Formspree response:', formspreeRes.status, responseText);
        if (!formspreeRes.ok) {
          console.error('Formspree rejected submission:', formspreeRes.status, responseText);
        }
      } catch (err) {
        console.error('Failed to send order email:', err);
      }
    } else {
      console.error('FORMSPREE_ORDER_FORM_ID env var is not set');
    }
  }

  return Response.json({ received: true });
}
