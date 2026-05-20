import { useEffect, useRef, useState } from 'react';
import createGlobe from 'cobe';
import { useFlights } from './useFlights.js';
import { GLOBE_CONFIG, flightsToMarkers, latLonToXY } from './globe.js';
import { FlightCard } from './FlightCard.jsx';

export default function App() {
  const canvasRef = useRef(null);
  const phiRef = useRef(0);
  const flightsRef = useRef([]);
  const globeRef = useRef(null);
  const rafRef = useRef(null);
  const flights = useFlights();
  const [selected, setSelected] = useState(null);
  const [cardPos, setCardPos] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState(() => Math.min(window.innerWidth, window.innerHeight));

  useEffect(() => {
    function onResize() {
      setSize(Math.min(window.innerWidth, window.innerHeight));
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    flightsRef.current = flights;
  }, [flights]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const globe = createGlobe(canvasRef.current, {
      ...GLOBE_CONFIG,
      width: size * 2,
      height: size * 2,
      markers: [],
    });
    globeRef.current = globe;

    function animate() {
      phiRef.current += 0.003;
      globe.update({
        phi: phiRef.current,
        markers: flightsToMarkers(flightsRef.current),
      });
      rafRef.current = requestAnimationFrame(animate);
    }
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      globe.destroy();
      globeRef.current = null;
    };
  }, [size]);

  function handleClick(e) {
    const currentFlights = flightsRef.current;
    if (currentFlights.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const phi = phiRef.current;
    const theta = GLOBE_CONFIG.theta;

    let closest = null;
    let closestDist = 20;
    for (const flight of currentFlights) {
      const pos = latLonToXY(flight.lat, flight.lon, phi, theta, size, size);
      if (!pos) continue;
      const dist = Math.hypot(pos.x - mx, pos.y - my);
      if (dist < closestDist) {
        closestDist = dist;
        closest = { flight, pos };
      }
    }

    if (closest) {
      setSelected(closest.flight);
      setCardPos({ x: closest.pos.x, y: closest.pos.y });
    } else {
      setSelected(null);
    }
  }

  return (
    <div
      style={{ width: '100vw', height: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, overflow: 'hidden' }}
      onClick={handleClick}
    >
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size, cursor: 'pointer' }}
        width={size * 2}
        height={size * 2}
      />
      {selected && (
        <FlightCard
          flight={selected}
          x={cardPos.x}
          y={cardPos.y}
          onClose={() => setSelected(null)}
        />
      )}
      {flights.length === 0 && (
        <div style={{ position: 'absolute', bottom: 24, color: '#666', fontSize: 13 }}>
          No active flights
        </div>
      )}
    </div>
  );
}
