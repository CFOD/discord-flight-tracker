export function FlightCard({ flight, x, y, onClose }) {
  const cardW = 230;
  const cardH = 120;
  const left = Math.min(Math.max(x + 14, 8), window.innerWidth - cardW - 8);
  const top = Math.min(Math.max(y - cardH / 2, 8), window.innerHeight - cardH - 8);

  const style = {
    position: 'fixed',
    left,
    top,
    background: 'rgba(8, 12, 24, 0.88)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: '10px 14px',
    color: '#e8edf5',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    width: cardW,
    pointerEvents: 'auto',
    zIndex: 100,
    backdropFilter: 'blur(6px)',
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
  };

  const accentColor = flight.color ?? '#e8f0ff';

  return (
    <div style={style} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>{flight.displayName}</span>
        </div>
        <span style={{ cursor: 'pointer', color: '#555', fontSize: 16, lineHeight: 1 }} onClick={onClose}>✕</span>
      </div>
      <div style={{ color: '#a0aec0', fontSize: 12, marginBottom: 4 }}>
        {flight.callsign ?? '—'}
        {flight.origin && flight.destination && (
          <span style={{ marginLeft: 8 }}>{flight.origin} → {flight.destination}</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
        <div>
          <div style={{ color: '#556', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Altitude</div>
          <div style={{ color: '#e8edf5', fontSize: 13, fontWeight: 500 }}>
            {flight.altitude != null ? `FL${Math.round(flight.altitude / 100)}` : '—'}
          </div>
        </div>
        <div>
          <div style={{ color: '#556', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Speed</div>
          <div style={{ color: '#e8edf5', fontSize: 13, fontWeight: 500 }}>
            {flight.speed != null ? `${Math.round(flight.speed)} kt` : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}
