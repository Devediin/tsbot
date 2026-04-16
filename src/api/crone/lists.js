import cron from 'node-cron';
import moment from 'moment';
import { capitalize } from 'lodash';
import TibiaAPI from '../tibia';
import Characters from '../models/characters';
import Channels from '../models/channels';
import { updateDailyInfoChannel } from './daily-info';
import { syncCharactersByGuildName } from '../models/characters';
import Meta, {
  updateMeta,
  getDeathsCache,
  addDeathsCache,
  removeOldDeathsCache,
  getServerSaveStatus,
  setServerSaveOffline,
  setServerSaveOnline,
  setServerSaveAnnounced,
} from '../models/meta';
import {
  upsertOnlineTracker,
  getOnlineTrackerByName,
} from '../models/online-tracker';
import {
  ensureMonthlyLevelTracker,
  getMonthlyLevelTrackerByName,
} from '../models/monthly-level-tracker';
import {
  ensureLevelTracker,
  setLevelTrackerLevel,
} from '../models/level-tracker';
import {
  sendMassPoke,
  sendMassPrivateMessage,
} from '../../scripts/client';
import { moveAfkClients } from '../../scripts/afk';
import { syncRegistrationGroups } from '../../scripts/registration-groups';
import {
  updateChannel,
  upsertNeutralPageChannel,
  deleteUnusedNeutralPageChannels,
} from '../../scripts/channels';

const { WORLD_NAME } = process.env;
const {
  GUILD_AUTO_SYNC_NAME,
  GUILD_AUTO_SYNC_INTERVAL_MINUTES = '30',
} = process.env;
const NEUTRAL_PAGE_SIZE = 50;
const RECENT_OFFLINE_DEATH_WINDOW_SECONDS = 180;

const tibiaAPI = new TibiaAPI({ worldName: WORLD_NAME });
let isFastTaskRunning = false;
let isSlowTaskRunning = false;
let isGuildSyncRunning = false;
const announcedLevelUps = new Map();
let previousOnlineNames = new Set();
const recentlyOfflineMap = new Map();

const getVocationLabel = ({ vocation }) => {
  if (vocation.includes('Royal Paladin') || vocation === 'Paladin') return '🏹 [RP]';
  if (vocation.includes('Master Sorcerer') || vocation === 'Sorcerer') return '🔥 [MS]';
  if (vocation.includes('Elder Druid') || vocation === 'Druid') return '🌿 [ED]';
  if (vocation.includes('Elite Knight') || vocation === 'Knight') return '🛡️ [EK]';
  if (vocation.includes('Exalted Monk') || vocation === 'Monk') return '🥋 [EM]';
  return '❔ [UNK]';
};

const getVocationEmoji = (vocation = '') => {
  if (vocation.includes('Royal Paladin') || vocation === 'Paladin') return '🏹';
  if (vocation.includes('Master Sorcerer') || vocation === 'Sorcerer') return '🔥';
  if (vocation.includes('Elder Druid') || vocation === 'Druid') return '🌿';
  if (vocation.includes('Elite Knight') || vocation === 'Knight') return '🛡️';
  if (vocation.includes('Exalted Monk') || vocation === 'Monk') return '🥋';
  return '❔';
};

const getTypeLabel = (type = '') => {
  if (type === 'friend') return 'FRIEND';
  if (type === 'enemy') return 'ENEMY';
  if (type === 'neutral') return 'NEUTRAL';
  return String(type || 'CHAR').toUpperCase();
};

const getTypeColorTag = (type = '') => {
  if (type === 'friend') return '🟢';
  if (type === 'enemy') return '🔴';
  return '⚪';
};

const formatDeathAgeShort = (time) => {
  const deathMoment = moment(time);

  if (!deathMoment.isValid()) return 'agora';

  const diffMinutes = moment().diff(deathMoment, 'minutes');
  if (diffMinutes < 1) return 'agora';
  if (diffMinutes < 60) return `${diffMinutes}m`;

  const diffHours = moment().diff(deathMoment, 'hours');
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = moment().diff(deathMoment, 'days');
  return `${diffDays}d`;
};

const formatDeathMessage = ({
  type,
  characterName,
  level,
  mainKiller,
  time,
}) => {
  const typeLabel = getTypeLabel(type);
  const typeColorTag = getTypeColorTag(type);
  const deathAge = formatDeathAgeShort(time);

  return `⏰ [${deathAge}] 💀 ${typeColorTag} [${typeLabel}] [B]${characterName}[/B] morreu no level ${level} para [B]${mainKiller}[/B]`;
};

