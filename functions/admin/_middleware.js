// Protects every /admin/* route except the login page.
// Reads the session cookie, verifies it against admin_sessions in D1,
// and redirects to /admin/login on failure.

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // Allow the login page itself through without auth
  if (url.pathname === '/admin/login' || url.pathname === '/admin/login.html') {
    return next();
  }

  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)bb_admin=([^;]+)/);
  const token = match ? match[1] : null;

  if (!token) return Response.redirect(`${url.origin}/admin/login`, 302);

  try {
    const row = await env.DB.prepare(
      'SELECT expires_at FROM admin_sessions WHERE token = ?'
    ).bind(token).first();

    const now = Math.floor(Date.now() / 1000);
    if (!row || row.expires_at < now) {
      return Response.redirect(`${url.origin}/admin/login`, 302);
    }
  } catch (err) {
    console.error('Auth check failed:', err);
    return Response.redirect(`${url.origin}/admin/login`, 302);
  }

  return next();
}
