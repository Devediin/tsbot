import cron from 'node-cron';
import { getStreamsStatus } from '../../twitch';
import { sendMassPoke } from '../../scripts/client';

const {
  TWITCH_CHANNELS = '',
  TWITCH_CHECK_INTERVAL_MINUTES = '2',
} = process.env;

const liveAnnounced = new Set();

const formatLiveMessage = ({ userName }) => {
  const channelUrl = `twitch.tv/${userName.toLowerCase()}`;
  return `🟢 LIVE ON - ${userName} - ${channelUrl}`;
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

        const message = formatLiveMessage({
          userName: stream.user_name,
        });

        console.log(`[TWITCH] ${message}`);

        try {
          await sendMassPoke(teamspeak, message);
        } catch (pokeError) {
          console.error(`[TWITCH] Erro no poke: ${pokeError.message}`);
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
