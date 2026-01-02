// src/components/MapLeaflet.js
import React, { useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import { WebView } from 'react-native-webview';

export default function MapLeaflet({
  origin,
  markers = [],
  polylines = [],
  onPickDestination,
  // opcional: si quieres controlar si hace fitBounds o no
  fitToBounds = true,
}) {
  const lat = origin?.latitude ?? -3.676;
  const lng = origin?.longitude ?? -79.002;

  const enablePick = typeof onPickDestination === 'function';

  // Normalizamos payload para enviar al HTML (mismo formato siempre)
  const payload = useMemo(() => {
    const m = (markers || []).map((x) => ({
      id: String(x.id),
      lat: x.latitude,
      lng: x.longitude,
      label: x.label || '',
      kind: x.kind || 'point',
      status: x.status || 'open',
      color: x.color || null,
    }));

    const p = (polylines || []).map((pl) => ({
      id: String(pl.id),
      status: pl.status || 'open',
      points: (pl.points || []).map((pt) => ({
        lat: pt.latitude,
        lng: pt.longitude,
      })),
      color: pl.color || null,
    }));

    return { markers: m, polylines: p, fitToBounds: !!fitToBounds };
  }, [markers, polylines, fitToBounds]);

  // refs para web/native
  const iframeRef = useRef(null);
  const webViewRef = useRef(null);

  // HTML base: incluye datos iniciales + handlers para actualizar sin recargar
  const html = useMemo(() => {
    const markersJson = JSON.stringify(payload.markers);
    const polylinesJson = JSON.stringify(payload.polylines);
    const fitJson = JSON.stringify(payload.fitToBounds);

    return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <style>
    html,body,#map{height:100%;margin:0}
    .label { font-size: 12px; line-height: 1.2; }
  </style>
</head>
<body>
  <div id="map"></div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map').setView([${lat}, ${lng}], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    function colorByStatus(status){
      switch(status){
        case 'assigned': return '#4CAF50';
        case 'open':
        case 'searching': return '#FF9800';
        default: return '#607D8B';
      }
    }

    // Diccionarios para actualizar sin recrear todo
    const markersById = new Map();
    const polylinesById = new Map();

    function ensureMarker(m) {
      const color = m.color || colorByStatus(m.status);
      const key = String(m.id);

      if (markersById.has(key)) {
        // actualizar posición y estilo
        const mk = markersById.get(key);
        mk.setLatLng([m.lat, m.lng]);
        mk.setStyle({ color, fillColor: color });
        if (m.label) mk.bindPopup('<div class="label">'+ m.label +'</div>');
        return mk;
      }

      const mk = L.circleMarker([m.lat, m.lng], {
        radius: 9,
        color,
        fillColor: color,
        fillOpacity: 0.9
      }).addTo(map);

      if (m.label) mk.bindPopup('<div class="label">'+ m.label +'</div>');
      markersById.set(key, mk);
      return mk;
    }

    function ensurePolyline(pl) {
      const key = String(pl.id);
      const color = pl.color || colorByStatus(pl.status);
      const pts = (pl.points || []).map(p => [p.lat, p.lng]).filter(x => x.length === 2);

      if (pts.length < 2) return null;

      if (polylinesById.has(key)) {
        const line = polylinesById.get(key);
        line.setLatLngs(pts);
        line.setStyle({ color, weight: 4, opacity: 0.9 });
        return line;
      }

      const line = L.polyline(pts, { color, weight: 4, opacity: 0.9 }).addTo(map);
      polylinesById.set(key, line);
      return line;
    }

    function removeMissing(currentIds, mapById) {
      // borra lo que ya no existe en el payload
      Array.from(mapById.keys()).forEach((id) => {
        if (!currentIds.has(id)) {
          const layer = mapById.get(id);
          try { layer.remove(); } catch(e) {}
          mapById.delete(id);
        }
      });
    }

    function applyData(data) {
      const markers = Array.isArray(data?.markers) ? data.markers : [];
      const polylines = Array.isArray(data?.polylines) ? data.polylines : [];
      const doFit = !!data?.fitToBounds;

      const markerIds = new Set(markers.map(m => String(m.id)));
      const polyIds = new Set(polylines.map(p => String(p.id)));

      // actualizar/crear
      markers.forEach(m => {
        if (typeof m.lat === 'number' && typeof m.lng === 'number') ensureMarker(m);
      });

      polylines.forEach(pl => {
        ensurePolyline(pl);
      });

      // eliminar capas que ya no están
      removeMissing(markerIds, markersById);
      removeMissing(polyIds, polylinesById);

      if (!doFit) return;

      // fitBounds con lo visible actual
      const bounds = [];
      markers.forEach(m => {
        if (typeof m.lat === 'number' && typeof m.lng === 'number') bounds.push([m.lat, m.lng]);
      });
      polylines.forEach(pl => {
        const pts = (pl.points || []).map(p => [p.lat, p.lng]);
        pts.forEach(b => bounds.push(b));
      });

      if (bounds.length > 0) {
        try { map.fitBounds(bounds, { padding: [30, 30] }); } catch(e) {}
      }
    }

    // Data inicial
    applyData({ markers: ${markersJson}, polylines: ${polylinesJson}, fitToBounds: ${fitJson} });

    // Listener para actualizaciones desde RN (web o mobile)
    window.addEventListener('message', (event) => {
      let data = event?.data;

      // En algunos casos llega como string JSON
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch(e) { return; }
      }

      if (!data || typeof data !== 'object') return;

      if (data.type === 'setData') {
        applyData(data.payload || {});
        return;
      }

      if (data.type === 'updateMarker') {
        const m = data.marker;
        if (!m || m.id == null) return;
        if (typeof m.lat !== 'number' || typeof m.lng !== 'number') return;
        ensureMarker(m);
        return;
      }
    });

    // --- Click para elegir destino (solo si se pide)
    ${enablePick ? `
      let destMarker = null;
      map.on('click', (e) => {
        if(destMarker) destMarker.remove();
        destMarker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(map);

        const msg = JSON.stringify({type:'dest', lat:e.latlng.lat, lng:e.latlng.lng});
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(msg);
        } else if (window.parent) {
          window.parent.postMessage(msg, '*');
        }
      });
    ` : ``}
  </script>
</body>
</html>`;
  }, [lat, lng, payload, enablePick]);

  // Enviar data al mapa (sin recargar) cada vez que cambian markers/polylines
  useEffect(() => {
    const msg = JSON.stringify({ type: 'setData', payload });

    if (Platform.OS === 'web') {
      const iframe = iframeRef.current;
      const win = iframe?.contentWindow;
      if (win) {
        try {
          win.postMessage(msg, '*');
        } catch (_) {}
      }
      return;
    }

    // Native WebView
    const wv = webViewRef.current;
    if (wv && typeof wv.postMessage === 'function') {
      try {
        wv.postMessage(msg);
      } catch (_) {}
    }
  }, [payload]);

  // WEB: iframe + postMessage
  if (Platform.OS === 'web') {
    return (
      <div
        style={{ height: '100%', width: '100%' }}
        ref={(div) => {
          if (!div) return;
          if (div._listenerAttached) return;
          div._listenerAttached = true;

          window.addEventListener('message', (e) => {
            if (!enablePick) return;
            try {
              const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
              if (data?.type === 'dest') {
                onPickDestination?.({
                  latitude: data.lat,
                  longitude: data.lng,
                });
              }
            } catch (_) {}
          });
        }}
      >
        <iframe
          ref={iframeRef}
          title="leaflet"
          srcDoc={html}
          style={{ border: '0', height: '100%', width: '100%' }}
        />
      </div>
    );
  }

  // ANDROID/IOS: WebView
  return (
    <WebView
      ref={webViewRef}
      originWhitelist={['*']}
      source={{ html }}
      onMessage={(e) => {
        if (!enablePick) return;
        try {
          const data = JSON.parse(e.nativeEvent.data);
          if (data.type === 'dest') {
            onPickDestination?.({
              latitude: data.lat,
              longitude: data.lng,
            });
          }
        } catch (_) {}
      }}
    />
  );
}
