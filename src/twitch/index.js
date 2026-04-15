import axios from 'axios';

const {
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
} = process.env;

let cachedToken = null;
let tokenExpiresAt = 0;

const getAccessToken = async () => {
  const now = Date.now();

  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
    params: {
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    },
  });

  cachedToken = response.data.access_token;
  tokenExpiresAt = now + (response.data.expires_in * 1000) - 60000;

  return cachedToken;
};

export const getStreamsStatus = async (channels = []) => {
  if (!channels.length) return [];

  const token = await getAccessToken();

  const params = channels.map((ch) => `user_login=${ch}`).join('&');

  const response = await axios.get(
    `https://api.twitch.tv/helix/streams?${params}`,
    {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  return response.data.data || [];
};
