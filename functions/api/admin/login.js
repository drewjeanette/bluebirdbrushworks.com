// POST /api/admin/login  { password }  -> sets HttpOnly session cookie

const SESSION_HOURS = 24;

function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time string compare (defeats timing attacks)
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function onRequestPost({ request, env }) {
  try {
    const { password } = await request.json();
    if (!password || typeof password !== 'string') {
      return Response.json({ error: 'Password required' }, { status: 400 });
    }

    if (!env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Server not configured' }, { status: 500 });
    }

    if (!safeEqual(password, env.ADMIN_PASSWORD)) {
      // Small delay to slow naive brute force
      await new Promise(r => setTimeout(r, 600));
      return Response.json({ error: 'Incorrect password' }, { status: 401 });
    }

    const token = generateToken();
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600;

    await env.DB.prepare(
      'INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)'
    ).bind(token, expiresAt).run();

    // Best-effort cleanup of expired sessions
    await env.DB.prepare(
      'DELETE FROM admin_sessions WHERE expires_at < ?'
    ).bind(Math.floor(Date.now() / 1000)).run();

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `bb_admin=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_HOURS * 3600}`,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return Response.json({ error: 'Login failed' }, { status: 500 });
  }
}
