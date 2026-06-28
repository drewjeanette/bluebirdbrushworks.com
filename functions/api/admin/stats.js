// Aggregated sales stats for the admin dashboard.

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

  const now = Math.floor(Date.now() / 1000);
  const day = 86400;
  const since7  = now - 7 * day;
  const since30 = now - 30 * day;

  try {
    // Totals across three time windows
    const totalsAll = await env.DB.prepare(
      'SELECT COUNT(*) AS orders, COALESCE(SUM(amount_cents),0) AS revenue FROM orders'
    ).first();
    const totals30 = await env.DB.prepare(
      'SELECT COUNT(*) AS orders, COALESCE(SUM(amount_cents),0) AS revenue FROM orders WHERE created_at >= ?'
    ).bind(since30).first();
    const totals7 = await env.DB.prepare(
      'SELECT COUNT(*) AS orders, COALESCE(SUM(amount_cents),0) AS revenue FROM orders WHERE created_at >= ?'
    ).bind(since7).first();

    // Best-selling products by quantity sold (all-time)
    const { results: topProducts } = await env.DB.prepare(
      `SELECT product_name,
              SUM(qty) AS total_qty,
              SUM(qty * unit_price_cents) AS revenue
       FROM order_items
       GROUP BY product_name
       ORDER BY total_qty DESC, revenue DESC
       LIMIT 10`
    ).all();

    // Recent orders (latest 15)
    const { results: recentOrders } = await env.DB.prepare(
      `SELECT id, amount_cents, customer_name, customer_email, shipping_address, created_at
       FROM orders
       ORDER BY created_at DESC
       LIMIT 15`
    ).all();

    // Items for those recent orders, grouped by order_id (saves a round trip per order)
    const orderIds = recentOrders.map(o => o.id);
    let itemsByOrder = {};
    if (orderIds.length) {
      const placeholders = orderIds.map(() => '?').join(',');
      const { results: items } = await env.DB.prepare(
        `SELECT order_id, product_name, qty, unit_price_cents
         FROM order_items
         WHERE order_id IN (${placeholders})`
      ).bind(...orderIds).all();
      for (const it of items) {
        if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = [];
        itemsByOrder[it.order_id].push(it);
      }
    }

    const totalProducts = await env.DB.prepare('SELECT COUNT(*) AS n FROM products').first();
    const soldOutCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM products WHERE sold_out = 1').first();

    return Response.json({
      totals: {
        allTime: { orders: totalsAll.orders, revenue_cents: totalsAll.revenue },
        last30:  { orders: totals30.orders,  revenue_cents: totals30.revenue },
        last7:   { orders: totals7.orders,   revenue_cents: totals7.revenue },
      },
      avgOrderCents: totalsAll.orders ? Math.round(totalsAll.revenue / totalsAll.orders) : 0,
      topProducts: topProducts.map(p => ({
        name: p.product_name,
        qty: p.total_qty,
        revenue_cents: p.revenue,
      })),
      recentOrders: recentOrders.map(o => ({
        id: o.id,
        amount_cents: o.amount_cents,
        customer_name: o.customer_name,
        customer_email: o.customer_email,
        shipping_address: o.shipping_address,
        created_at: o.created_at,
        items: itemsByOrder[o.id] || [],
      })),
      catalog: {
        total: totalProducts.n,
        sold_out: soldOutCount.n,
      },
    });
  } catch (err) {
    console.error('Stats query failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
