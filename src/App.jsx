import { useState } from 'react';
import { useFlights } from './useFlights.js';
import { Globe } from './Globe.jsx';
import { FlightCard } from './FlightCard.jsx';

export default function App() {
  const flights = useFlights();
  const [selected, setSelected] = useState(null);
  const [cardPos, setCardPos] = useState({ x: 0, y: 0 });

  function handleFlightClick(flight, e) {
    setSelected(flight);
    setCardPos({ x: e.clientX, y: e.clientY });
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', position: 'fixed', top: 0, left: 0 }}
      onClick={() => setSelected(null)}
    >
      <Globe flights={flights} onFlightClick={handleFlightClick} />
      {selected && (
        <FlightCard
          flight={selected}
          x={cardPos.x}
          y={cardPos.y}
          onClose={() => setSelected(null)}
        />
      )}
      {flights.length === 0 && (
        <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', color: '#666', fontSize: 13, pointerEvents: 'none' }}>
          No active flights
        </div>
      )}
    </div>
  );
}