const formatLevelMessage = ({
  name,
  previousLevel,
  currentLevel,
  vocation,
  monitoredType,
}) => {
  const typeLabel = getTypeLabel(monitoredType);
  const emoji = getVocationEmoji(vocation);
  const levelsGained = Number(currentLevel) - Number(previousLevel);

  return `✨ 🆙 [${typeLabel}] ${emoji} [B]${name}[/B] upou de [B]${previousLevel}[/B] para [B]${currentLevel}[/B] (+${levelsGained})`;
};

const buildServerSaveMessage = ({ worldName, boostedCreature, boostedBoss }) => {
  const lines = [
    `🟢 [B]${worldName}[/B] voltou do server save.`,
  ];

  if (boostedCreature) {
    lines.push(`🐉 Boosted Creature: [B]${boostedCreature}[/B]`);
  }

  if (boostedBoss) {
    lines.push(`👹 Boosted Boss: [B]${boostedBoss}[/B]`);
  }

  return lines.join(' ');
};

const sortDescendingByLevel = (characters = []) => (
  [...characters].sort((a, b) => Number(b.level) - Number(a.level))
);

const splitByProfessions = (onlineCharacters = []) => {
  const eks = sortDescendingByLevel(
    onlineCharacters.filter(({ vocation }) => vocation.includes('Elite Knight') || vocation === 'Knight')
  );

  const ems = sortDescendingByLevel(
    onlineCharacters.filter(({ vocation }) => vocation.includes('Exalted Monk') || vocation === 'Monk')
  );

  const rps = sortDescendingByLevel(
    onlineCharacters.filter(({ vocation }) => vocation.includes('Royal Paladin') || vocation === 'Paladin')
  );

  const eds = sortDescendingByLevel(
    onlineCharacters.filter(({ vocation }) => vocation.includes('Elder Druid') || vocation === 'Druid')
  );

  const mss = sortDescendingByLevel(
    onlineCharacters.filter(({ vocation }) => vocation.includes('Master Sorcerer') || vocation === 'Sorcerer')
  );

  const nons = sortDescendingByLevel(
    onlineCharacters.filter(({ vocation }) => vocation === 'None')
  );

  return {
    eks,
    ems,
    rps,
    eds,
    mss,
    nons,
  };
};

const chunkArray = (array = [], size = 5) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

