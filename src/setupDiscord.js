import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';

const CLIENT_ID = '1404391746284290068';

let _sdk = null;

function getSdk() {
  if (!_sdk) _sdk = new DiscordSDK(CLIENT_ID);
  return _sdk;
}

function tokenUrl() {
  if (import.meta.env.DEV) return 'http://localhost:3001/api/token';
  return '/.proxy/api/token';
}

export async function setupDiscord() {
  const sdk = getSdk();

  await sdk.ready();

  patchUrlMappings([
    { prefix: '/ws', target: 'flightmap.cfod.co.uk' },
    { prefix: '/api', target: 'flightmap.cfod.co.uk' },
  ]);

  const { code } = await sdk.commands.authorize({
    client_id: CLIENT_ID,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify'],
  });

  const res = await fetch(tokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const { access_token } = await res.json();

  await sdk.commands.authenticate({ access_token });
}
