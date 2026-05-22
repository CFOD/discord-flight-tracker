import { useState, useEffect, useRef } from 'react';

const WS_URL = import.meta.env.DEV
  ? 'ws://localhost:3001/ws'
  : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/.proxy/ws`;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export function useFlights() {
  const [flights, setFlights] = useState([]);
  const [controllers, setControllers] = useState([]);
  const retryDelay = useRef(RECONNECT_BASE_MS);
  const timeoutRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'flights') {
            setFlights(msg.flights);
            retryDelay.current = RECONNECT_BASE_MS;
          } else if (msg.type === 'atc') {
            setControllers(msg.controllers);
          }
        } catch (_) {}
      };

      ws.onclose = () => {
        if (destroyed) return;
        timeoutRef.current = setTimeout(() => {
          retryDelay.current = Math.min(retryDelay.current * 2, RECONNECT_MAX_MS);
          connect();
        }, retryDelay.current);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      destroyed = true;
      clearTimeout(timeoutRef.current);
      wsRef.current?.close();
    };
  }, []);

  return { flights, controllers };
}