const getInformationFromCharacters = async (characterNames = []) => {
  try {
    const uniqueCharacters = [];
    const seen = new Set();

    for (const entry of characterNames) {
      const key = `${entry.type}:${entry.characterName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueCharacters.push(entry);
    }

    const chunks = chunkArray(uniqueCharacters, 5);
    const results = [];

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(chunk.map(async ({ type, characterName }) => {
        try {
          const information = await tibiaAPI.getCharacterInformation(characterName);

          if (information.kills && Array.isArray(information.kills)) {
            information.kills.forEach((death) => {
              death.type = type;
              death.characterName = characterName;
            });
          }

          return {
            ...information,
            monitoredType: type,
            monitoredCharacterName: characterName,
          };
        } catch (error) {
          return undefined;
        }
      }));

      results.push(...chunkResults);
    }

    return results;
  } catch (error) {
    throw error;
  }
};

const formatOnlineDuration = (firstSeenOnline) => {
  if (!firstSeenOnline) return '0m';

  const start = moment(firstSeenOnline);
  const now = moment();

  const totalMinutes = now.diff(start, 'minutes');
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes}m`;
  return `${hours}h${minutes}m`;
};

const formatMonthlyLevelDiff = (startLevel, currentLevel) => {
  const diff = Number(currentLevel) - Number(startLevel);

  if (diff > 0) return `+${diff}`;
  if (diff < 0) return `${diff}`;
  return '+0';
};

const buildCharacterDescription = async ({ name, vocation, level }) => {
  const tracker = await getOnlineTrackerByName(name);
  const monthlyTracker = await getMonthlyLevelTrackerByName(name);

  const onlineDuration = tracker?.firstSeenOnline
    ? formatOnlineDuration(tracker.firstSeenOnline)
    : '0m';

  const monthlyDiff = monthlyTracker
    ? formatMonthlyLevelDiff(monthlyTracker.startLevel, level)
    : '+0';

  return `${getVocationLabel({ vocation })} - ${level} [${monthlyDiff}] - ${name} - ${onlineDuration}\n`;
};

const appendProfessionBlock = async (title, list = [], description = '') => {
  if (!list.length) return description;

  let nextDescription = `${description}\n[b]${title} (${list.length})[/b]\n`;

  for (const character of list) {
    nextDescription += await buildCharacterDescription(character);
  }

  return nextDescription;
};

const generateDescription = async (data = {}) => {
  const { online = [], dbCharacters = [] } = data;
  const { eks, ems, rps, eds, mss, nons } = splitByProfessions(online);

  let description = `[b][color=#00AAFF]Online ${online.length}/${dbCharacters.length}[/color][/b]\n`;

  description = await appendProfessionBlock('🛡️ Elite Knights', eks, description);
  description = await appendProfessionBlock('🥋 Exalted Monks', ems, description);
  description = await appendProfessionBlock('🏹 Royal Paladins', rps, description);
  description = await appendProfessionBlock('🌿 Elder Druids', eds, description);
  description = await appendProfessionBlock('🔥 Master Sorcerers', mss, description);
  description = await appendProfessionBlock('❔ No Vocation', nons, description);

  return {
    online,
    description,
    dbCharacters,
  };
};

const getOnlineCharacters = (onlineCharacters = [], dbCharacters = []) => {
  const online = [];

  onlineCharacters.forEach((onlineCharacter) => {
    dbCharacters.forEach(({ characterName }) => {
      if (characterName === onlineCharacter.name) {
        online.push(onlineCharacter);
      }
    });
  });

  return { online, dbCharacters };
};

const getAutomaticNeutralCharacters = (onlineCharacters = [], friendCharacters = [], enemyCharacters = []) => {
  const friendNames = new Set(friendCharacters.map(({ characterName }) => characterName));
  const enemyNames = new Set(enemyCharacters.map(({ characterName }) => characterName));

  const neutralOnline = onlineCharacters.filter(({ name }) => (
    !friendNames.has(name) && !enemyNames.has(name)
  ));

  return {
    online: sortDescendingByLevel(neutralOnline),
    dbCharacters: neutralOnline.map(({ name }) => ({ characterName: name, type: 'neutral-auto' })),
  };
};

const paginateList = (items = [], pageSize = 50) => {
  const pages = [];

  for (let i = 0; i < items.length; i += pageSize) {
    pages.push(items.slice(i, i + pageSize));
  }

  return pages;
};

const syncOnlineTrackers = async (playersOnline = []) => {
  const onlineNames = new Set(playersOnline.map(({ name }) => name));

  for (const player of playersOnline) {
    await upsertOnlineTracker({ name: player.name, isOnline: true });
  }

  const trackedCharacters = await Characters.find({});
  for (const { characterName } of trackedCharacters) {
    if (!onlineNames.has(characterName)) {
      await upsertOnlineTracker({ name: characterName, isOnline: false });
    }
  }
};

const syncMonthlyLevelTrackers = async (playersOnline = []) => {
  for (const player of playersOnline) {
    await ensureMonthlyLevelTracker({
      name: player.name,
      level: player.level,
    });
  }
};

const updateRecentlyOfflineMap = (onlinePlayerNames = new Set()) => {
  const now = Date.now();

  for (const previousName of previousOnlineNames) {
    if (!onlinePlayerNames.has(previousName)) {
      recentlyOfflineMap.set(previousName, now);
    }
  }

  for (const currentName of onlinePlayerNames) {
    if (recentlyOfflineMap.has(currentName)) {
      recentlyOfflineMap.delete(currentName);
    }
  }

  for (const [name, timestamp] of recentlyOfflineMap.entries()) {
    if ((now - timestamp) / 1000 > RECENT_OFFLINE_DEATH_WINDOW_SECONDS) {
      recentlyOfflineMap.delete(name);
    }
  }

  previousOnlineNames = new Set(onlinePlayerNames);
};

const getRecentlyOfflineCharacters = (characters = []) => {
  const recentlyOffline = [];

  for (const character of characters) {
    const { type, characterName } = character;

    if (recentlyOfflineMap.has(characterName)) {
      recentlyOffline.push({ type, characterName });
    }
  }

  return recentlyOffline;
};

const processLevelUps = async (playersOnline = [], friendCharacters = [], teamspeak) => {
  const friendNames = new Set(friendCharacters.map(({ characterName }) => characterName));

  for (const player of playersOnline) {
    if (!friendNames.has(player.name)) {
      continue;
    }

    const name = player.name;
    const currentLevel = Number(player.level);
    const vocation = player.vocation;
    const monitoredType = 'friend';

    const tracker = await ensureLevelTracker({ name, level: currentLevel });
    const previousLevel = Number(tracker?.lastLevel);
    const alreadyAnnouncedLevel = announcedLevelUps.get(name);

    console.log(`[LEVEL] ${name} | monitoredType=${monitoredType} | previous=${previousLevel} | current=${currentLevel} | announced=${alreadyAnnouncedLevel}`);

    const shouldAnnounce =
      Number.isFinite(previousLevel) &&
      Number.isFinite(currentLevel) &&
      currentLevel > previousLevel &&
      alreadyAnnouncedLevel !== currentLevel;

    if (!shouldAnnounce) {
      await setLevelTrackerLevel({ name, level: currentLevel });
      continue;
    }

    const message = formatLevelMessage({
      name,
      previousLevel,
      currentLevel,
      vocation,
      monitoredType,
    });

    console.log(`[LEVEL] Enviando PM: ${message}`);
    await sendMassPrivateMessage(teamspeak, message);

    announcedLevelUps.set(name, currentLevel);
    await setLevelTrackerLevel({ name, level: currentLevel });
  }
};

const getDeathCacheKey = ({ characterName, time }) => `${characterName}::${time}`;

const getNotPokedKills = async (kills = []) => (
  new Promise(async (resolve, reject) => {
    try {
      const deathsCache = await getDeathsCache();
      const cachedKeys = new Set(
        deathsCache.map(({ characterName, time }) => getDeathCacheKey({ characterName, time }))
      );

      const killsToPoke = [];

      for (const death of kills) {
        const {
          type,
          level,
          killers = [],
          time,
          characterName,
        } = death;

        if (type !== 'friend' && type !== 'enemy') {
          continue;
        }

        const cacheKey = getDeathCacheKey({ characterName, time });
        const mainKiller = killers.length > 0 ? killers[0].name : 'unknown';
        const isCached = cachedKeys.has(cacheKey);

        console.log(
          `[DEATH] ${characterName} | type=${type} | level=${level} | time=${time} | cached=${isCached}`
        );

        if (isCached) {
          continue;
        }

        killsToPoke.push(formatDeathMessage({
          type,
          characterName,
          level,
          mainKiller,
          time,
        }));

        await addDeathsCache({ characterName, time });
      }

      console.log(`[DEATH] Kills para poke: ${killsToPoke.length}`);
      resolve(killsToPoke);
    } catch (error) {
      reject(error);
    }
  })
);

const deleteOrphanNeutralPageChannelsFromTs = async (teamspeak) => {
  try {
    const tsChannels = await teamspeak.channelList();
    const dbNeutralPages = await Channels.find({
      type: { $regex: /^neutral-page-/ }
    });

    const validDbCids = new Set(dbNeutralPages.map(({ cid }) => Number(cid)));

    const orphanNeutralPageChannels = tsChannels.filter(({ propcache = {} }) => {
      const channelName = String(propcache.channel_name || '');
      const cid = Number(propcache.cid || 0);

      const isNeutralPageName =
        channelName.startsWith('[cspacer]Neutrals Page ') ||
        channelName.startsWith('Neutrals Page ');

      if (!isNeutralPageName) {
        return false;
      }

      return !validDbCids.has(cid);
    });

    for (const orphanChannel of orphanNeutralPageChannels) {
      try {
        await orphanChannel.del(true);
      } catch (error) {
        // ignore
      }
    }
  } catch (error) {
    console.error('Erro limpando canais órfãos de neutral page:', error);
  }
};

const processServerSaveStatus = async (teamspeak) => {
  try {
    const worldOverview = await tibiaAPI.getWorldOverview();
    const serverSaveStatus = await getServerSaveStatus();
    const onlineCount = Number(worldOverview.onlineCount || 0);

    if (onlineCount <= 0) {
      if (!serverSaveStatus?.isOffline) {
        console.log('[SERVERSAVE] Mundo aparenta estar offline.');
        await setServerSaveOffline();
      }
      return;
    }

    if (serverSaveStatus?.isOffline) {
      const message = buildServerSaveMessage({
        worldName: worldOverview.name || WORLD_NAME,
        boostedCreature: worldOverview.boostedCreature,
        boostedBoss: worldOverview.boostedBoss,
      });

      console.log(`[SERVERSAVE] Mundo voltou. Mensagem: ${message}`);
      await sendMassPrivateMessage(teamspeak, message);
      await setServerSaveOnline();
      await setServerSaveAnnounced();
      await updateDailyInfoChannel(teamspeak);
    }
  } catch (error) {
    console.error('[SERVERSAVE] Erro processando status do server save:', error);
  }
};
const runGuildAutoSync = async (teamspeak) => {
  if (!GUILD_AUTO_SYNC_NAME) return;

  if (isGuildSyncRunning) {
    console.log('[CRON] guildSyncTask ainda em execução. Pulando.');
    return;
  }

  isGuildSyncRunning = true;

  try {
    console.log(`[GUILD SYNC] Iniciando sync automático da guild ${GUILD_AUTO_SYNC_NAME}`);

    const beforeFriends = await Characters.find({
      type: 'friend',
      guildName: GUILD_AUTO_SYNC_NAME,
    });

    const beforeNames = new Set(beforeFriends.map(c => c.characterName));

    const result = await syncCharactersByGuildName(GUILD_AUTO_SYNC_NAME, 'friend');

    const afterFriends = await Characters.find({
      type: 'friend',
      guildName: GUILD_AUTO_SYNC_NAME,
    });

    const afterNames = new Set(afterFriends.map(c => c.characterName));

    const entered = [];
    const left = [];

    for (const name of afterNames) {
      if (!beforeNames.has(name)) {
        entered.push(name);
      }
    }

    for (const name of beforeNames) {
      if (!afterNames.has(name)) {
        left.push(name);
      }
    }

    for (const name of entered) {
      await sendMassPrivateMessage(
        teamspeak,
        `🟢 [B]${name}[/B] ENTROU na guild ${GUILD_AUTO_SYNC_NAME}`
      );
    }

    for (const name of left) {
      await sendMassPrivateMessage(
        teamspeak,
        `🔴 [B]${name}[/B] SAIU da guild ${GUILD_AUTO_SYNC_NAME}`
      );
    }

    console.log(`[GUILD SYNC] +${entered.length} / -${left.length}`);
  } catch (error) {
    console.error('[CRON] Erro no guildSyncTask:', error);
  } finally {
    isGuildSyncRunning = false;
  }
};

export const startTasks = (teamspeak) => {
  const fastTask = cron.schedule('0-59/5 * * * * *', async () => {
    if (isFastTaskRunning) {
      console.log('[CRON] fastTask ainda em execução. Pulando esta rodada.');
      return;
    }

    isFastTaskRunning = true;

    try {
      const enemyCharacters = await Characters.find({ type: 'enemy' });
      const friendCharacters = await Characters.find({ type: 'friend' });

      const monitoredCharacters = [
        ...enemyCharacters.map(({ type, characterName }) => ({ type, characterName })),
        ...friendCharacters.map(({ type, characterName }) => ({ type, characterName })),
      ];

      const playersOnline = await tibiaAPI.getWorldOnline();
      const onlinePlayerNames = new Set(playersOnline.map(({ name }) => name));

      updateRecentlyOfflineMap(onlinePlayerNames);

      const onlineEnemyCharacters = enemyCharacters
        .filter(({ characterName }) => onlinePlayerNames.has(characterName))
        .map(({ type, characterName }) => ({ type, characterName }));

      const onlineFriendCharacters = friendCharacters
        .filter(({ characterName }) => onlinePlayerNames.has(characterName))
        .map(({ type, characterName }) => ({ type, characterName }));

      const recentlyOfflineCharacters = getRecentlyOfflineCharacters(monitoredCharacters);

      const deathPriorityCharacters = [
        ...onlineEnemyCharacters,
        ...onlineFriendCharacters,
        ...recentlyOfflineCharacters,
      ].filter(({ characterName }) => characterName);

      const allCharactersInformation = await getInformationFromCharacters(deathPriorityCharacters);
      const deathListByCharacters = [];

      if (allCharactersInformation && allCharactersInformation.length > 0) {
        allCharactersInformation.forEach((data) => {
          if (data && data.kills) {
            deathListByCharacters.push(...data.kills);
          }
        });
      }

      console.log(`[DEATH] Characters monitorados online: ${onlineEnemyCharacters.length + onlineFriendCharacters.length}`);
      console.log(`[DEATH] Characters monitorados recem-offline: ${recentlyOfflineCharacters.length}`);
      console.log(`[DEATH] Death entries recentes encontradas: ${deathListByCharacters.length}`);

      const killsToPoke = await getNotPokedKills(deathListByCharacters);
      if (killsToPoke.length > 0) {
        for (const killMessage of killsToPoke) {
          console.log(`[DEATH] Enviando poke: ${killMessage}`);
          await sendMassPoke(teamspeak, killMessage);
        }
      }

      await processLevelUps(playersOnline, friendCharacters, teamspeak);
      await syncOnlineTrackers(playersOnline);
      await syncMonthlyLevelTrackers(playersOnline);

      const enemyOnlineOfflineData = await generateDescription(getOnlineCharacters(playersOnline, enemyCharacters));
      const friendOnlineOfflineData = await generateDescription(getOnlineCharacters(playersOnline, friendCharacters));

      const channelLists = await teamspeak.channelList();
      const channelListsName = channelLists.map(({ propcache }) => propcache.channel_name);

      await updateChannel(teamspeak, 'enemy', enemyOnlineOfflineData, channelListsName);
      await updateChannel(teamspeak, 'friend', friendOnlineOfflineData, channelListsName);

      await moveAfkClients(teamspeak);
      await processServerSaveStatus(teamspeak);
    } catch (error) {
      console.error('[CRON] Erro na fastTask:', error);
    } finally {
      isFastTaskRunning = false;
    }
  }, {
    scheduled: false,
  });

  const neutralTask = cron.schedule('*/30 * * * * *', async () => {
    if (isSlowTaskRunning) {
      console.log('[CRON] neutralTask ainda em execução. Pulando esta rodada.');
      return;
    }

    isSlowTaskRunning = true;

    try {
      const enemyCharacters = await Characters.find({ type: 'enemy' });
      const friendCharacters = await Characters.find({ type: 'friend' });

      const playersOnline = await tibiaAPI.getWorldOnline();
      const automaticNeutralData = getAutomaticNeutralCharacters(playersOnline, friendCharacters, enemyCharacters);

      const channelLists = await teamspeak.channelList();
      const channelListsName = channelLists.map(({ propcache }) => propcache.channel_name);

      const neutralSummaryData = {
        online: automaticNeutralData.online,
        dbCharacters: automaticNeutralData.dbCharacters,
        description: `[b][color=#00AAFF]Online ${automaticNeutralData.online.length}/${automaticNeutralData.dbCharacters.length}[/color][/b]\n\n[b]Neutral list is paginated below in groups of ${NEUTRAL_PAGE_SIZE}.[/b]\n`,
      };

      await updateChannel(teamspeak, 'neutral', neutralSummaryData, channelListsName);

      const neutralPages = paginateList(automaticNeutralData.online, NEUTRAL_PAGE_SIZE);
      const neutralParentChannel = await Channels.findOne({ type: 'neutral' });

      for (let i = 0; i < neutralPages.length; i += 1) {
        const page = neutralPages[i];
        const start = i * NEUTRAL_PAGE_SIZE + 1;
        const end = i * NEUTRAL_PAGE_SIZE + page.length;

        const pageData = {
          online: page,
          dbCharacters: page.map(({ name }) => ({ characterName: name, type: 'neutral-auto' })),
        };

        const { description } = await generateDescription(pageData);
        const rangeLabel = `${start}-${end}`;

        await upsertNeutralPageChannel(
          teamspeak,
          i,
          rangeLabel,
          description,
          neutralParentChannel
        );
      }

      await deleteUnusedNeutralPageChannels(
        teamspeak,
        neutralPages.map((_, index) => index)
      );

      await deleteOrphanNeutralPageChannelsFromTs(teamspeak);

      await syncRegistrationGroups(teamspeak);
      await updateMeta();
    } catch (error) {
      console.error('[CRON] Erro na neutralTask:', error);
    } finally {
      isSlowTaskRunning = false;
    }
  }, {
    scheduled: false,
  });

  fastTask.start();
  neutralTask.start();
  if (GUILD_AUTO_SYNC_NAME) {
  const interval = Number(GUILD_AUTO_SYNC_INTERVAL_MINUTES) || 30;

  const guildSyncTask = cron.schedule(`*/${interval} * * * *`, async () => {
    await runGuildAutoSync(teamspeak);
  }, {
    scheduled: false,
  });

  guildSyncTask.start();
}
};
