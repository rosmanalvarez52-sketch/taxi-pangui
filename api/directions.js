// api/directions.js
export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ status: 'METHOD_NOT_ALLOWED', error_message: 'Use GET' });
  }

  try {
    const key = process.env.GOOGLE_MAPS_REST_KEY;
    if (!key) {
      return res
        .status(500)
        .json({ status: 'NO_KEY', error_message: 'Missing GOOGLE_MAPS_REST_KEY' });
    }

    const { origin, destination, mode = 'driving' } = req.query;

    if (!origin || !destination) {
      return res.status(400).json({
        status: 'BAD_REQUEST',
        error_message: 'origin and destination are required',
      });
    }

    const params = new URLSearchParams({
      origin: String(origin),
      destination: String(destination),
      mode: String(mode),
      region: 'ec',
      language: 'es',
      key,
    });

    const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;

    const r = await fetch(url);
    const data = await r.json().catch(() => null);

    if (!data) {
      return res.status(502).json({
        status: 'BAD_GATEWAY',
        error_message: 'Google response was not JSON',
      });
    }

    // ✅ Si Google responde error (REQUEST_DENIED, OVER_QUERY_LIMIT, etc.) lo pasamos igual
    // para que el frontend active fallback OSRM con mensaje interno.
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({
      status: 'SERVER_ERROR',
      error_message: e?.message || 'Error',
    });
  }
}
