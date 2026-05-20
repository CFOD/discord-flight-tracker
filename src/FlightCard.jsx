export function FlightCard({ flight, x, y, onClose }) {
  const cardW = 220;
  const cardH = 110;
  const left = Math.min(Math.max(x + 12, 8), window.innerWidth - cardW - 8);
  const top = Math.min(Math.max(y - cardH / 2, 8), window.innerHeight - cardH - 8);

  const style = {
    position: 'fixed',
    left,
    top,
    background: 'rgba(10, 15, 30, 0.92)',
    border: '1px solid rgba(255, 200, 0, 0.4)',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#fff',
    fontFamily: 'monospace',
    fontSize: 13,
    width: cardW,
    pointerEvents: 'auto',
    zIndex: 100,
  };

  const dot = {
    display: 'inline-block',
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: flight.color ?? '#f0cb00',
    marginRight: 6,
    verticalAlign: 'middle',
  };

  return (
    <div style={style} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span><span style={dot} /><strong>{flight.displayName}</strong></span>
        <span style={{ cursor: 'pointer', color: '#888', marginLeft: 12 }} onClick={onClose}>✕</span>
      </div>
      <div>{flight.callsign ?? '—'}</div>
      {flight.origin && flight.destination && (
        <div style={{ color: '#aaa' }}>{flight.origin} → {flight.destination}</div>
      )}
      <div style={{ marginTop: 4, color: '#aaa' }}>
        {flight.altitude != null ? `FL${Math.round(flight.altitude / 100)}` : '—'}
        {' · '}
        {flight.speed != null ? `${Math.round(flight.speed)} kt` : '—'}
      </div>
    </div>
  );
}
