import Channels from '../api/models/channels';
import { insertChannel } from '../api/models/channels';
import { getRecentLevelEvents } from '../api/models/level-event';

const LEVEL_CHANNEL_NAME = '[cspacer]Level Ups';

const formatLevelEventsDescription = (events = []) => {
  let description = '[b][color=#00AAFF]Últimos level ups[/color][/b]\n\n';

  if (!events.length) {
    description += 'Nenhum level up registrado ainda.\n';
    return description;
  }

  events.forEach((event) => {
    const prefix = event.type === 'enemy' ? 'Enemy' : 'Friend';
    description += `${prefix} ${event.name} upou de ${event.fromLevel} para ${event.toLevel}\n`;
  });

  return description;
};

export const upsertLevelChannel = async (teamspeak) => {
  const events = await getRecentLevelEvents(20);
  const description = formatLevelEventsDescription(events);

  let channelFromDb = await Channels.findOne({ type: 'levelUps' });

  if (!channelFromDb) {
    const channel = await teamspeak.channelCreate(LEVEL_CHANNEL_NAME, {
      channel_description: description,
      channel_flag_permanent: 1,
    });

    await insertChannel(channel, 'levelUps');
    return true;
  }

  const channelFromTs = await teamspeak.getChannelByID(channelFromDb.cid);
  await channelFromTs.edit({
    channel_description: description,
    channel_name: LEVEL_CHANNEL_NAME,
  });

  return true;
};
