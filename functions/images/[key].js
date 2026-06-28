// Serves uploaded images from R2 with aggressive caching.
// Egress from R2 to Workers is free, so we can serve directly without CDN concerns.

export async function onRequestGet({ env, params }) {
  const key = params.key;
  if (!key) return new Response('Not found', { status: 404 });

  const object = await env.IMAGES.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('ETag', object.httpEtag);
  return new Response(object.body, { headers });
}
