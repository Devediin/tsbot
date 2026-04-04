import cron from 'node-cron';
import moment from 'moment';
import { capitalize } from 'lodash';
import TibiaAPI from '../tibia';
import getCharacterDeathsFromTibiaSite from '../tibia/site';
import Characters from '../models/characters';
import Channels from '../models/channels';
import Meta, {
  updateMeta,
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
const NEUTRAL_PAGE_SIZE = 50;
const RECENT_OFFLINE_DEATH_WINDOW_SECONDS = 180;
const BETA_DEATH_LOOKBACK_MINUTES = 15;
const BETA_DEATH_CHECK_COOLDOWN_MS = 30000;
const BETA_DEATH_TARGETS_PER_ROUND = 2;

const tibiaAPI = new TibiaAPI({ worldName: WORLD_NAME });
let isFastTaskRunning = false;
let isSlowTaskRunning = false;
let isBetaDeathTaskRunning = false;
const announcedLevelUps = new Map();
let previousOnlineNames = new Set();
const recentlyOfflineMap = new Map();
const betaDeathCheckCooldown = new Map();
let betaDeathCursor = 0;
const betaSentCache = new Set();

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

const parseTibiaSiteTimeToUtc = (rawTime = '') => {
  if (!rawTime) return null;

  const cleaned = String(rawTime).replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^([A-Z][a-z]{2}) (\d{2}) (\d{4}), (\d{2}):(\d{2}):(\d{2}) (CEST|CET)$/i);

  if (!match) {
    return null;
  }

  const [, monthStrRaw, dayStr, yearStr, hourStr, minuteStr, secondStr, tzRaw] = match;
  const monthStr = monthStrRaw.slice(0, 1).toUpperCase() + monthStrRaw.slice(1).toLowerCase();
  const tz = tzRaw.toUpperCase();

  const months = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };

  const month = months[monthStr];
  if (month === undefined) return null;

  const utcOffsetHours = tz === 'CEST' ? 2 : 1;

  const utcMillis = Date.UTC(
    Number(yearStr),
    month,
    Number(dayStr),
    Number(hourStr) - utcOffsetHours,
    Number(minuteStr),
    Number(secondStr)
  );

  return new Date(utcMillis).toISOString();
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
  prefix = '',
}) => {
  const typeLabel = getTypeLabel(type);
  const typeColorTag = getTypeColorTag(type);
  const deathAge = formatDeathAgeShort(time);
  const prefixText = prefix ? `${prefix} ` : '';

  return `${prefixText}⏰ [${deathAge}] 💀 ${typeColorTag} [${typeLabel}] [B]${characterName}[/B] morreu no level ${level} para [B]${mainKiller}[/B]`;
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

const processBetaSiteDeaths = async (characters = [], teamspeak) => {
  const now = Date.now();

  for (const character of characters) {
    const { type, characterName } = character;
    const cooldownUntil = betaDeathCheckCooldown.get(characterName) || 0;

    if (cooldownUntil > now) {
      continue;
    }

    betaDeathCheckCooldown.set(characterName, now + BETA_DEATH_CHECK_COOLDOWN_MS);

    try {
      console.log(`[DEATH-BETA] Checando ${characterName}`);
      const siteDeaths = await getCharacterDeathsFromTibiaSite(characterName);
      if (!Array.isArray(siteDeaths) || siteDeaths.length === 0) {
        console.log(`[DEATH-BETA] ${characterName} sem deaths no site.`);
        continue;
      }

      const newestDeath = siteDeaths[0];
      if (!newestDeath?.time || !newestDeath?.level || !newestDeath?.killer) {
        console.log(`[DEATH-BETA] ${characterName} death inválida: ${JSON.stringify(newestDeath)}`);
        continue;
      }

      const parsedTime = parseTibiaSiteTimeToUtc(newestDeath.time);
      console.log(`[DEATH-BETA] ${characterName} rawTime=${newestDeath.time} parsedTime=${parsedTime} level=${newestDeath.level} killer=${newestDeath.killer}`);

      if (!parsedTime) {
        continue;
      }

      const deathMoment = moment(parsedTime);
      if (!deathMoment.isValid()) {
        continue;
      }

      const minutesAgo = moment().diff(deathMoment, 'minutes');
      console.log(`[DEATH-BETA] ${characterName} minutesAgo=${minutesAgo}`);

      if (minutesAgo < 0 || minutesAgo > BETA_DEATH_LOOKBACK_MINUTES) {
        console.log(`[DEATH-BETA] ${characterName} descartado por lookback.`);
        continue;
      }

      const cacheTime = `site::${parsedTime}::${newestDeath.level}::${newestDeath.killer}`;

      if (betaSentCache.has(cacheTime)) {
        console.log(`[DEATH-BETA] ${characterName} já enviado na memória.`);
        continue;
      }

      betaSentCache.add(cacheTime);

      const betaMessage = formatDeathMessage({
        type,
        characterName,
        level: newestDeath.level,
        mainKiller: newestDeath.killer,
        time: parsedTime,
        prefix: '[BETA]',
      });

      console.log(`[DEATH-BETA] Enviando poke: ${betaMessage}`);
      await sendMassPoke(teamspeak, betaMessage);
    } catch (error) {
      console.error(`[DEATH-BETA] Erro checando ${characterName} no tibia.com:`, error?.message || error);
    }
  }
};

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
    }
  } catch (error) {
    console.error('[SERVERSAVE] Erro processando status do server save:', error);
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

      const playersOnline = await tibiaAPI.getWorldOnline();
      const onlinePlayerNames = new Set(playersOnline.map(({ name }) => name));

      updateRecentlyOfflineMap(onlinePlayerNames);

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

  const betaDeathTask = cron.schedule('0-59/5 * * * * *', async () => {
    if (isBetaDeathTaskRunning) {
      console.log('[CRON] betaDeathTask ainda em execução. Pulando esta rodada.');
      return;
    }

    isBetaDeathTaskRunning = true;

    try {
      const enemyCharacters = await Characters.find({ type: 'enemy' });
      const friendCharacters = await Characters.find({ type: 'friend' });

      const playersOnline = await tibiaAPI.getWorldOnline();
      const onlinePlayerNames = new Set(playersOnline.map(({ name }) => name));

      const onlineEnemyCharacters = enemyCharacters
        .filter(({ characterName }) => onlinePlayerNames.has(characterName))
        .map(({ type, characterName }) => ({ type, characterName }));

      const onlineFriendCharacters = friendCharacters
        .filter(({ characterName }) => onlinePlayerNames.has(characterName))
        .map(({ type, characterName }) => ({ type, characterName }));

      const monitoredCharacters = [
        ...enemyCharacters.map(({ type, characterName }) => ({ type, characterName })),
        ...friendCharacters.map(({ type, characterName }) => ({ type, characterName })),
      ];

      const recentlyOfflineCharacters = getRecentlyOfflineCharacters(monitoredCharacters);

      const betaTargets = [
        ...recentlyOfflineCharacters,
        ...onlineFriendCharacters,
        ...onlineEnemyCharacters,
      ].filter(({ characterName }) => characterName);

      console.log(`[DEATH-BETA] Targets disponíveis: ${betaTargets.length}`);
      await processBetaSiteDeaths(betaTargets, teamspeak);
    } catch (error) {
      console.error('[CRON] Erro na betaDeathTask:', error);
    } finally {
      isBetaDeathTaskRunning = false;
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
  betaDeathTask.start();
  neutralTask.start();
};
