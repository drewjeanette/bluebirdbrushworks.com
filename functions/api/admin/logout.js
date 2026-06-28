// POST /api/admin/logout  -> clears session cookie and deletes the token

export async function onRequestPost({ request, env }) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)bb_admin=([^;]+)/);
  const token = match ? match[1] : null;

  if (token) {
    try {
      await env.DB.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(token).run();
    } catch (err) {
      console.error('Logout cleanup failed:', err);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'bb_admin=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
    },
  });
}
