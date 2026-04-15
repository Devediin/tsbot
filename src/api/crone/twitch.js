import cron from 'node-cron';
import { getStreamsStatus } from '../../twitch';
import { sendMassPoke } from '../../scripts/client';

const {
  TWITCH_CHANNELS = '',
  TWITCH_CHECK_INTERVAL_MINUTES = '2',
} = process.env;

const liveAnnounced = new Set();

const formatLiveMessage = ({ userName, title, gameName }) => {
  const channelUrl = `https://twitch.tv/${userName.toLowerCase()}`;

  let message = `🟢 LIVE ON - [B]${userName}[/B] está online na Twitch! [URL]${channelUrl}[/URL]`;

  if (title) {
    message += ` | ${title}`;
  }

  if (gameName) {
    message += ` | 🎮 ${gameName}`;
  }

  return message;
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
          title: stream.title,
          gameName: stream.game_name,
        });

        console.log(`[TWITCH] ${message}`);
        await sendMassPoke(teamspeak, message);

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
