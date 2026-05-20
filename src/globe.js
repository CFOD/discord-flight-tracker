import createGlobe from 'cobe';

export const GLOBE_CONFIG = {
  width: 800,
  height: 800,
  phi: 0,
  theta: 0.3,
  dark: 1,
  diffuse: 1.2,
  mapSamples: 16000,
  mapBrightness: 12,
  baseColor: [0.3, 0.3, 0.4],
  markerColor: [1, 0.8, 0],
  glowColor: [0.1, 0.2, 0.5],
  scale: 1,
  devicePixelRatio: 2,
  opacity: 0.9,
};

export function flightsToMarkers(flights) {
  return flights.map(f => ({
    location: [f.lat, f.lon],
    size: 0.05,
  }));
}

export function latLonToXY(lat, lon, phi, theta, width, height) {
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const x3 = Math.cos(latRad) * Math.sin(lonRad + phi);
  const y3 = Math.sin(latRad);
  const z3 = Math.cos(latRad) * Math.cos(lonRad + phi);
  if (z3 < 0) return null;
  const scale = height / 2;
  return {
    x: width / 2 + x3 * scale,
    y: height / 2 - (y3 * scale * Math.cos(theta) - z3 * scale * Math.sin(theta)),
  };
}
