import Channels from '../api/models/channels';
import { insertChannel } from '../api/models/channels';

const BOT_CHANNEL_PERMISSIONS = {
  channel_flag_permanent: 1,
  channel_needed_join_power: 2,
  channel_needed_subscribe_power: 2,
};

const BOT_ENEMY_CHANNEL_PERMISSIONS = {
  channel_flag_permanent: 1,
  channel_needed_join_power: 50,
  channel_needed_subscribe_power: 50,
};

const getChannelEditPermissionsByType = (type) => {
  if (type === 'enemy') {
    return {
      channel_needed_join_power: 50,
      channel_needed_subscribe_power: 50,
    };
  }

  return {
    channel_needed_join_power: 2,
    channel_needed_subscribe_power: 2,
  };
};

const getChannelCreatePermissionsByType = (type) => {
  if (type === 'enemy') {
    return BOT_ENEMY_CHANNEL_PERMISSIONS;
  }

  return BOT_CHANNEL_PERMISSIONS;
};

export const createChannel = async (teamspeak = {}, { name, type, description }, data = {}) => {
  try {
    const channel = await teamspeak.channelCreate(name, {
      ...data,
      channel_description: description,
      ...getChannelCreatePermissionsByType(type),
    });

    await insertChannel(channel, type);

    return channel;
  } catch (error) {
    console.error(error);
  }
};

export const updateChannel = async (teamspeak = {}, type, onlineData = {}, channelListsName = []) => (
  new Promise(async (resolve, reject) => {
    try {
      const channelFromDb = await Channels.findOne({ type });

      if (!channelFromDb) return resolve(false);

      const { cid, channelName } = channelFromDb;
      const channelFromTs = await teamspeak.getChannelByID(cid);

      const { online, dbCharacters, description } = onlineData;

      const onlinePlayers = online ? online.length : 0;
      const charactersFromList = dbCharacters ? dbCharacters.length : 0;

      const newChannelName = `${channelName.replace(/ *\([^)]*\) */g, '')} (${onlinePlayers}/${charactersFromList})`;

      const extraEditParams = {};
      const isDifferentChannelName = !channelListsName.includes(newChannelName);

      if (isDifferentChannelName) {
        Object.assign(extraEditParams, { channel_name: newChannelName });
      }

      await channelFromTs.edit({
        channel_description: description,
        ...getChannelEditPermissionsByType(type),
        ...extraEditParams,
      });

      resolve(true);
    } catch (error) {
      reject(error);
    }
  })
);

const findChannelByExactName = async (teamspeak = {}, channelName = '') => {
  const channels = await teamspeak.channelList();

  return channels.find(({ propcache = {} }) => (
    String(propcache.channel_name || '') === String(channelName)
  )) || null;
};

export const upsertNeutralPageChannel = async (
  teamspeak = {},
  pageIndex = 0,
  rangeLabel = '',
  description = '',
  parentChannel = null
) => {
  const type = `neutral-page-${pageIndex}`;
  let channelFromDb = await Channels.findOne({ type });

  const baseName = `[cspacer]Neutrals Page ${pageIndex + 1}`;
  const finalDescription = `[b]Faixa: ${rangeLabel}[/b]\n\n${description}`;

  if (!channelFromDb) {
    const existingTsChannel = await findChannelByExactName(teamspeak, baseName);

    if (existingTsChannel) {
      await Channels.deleteMany({ type });

      await insertChannel(existingTsChannel, type);

      const existingChannelFromTs = await teamspeak.getChannelByID(existingTsChannel.propcache.cid);
      await existingChannelFromTs.edit({
        channel_description: finalDescription,
        ...getChannelEditPermissionsByType(type),
      });

      return true;
    }

    const channel = await teamspeak.channelCreate(baseName, {
      channel_description: finalDescription,
      ...getChannelCreatePermissionsByType(type),
      ...(parentChannel ? { cpid: parentChannel.cid || 0 } : {}),
    });

    await insertChannel(channel, type);
    return true;
  }

  const channelFromTs = await teamspeak.getChannelByID(channelFromDb.cid);

  await channelFromTs.edit({
    channel_description: finalDescription,
    ...getChannelEditPermissionsByType(type),
  });

  return true;
};

export const deleteUnusedNeutralPageChannels = async (teamspeak = {}, validPageIndexes = []) => {
  const oldChannels = await Channels.find({
    type: { $regex: /^neutral-page-/ }
  });

  for (const channel of oldChannels) {
    const pageIndex = Number(channel.type.replace('neutral-page-', ''));

    if (validPageIndexes.includes(pageIndex)) {
      continue;
    }

    try {
      const tsChannel = await teamspeak.getChannelByID(channel.cid);
      await tsChannel.del(true);
    } catch (e) {
      // ignore if already deleted
    }

    await Channels.deleteOne({ _id: channel._id });
  }

  return true;
};
