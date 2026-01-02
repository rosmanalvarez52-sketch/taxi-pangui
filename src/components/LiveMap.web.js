// src/components/LiveMap.web.js
import React from 'react';

export default function LiveMap({ path = [], origin, destination }) {
  const last = path[path.length - 1] || origin || null;
  const google = last
    ? `https://www.google.com/maps/search/?api=1&query=${last.lat},${last.lng}`
    : null;

  return (
    <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:16}}>
      <div>
        <h3>Vista de ruta (web)</h3>
        <p>Puntos: {path.length}</p>
        {origin && <p>Origen: {origin.lat.toFixed(5)}, {origin.lng.toFixed(5)}</p>}
        {destination && <p>Destino: {destination.lat.toFixed(5)}, {destination.lng.toFixed(5)}</p>}
        {google && <a href={google} target="_blank" rel="noreferrer">Ver último punto en Google Maps</a>}
        <p style={{opacity:.6, marginTop:8}}>Podemos integrar MapLibre para mapa web embebido.</p>
      </div>
    </div>
  );
}
