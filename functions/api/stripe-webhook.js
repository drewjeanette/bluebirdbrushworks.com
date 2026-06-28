import Stripe from 'stripe';

export async function onRequestPost({ request, env }) {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  const sig = request.headers.get('stripe-signature');
  const body = await request.text();

  let stripeEvent;
  try {
    // Workers crypto is async — must use constructEventAsync
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

    // Newer Stripe API nests shipping under collected_information; fall back to the old top-level field
    const ship = session.collected_information?.shipping_details || session.shipping_details || {};
    const addr = ship.address || {};
    const customerName = ship.name || session.customer_details?.name || '';
    const shippingAddress = [
      customerName,
      addr.line1,
      addr.line2,
      [addr.city, addr.state, addr.postal_code].filter(Boolean).join(', '),
      addr.country,
    ].filter(Boolean).join('\n');

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
            customer_email: session.customer_details?.email,
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
