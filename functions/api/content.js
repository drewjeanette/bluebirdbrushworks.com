// Public content endpoint — returns all editable text and image URLs.
// Used by the homepage to apply the artist's current edits at load time.

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT key, value FROM content_blocks'
    ).all();

    const content = {};
    for (const row of results) content[row.key] = row.value;

    return new Response(JSON.stringify(content), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30',
      },
    });
  } catch (err) {
    console.error('Content fetch failed:', err);
    return Response.json({}, { status: 200 }); // Site falls back to baked-in defaults
  }
}
