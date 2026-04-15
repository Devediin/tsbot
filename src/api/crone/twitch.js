import cron from 'node-cron';
import { getStreamsStatus } from '../../twitch';
import { sendMassPoke, sendMassPrivateMessage } from '../../scripts/client';

const {
  TWITCH_CHANNELS = '',
  TWITCH_CHECK_INTERVAL_MINUTES = '2',
} = process.env;

const liveAnnounced = new Set();

const formatPokeMessage = ({ userName }) => {
  const channelUrl = `twitch.tv/${userName.toLowerCase()}`;
  return `>> LIVE ON - ${userName} - ${channelUrl}`;
};

const formatPrivateMessage = ({ userName }) => {
  const channelUrl = `https://twitch.tv/${userName.toLowerCase()}`;
  return `🟢 LIVE ON - [B]${userName}[/B] está ao vivo na Twitch! [URL]${channelUrl}[/URL]`;
};

export const startTwitchTask = (teamspeak) => {
  const channels = TWITCH_CHANNELS
    .split(',')
    .map((ch) => ch.trim().toLowerCase())
    .filter(Boolean);

  if (!channels.length) {
    console.log('[TWITCH] Nenhum canal configurado. Task não iniciada.');
    return;
  }

  console.log(`[TWITCH] Monitorando canais: ${channels.join(', ')}`);

  const intervalMinutes = Number(TWITCH_CHECK_INTERVAL_MINUTES) || 2;

  const task = cron.schedule(`*/${intervalMinutes} * * * *`, async () => {
    try {
      const streams = await getStreamsStatus(channels);
      const liveChannels = new Set(streams.map((s) => s.user_login.toLowerCase()));

      for (const stream of streams) {
        const channelName = stream.user_login.toLowerCase();

        if (liveAnnounced.has(channelName)) {
          continue;
        }

        const pokeMessage = formatPokeMessage({
          userName: stream.user_name,
        });

        const privateMessage = formatPrivateMessage({
          userName: stream.user_name,
        });

        console.log(`[TWITCH] ${pokeMessage}`);

        try {
          await sendMassPoke(teamspeak, pokeMessage);
        } catch (pokeError) {
          console.error(`[TWITCH] Erro no poke: ${pokeError.message}`);
        }

        try {
          await sendMassPrivateMessage(teamspeak, privateMessage);
        } catch (pmError) {
          console.error(`[TWITCH] Erro no PM: ${pmError.message}`);
        }

        liveAnnounced.add(channelName);
      }

      for (const announced of liveAnnounced) {
        if (!liveChannels.has(announced)) {
          console.log(`[TWITCH] ${announced} ficou offline. Resetando flag.`);
          liveAnnounced.delete(announced);
        }
      }
    } catch (error) {
      console.error('[TWITCH] Erro verificando streams:', error.message);
    }
  }, {
    scheduled: false,
  });

  task.start();
};
