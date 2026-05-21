import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';

const CLIENT_ID = '1404391746284290068';

export const discordSdk = new DiscordSDK(CLIENT_ID);

export async function setupDiscord() {
  patchUrlMappings([
    { prefix: '/api', target: 'flightmap.cfod.co.uk' },
    { prefix: '/ws', target: 'flightmap.cfod.co.uk' },
  ]);

  await discordSdk.ready();

  const { code } = await discordSdk.commands.authorize({
    client_id: CLIENT_ID,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify'],
  });

  const response = await fetch('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);
  const { access_token } = await response.json();
  await discordSdk.commands.authenticate({ access_token });
}
