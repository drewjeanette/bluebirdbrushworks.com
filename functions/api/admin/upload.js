// Image upload to R2. Auth-required. Returns the storage key.
//
// Free-tier guardrails:
//   - 5 MB max per image
//   - Only image/* MIME types accepted
//   - Random key with extension preserved

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

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

function randomKey(ext) {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `product-${Date.now()}-${id}.${ext}`;
}

export async function onRequestPost({ request, env }) {
  if (!(await requireAuth(request, env))) return new Response('Unauthorized', { status: 401 });

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return Response.json({ error: 'No file uploaded' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return Response.json({ error: 'Only JPEG, PNG, WebP, or GIF images are allowed' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: 'Image must be 5 MB or smaller' }, { status: 400 });
    }

    const ext = file.type === 'image/jpeg' ? 'jpg'
      : file.type === 'image/png' ? 'png'
      : file.type === 'image/webp' ? 'webp'
      : 'gif';
    const key = randomKey(ext);

    await env.IMAGES.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    return Response.json({ ok: true, key, url: `/images/${key}` });
  } catch (err) {
    console.error('Upload failed:', err);
    return Response.json({ error: 'Upload failed' }, { status: 500 });
  }
}
