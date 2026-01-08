// app/api/directions/route.js
import { NextResponse } from 'next/server';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const origin = searchParams.get('origin');       // "lat,lng"
    const destination = searchParams.get('destination');
    const mode = searchParams.get('mode') || 'driving';

    if (!origin || !destination) {
      return NextResponse.json(
        { status: 'INVALID_REQUEST', error_message: 'Faltan origin/destination' },
        { status: 400 }
      );
    }

    const key = process.env.GOOGLE_MAPS_API_KEY; // NO lo exponga al cliente
    if (!key) {
      return NextResponse.json(
        { status: 'CONFIG_ERROR', error_message: 'Falta GOOGLE_MAPS_API_KEY en Vercel' },
        { status: 500 }
      );
    }

    const url =
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${encodeURIComponent(origin)}` +
      `&destination=${encodeURIComponent(destination)}` +
      `&mode=${encodeURIComponent(mode)}` +
      `&key=${encodeURIComponent(key)}`;

    const r = await fetch(url, { cache: 'no-store' });
    const data = await r.json();

    return NextResponse.json(data, { status: r.status });
  } catch (e) {
    return NextResponse.json(
      { status: 'SERVER_ERROR', error_message: e?.message || 'Error interno' },
      { status: 500 }
    );
  }
}
