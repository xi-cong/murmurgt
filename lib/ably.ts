import Ably from 'ably';

let client: Ably.Rest | null = null;

export function getAblyRest(): Ably.Rest {
  if (!client) {
    client = new Ably.Rest({ key: process.env.ABLY_KEY! });
  }
  return client;
}
