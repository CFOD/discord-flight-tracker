import { useState, Suspense } from 'react';
import { useFlights } from './useFlights.js';
import { Globe } from './Globe.jsx';
import { FlightCard } from './FlightCard.jsx';
import { FlightSidebar } from './FlightSidebar.jsx';

function LoadingScreen() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0 }}>
      <div style={{ color: '#3399ff', fontFamily: 'monospace', fontSize: 14, opacity: 0.7 }}>Loading...</div>
    </div>
  );
}

function FlightGlobe() {
  const { flights, controllers, users } = useFlights();
  const [selected, setSelected] = useState(null);
  const [cardPos, setCardPos] = useState({ x: 0, y: 0 });

  function handleFlightClick(flight, e) {
    setSelected(flight);
    setCardPos({ x: e.clientX, y: e.clientY });
  }

  return (
    <div
      style={{ width: '100vw', height: '100vh', background: '#000', position: 'fixed', top: 0, left: 0 }}
      onClick={() => setSelected(null)}
    >
      <Globe flights={flights} controllers={controllers} onFlightClick={handleFlightClick} />
      {selected && (
        <FlightCard
          flight={selected}
          x={cardPos.x}
          y={cardPos.y}
          onClose={() => setSelected(null)}
        />
      )}
      <FlightSidebar
        users={users}
        flights={flights}
        onFlightClick={(flight) => {
          setSelected(flight);
          setCardPos({ x: window.innerWidth - 280, y: window.innerHeight / 2 });
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <FlightGlobe />
    </Suspense>
  );
}
