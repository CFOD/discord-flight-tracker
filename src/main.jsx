import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { patchUrlMappings } from '@discord/embedded-app-sdk';
import App from './App.jsx';

if (!import.meta.env.DEV) {
  patchUrlMappings([
    { prefix: '/api', target: 'flightmap.cfod.co.uk' },
    { prefix: '/ws',  target: 'flightmap.cfod.co.uk' },
  ]);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
