import { useState } from 'react';

function formatAlt(alt) {
  if (alt == null) return null;
  return `FL${Math.round(alt / 100)}`;
}

function formatSpeed(spd) {
  if (spd == null) return null;
  return `${Math.round(spd)} kt`;
}

function Avatar({ user }) {
  const [errored, setErrored] = useState(false);

  const style = {
    width: 32,
    height: 32,
    borderRadius: '50%',
    flexShrink: 0,
    background: user.color ?? '#334',
    border: `2px solid ${user.color ?? '#445'}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 600,
    color: '#fff',
    overflow: 'hidden',
  };

  if (user.avatar && !errored) {
    return (
      <div style={style}>
        <img
          src={user.avatar}
          alt={user.displayName}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setErrored(true)}
        />
      </div>
    );
  }

  return (
    <div style={style}>
      {(user.displayName ?? '?')[0].toUpperCase()}
    </div>
  );
}

function FlightDetail({ flight }) {
  const rows = [
    flight.callsign && { label: 'Callsign', value: flight.callsign },
    flight.origin && flight.destination && { label: 'Route', value: `${flight.origin} → ${flight.destination}` },
    flight.altitude != null && { label: 'Altitude', value: formatAlt(flight.altitude) },
    flight.speed != null && { label: 'Speed', value: formatSpeed(flight.speed) },
    flight.heading != null && { label: 'Heading', value: `${Math.round(flight.heading)}°` },
    flight.waypoints?.length && { label: 'Waypoints', value: `${flight.waypoints.length} fixes` },
  ].filter(Boolean);

  return (
    <div style={{
      marginTop: 8,
      padding: '8px 10px',
      background: 'rgba(255,255,255,0.04)',
      borderRadius: 6,
      borderLeft: `2px solid ${flight.color ?? '#556'}`,
    }}>
      {rows.map(({ label, value }) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 3 }}>
          <span style={{ color: '#5a6a80', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
            {label}
          </span>
          <span style={{ color: '#c8d8e8', fontSize: 12, fontWeight: 500, textAlign: 'right' }}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function UserRow({ user, flight, onFlightClick }) {
  const [expanded, setExpanded] = useState(false);
  const online = !!flight;

  function handleClick() {
    if (!online) return;
    setExpanded((v) => !v);
    if (onFlightClick && !expanded) onFlightClick(flight);
  }

  return (
    <div style={{ marginBottom: 4 }}>
      <div
        onClick={handleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '7px 10px',
          borderRadius: 7,
          cursor: online ? 'pointer' : 'default',
          background: expanded ? 'rgba(255,255,255,0.07)' : 'transparent',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { if (online) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = expanded ? 'rgba(255,255,255,0.07)' : 'transparent'; }}
      >
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar user={user} />
          <div style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: online ? '#3ddc84' : '#444',
            border: '1.5px solid #0d1117',
          }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            color: online ? '#e8edf5' : '#4a5568',
            fontSize: 13,
            fontWeight: online ? 600 : 400,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {user.displayName}
          </div>
          {online && (
            <div style={{ color: '#4a6080', fontSize: 11, marginTop: 1 }}>
              {flight.origin && flight.destination
                ? `${flight.origin} → ${flight.destination}`
                : flight.callsign ?? 'Flying'}
            </div>
          )}
        </div>
        {online && (
          <div style={{ color: '#3a4a5a', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>
            {expanded ? '▴' : '▾'}
          </div>
        )}
      </div>
      {expanded && online && <FlightDetail flight={flight} />}
    </div>
  );
}

export function FlightSidebar({ users, flights, onFlightClick }) {
  const [collapsed, setCollapsed] = useState(false);
  const flightMap = Object.fromEntries(flights.map((f) => [f.discordId, f]));
  const online = users.filter((u) => flightMap[u.discordId]);
  const offline = users.filter((u) => !flightMap[u.discordId]);
  const sorted = [...online, ...offline];

  return (
    <div style={{
      position: 'fixed',
      top: 16,
      right: 16,
      width: 220,
      maxHeight: 'calc(100vh - 32px)',
      overflowY: collapsed ? 'hidden' : 'auto',
      background: 'rgba(8, 12, 24, 0.82)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12,
      padding: collapsed ? '12px 6px' : '12px 6px',
      zIndex: 50,
      fontFamily: 'Inter, system-ui, sans-serif',
      scrollbarWidth: 'none',
    }}>
      <div style={{
        color: '#3a4a5a',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        fontWeight: 600,
        padding: '0 10px 8px',
        borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.05)',
        marginBottom: collapsed ? 0 : 6,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: 'pointer',
        userSelect: 'none',
      }} onClick={() => setCollapsed((v) => !v)}>
        <span>Pilots</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: online.length > 0 ? '#3ddc84' : '#3a4a5a' }}>
            {online.length} online
          </span>
          <span style={{ color: '#3a4a5a', fontSize: 12, lineHeight: 1 }}>
            {collapsed ? '▾' : '▴'}
          </span>
        </div>
      </div>
      {!collapsed && sorted.map((u) => (
        <UserRow
          key={u.discordId}
          user={u}
          flight={flightMap[u.discordId] ?? null}
          onFlightClick={onFlightClick}
        />
      ))}
    </div>
  );
}
