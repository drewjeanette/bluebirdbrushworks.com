// Public product list — used by the homepage to render the shop grid.

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, name, description, price_cents, tag, image_key, image_key_2, image_key_3, sold_out, sort_order
       FROM products
       ORDER BY sort_order ASC, id ASC`
    ).all();

    const products = results.map(r => ({
      id: r.id,
      name: r.name,
      desc: r.description || '',
      price: r.price_cents / 100,
      tag: r.tag,
      image: r.image_key ? `/images/${r.image_key}` : null,
      images: [r.image_key, r.image_key_2, r.image_key_3].filter(Boolean).map(k => `/images/${k}`),
      soldOut: r.sold_out === 1,
    }));

    return new Response(JSON.stringify(products), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30',
      },
    });
  } catch (err) {
    console.error('Products fetch failed:', err);
    return Response.json({ error: 'Failed to load products' }, { status: 500 });
  }
}
