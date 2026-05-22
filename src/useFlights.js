import { useState, useEffect, useRef } from 'react';

const WS_URL = import.meta.env.DEV
  ? 'ws://localhost:3001/ws'
  : location.host.includes('discordsays.com')
    ? '/ws'
    : 'wss://flightmap.cfod.co.uk/ws';
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export function useFlights() {
  const [flights, setFlights] = useState([]);
  const [controllers, setControllers] = useState([]);
  const [users, setUsers] = useState([]);
  const retryDelay = useRef(RECONNECT_BASE_MS);
  const timeoutRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      console.log('[useFlights] connecting to', WS_URL);
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => console.log('[useFlights] connected');

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log('[useFlights] msg', msg.type, msg.flights?.length ?? msg.controllers?.length ?? msg.users?.length);
          if (msg.type === 'flights') {
            setFlights(msg.flights);
            retryDelay.current = RECONNECT_BASE_MS;
          } else if (msg.type === 'atc') {
            setControllers(msg.controllers);
          } else if (msg.type === 'users') {
            setUsers(msg.users);
          }
        } catch (_) {}
      };

      ws.onclose = (e) => {
        console.log('[useFlights] closed', e.code, e.reason);
        if (destroyed) return;
        timeoutRef.current = setTimeout(() => {
          retryDelay.current = Math.min(retryDelay.current * 2, RECONNECT_MAX_MS);
          connect();
        }, retryDelay.current);
      };

      ws.onerror = (e) => { console.log('[useFlights] error', e); ws.close(); };
    }

    connect();

    return () => {
      destroyed = true;
      clearTimeout(timeoutRef.current);
      wsRef.current?.close();
    };
  }, []);

  return { flights, controllers, users };
}
