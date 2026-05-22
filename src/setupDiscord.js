import { DiscordSDK } from '@discord/embedded-app-sdk';

const CLIENT_ID = '1404391746284290068';

let _sdk = null;

function getSdk() {
  if (!_sdk) _sdk = new DiscordSDK(CLIENT_ID);
  return _sdk;
}

export async function setupDiscord() {
  const sdk = getSdk();
  await sdk.ready();
}
