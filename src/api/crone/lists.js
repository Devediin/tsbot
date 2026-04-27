import cron from 'node-cron';
import moment from 'moment';
import { capitalize } from 'lodash';
import TibiaAPI from '../tibia';
import Characters from '../models/characters';
import Channels from '../models/channels';
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
import WarEvent from '../models/war-event';
import { syncGuildsTask } from './guild-sync.js';

export const lastDeathKillers = new Map();
const { WORLD_NAME } = process.env;
const NEUTRAL_PAGE_SIZE = 50;
const RECENT_OFFLINE_DEATH_WINDOW_SECONDS = 180;

const tibiaAPI = new TibiaAPI({ worldName: WORLD_NAME });
let isFastTaskRunning = false;
let isSlowTaskRunning = false;
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

const MAX_POKE_LENGTH = 95;

const formatDeathMessage = ({ type, characterName, level, killers = [], time }) => {
  const deathAge = formatDeathAgeShort(time);
  const safeName = characterName || 'Unknown';
  const filteredKillers = killers.filter(k => k && k.name && k.name.toLowerCase() !== safeName.toLowerCase());

  const pokeKillersBase = filteredKillers.slice(0, 2).map(k => k.name).join(', ');
  const extraCount = filteredKillers.length - 2;
  const pokeKillersText = extraCount > 0 ? `${pokeKillersBase} (+${extraCount})` : (pokeKillersBase || killers[0]?.name || 'unknown');
  const fullKillersText = filteredKillers.map(k => k.name).join(', ') || killers[0]?.name || 'unknown';

  const isEnemy = type === 'enemy';
  const color = isEnemy ? 'red' : 'green';
  const tag = isEnemy ? '[ENEMY]' : '[FRIEND]';
  const emoji = isEnemy ? '💀 🔴' : '🛡️ 🟢';

  const templates = [`caiu pra`, `foi de base pra`, `tomou bala de`, `virou tapete do` ];
  const selectedTemplate = templates[Math.floor(Math.random() * templates.length)];

  let shortMessage = `[b][${deathAge}] [color=${color}]${tag}[/color] ${safeName} ${level} ${selectedTemplate} ${pokeKillersText}[/b]`;
  if (shortMessage.length > MAX_POKE_LENGTH) {
    shortMessage = shortMessage.substring(0, MAX_POKE_LENGTH - 7) + '...[/b]';
  }

  const fullMessage = `${emoji} [b][color=${color}]${tag}[/color][/b] [B]${safeName}[/B] (${level}) ${selectedTemplate} [i]${fullKillersText}[/i]`;
  lastDeathKillers.set(safeName.toLowerCase(), killers.map(k => k.name));
  return { shortMessage, fullMessage };
};

const formatLevelMessage = ({ name, previousLevel, currentLevel, vocation, monitoredType }) => {
  const typeLabel = getTypeLabel(monitoredType);
  const emoji = getVocationEmoji(vocation);
  const levelsGained = Number(currentLevel) - Number(previousLevel);
  return `✨ 🆙 [${typeLabel}] ${emoji} [B]${name}[/B] upou de [B]${previousLevel}[/B] para [B]${currentLevel}[/B] (+${levelsGained})`;
};

const buildServerSaveMessage = ({ worldName, boostedCreature, boostedBoss }) => {
  const lines = [`🟢 [B]${worldName}[/B] voltou do server save.`];
  if (boostedCreature) lines.push(`🐉 Boosted Creature: [B]${boostedCreature}[/B]`);
  if (boostedBoss) lines.push(`👹 Boosted Boss: [B]${boostedBoss}[/B]`);
  return lines.join(' ');
};

const sortDescendingByLevel = (characters = []) => [...characters].sort((a, b) => Number(b.level) - Number(a.level));

const splitByProfessions = (onlineCharacters = []) => {
  const eks = sortDescendingByLevel(onlineCharacters.filter(({ vocation }) => vocation.includes('Elite Knight') || vocation === 'Knight'));
  const ems = sortDescendingByLevel(onlineCharacters.filter(({ vocation }) => vocation.includes('Exalted Monk') || vocation === 'Monk'));
  const rps = sortDescendingByLevel(onlineCharacters.filter(({ vocation }) => vocation.includes('Royal Paladin') || vocation === 'Paladin'));
  const eds = sortDescendingByLevel(onlineCharacters.filter(({ vocation }) => vocation.includes('Elder Druid') || vocation === 'Druid'));
  const mss = sortDescendingByLevel(onlineCharacters.filter(({ vocation }) => vocation.includes('Master Sorcerer') || vocation === 'Sorcerer'));
  const nons = sortDescendingByLevel(onlineCharacters.filter(({ vocation }) => vocation === 'None'));
  return { eks, ems, rps, eds, mss, nons };
};

const chunkArray = (array = [], size = 5) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
};

const getInformationFromCharacters = async (characterNames = []) => {
  try {
    const uniqueCharacters = [];
    const seen = new Set();
    for (const entry of characterNames) {
      if (!entry.characterName) continue;
      const key = `${entry.type}:${entry.characterName.toLowerCase()}`;
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
          return { ...information, monitoredType: type, monitoredCharacterName: characterName };
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
  const onlineDuration = tracker?.firstSeenOnline ? formatOnlineDuration(tracker.firstSeenOnline) : '0m';
  const monthlyDiff = monthlyTracker ? formatMonthlyLevelDiff(monthlyTracker.startLevel, level) : '+0';
  return `${getVocationLabel({ vocation })} - ${level} [${monthlyDiff}] - ${name} - ${onlineDuration}\n`;
};

const appendProfessionBlock = async (title, list = [], description = '') => {
  if (!list.length) return description;
  let nextDescription = `${description}\n[b]${title} (${list.length})[/b]\n`;
  for (const character of list) nextDescription += await buildCharacterDescription(character);
  return nextDescription;
};

const generateDescription = async (data = {}) => {
  const { online = [], dbCharacters = [] } = data;

  const isEnemyList =
    dbCharacters.length > 0 &&
    dbCharacters[0]?.type === 'enemy';

  let description = `[b][color=#00AAFF]Online ${online.length}/${dbCharacters.length}[/color][/b]\n`;

  if (isEnemyList) {
    const focusCharacter = await Characters.findOne({ type: 'enemy', isFocus: true });
    let focusOnline = [];
    let normalOnline = online;
    if (focusCharacter) {
      focusOnline = online.filter(p => p.name === focusCharacter.characterName);
      normalOnline = online.filter(p => p.name !== focusCharacter.characterName);
    }
    if (focusOnline.length > 0) {
      description += `\n[b]🎯 FOCO (${focusOnline.length})[/b]\n`;
      for (const character of focusOnline) {
        description += await buildCharacterDescription(character);
      }
    }
    const { eks, ems, rps, eds, mss, nons } = splitByProfessions(normalOnline);
    description = await appendProfessionBlock('🛡️ Elite Knights', eks, description);
    description = await appendProfessionBlock('🥋 Exalted Monks', ems, description);
    description = await appendProfessionBlock('🏹 Royal Paladins', rps, description);
    description = await appendProfessionBlock('🌿 Elder Druids', eds, description);
    description = await appendProfessionBlock('🔥 Master Sorcerers', mss, description);
    description = await appendProfessionBlock('❔ No Vocation', nons, description);
    return { online, description, dbCharacters };
  }

  const { eks, ems, rps, eds, mss, nons } = splitByProfessions(online);
  description = await appendProfessionBlock('🛡️ Elite Knights', eks, description);
  description = await appendProfessionBlock('🥋 Exalted Monks', ems, description);
  description = await appendProfessionBlock('🏹 Royal Paladins', rps, description);
  description = await appendProfessionBlock('🌿 Elder Druids', eds, description);
  description = await appendProfessionBlock('🔥 Master Sorcerers', mss, description);
  description = await appendProfessionBlock('❔ No Vocation', nons, description);
  return { online, description, dbCharacters };
};

const getOnlineCharacters = (onlineCharacters = [], dbCharacters = []) => {
  const online = [];
  const onlineMap = new Map(onlineCharacters.filter(p => p && p.name).map(p => [p.name.toLowerCase(), p]));
  dbCharacters.forEach((dbChar) => {
    if (dbChar && dbChar.characterName) {
      const match = onlineMap.get(dbChar.characterName.toLowerCase());
      if (match) online.push(match);
    }
  });
  return { online, dbCharacters };
};

const getAutomaticNeutralCharacters = (onlineCharacters = [], friendCharacters = [], enemyCharacters = []) => {
  const friendNames = new Set(friendCharacters.filter(c => c && c.characterName).map(({ characterName }) => characterName.toLowerCase()));
  const enemyNames = new Set(enemyCharacters.filter(c => c && c.characterName).map(({ characterName }) => characterName.toLowerCase()));
  const neutralOnline = onlineCharacters.filter(p => p && p.name && !friendNames.has(p.name.toLowerCase()) && !enemyNames.has(p.name.toLowerCase()));
  return { online: sortDescendingByLevel(neutralOnline), dbCharacters: neutralOnline.map(({ name }) => ({ characterName: name, type: 'neutral-auto' })) };
};

const paginateList = (items = [], pageSize = 50) => {
  const pages = [];
  for (let i = 0; i < items.length; i += pageSize) pages.push(items.slice(i, i + pageSize));
  return pages;
};

const syncOnlineTrackers = async (playersOnline = []) => {
  const onlineNames = new Set(playersOnline.map(({ name }) => name));
  for (const player of playersOnline) await upsertOnlineTracker({ name: player.name, isOnline: true });
  const trackedCharacters = await Characters.find({});
  for (const { characterName } of trackedCharacters) {
    if (!onlineNames.has(characterName)) await upsertOnlineTracker({ name: characterName, isOnline: false });
  }
};

const syncMonthlyLevelTrackers = async (playersOnline = []) => {
  for (const player of playersOnline) await ensureMonthlyLevelTracker({ name: player.name, level: player.level });
};

const updateRecentlyOfflineMap = (onlinePlayerNames = new Set()) => {
  const now = Date.now();
  for (const previousName of previousOnlineNames) {
    if (!onlinePlayerNames.has(previousName)) recentlyOfflineMap.set(previousName, now);
  }
  for (const currentName of onlinePlayerNames) {
    if (recentlyOfflineMap.has(currentName)) recentlyOfflineMap.delete(currentName);
  }
  for (const [name, timestamp] of recentlyOfflineMap.entries()) {
    if ((now - timestamp) / 1000 > RECENT_OFFLINE_DEATH_WINDOW_SECONDS) recentlyOfflineMap.delete(name);
  }
  previousOnlineNames = new Set(onlinePlayerNames);
};

const getRecentlyOfflineCharacters = (characters = []) => {
  const recentlyOffline = [];
  for (const character of characters) {
    const { type, characterName } = character;
    if (recentlyOfflineMap.has(characterName)) recentlyOffline.push({ type, characterName });
  }
  return recentlyOffline;
};

const processLevelUps = async (playersOnline = [], friendCharacters = [], teamspeak) => {
  const friendNames = new Set(friendCharacters.filter(c => c && c.characterName).map(({ characterName }) => characterName.toLowerCase()));
  for (const player of playersOnline) {
    if (!player.name || !friendNames.has(player.name.toLowerCase())) continue;
    const name = player.name;
    const currentLevel = Number(player.level);
    const tracker = await ensureLevelTracker({ name, level: currentLevel });
    const previousLevel = Number(tracker?.lastLevel);
    if (previousLevel && currentLevel > previousLevel && announcedLevelUps.get(name) !== currentLevel) {
      const message = formatLevelMessage({ name, previousLevel, currentLevel, vocation: player.vocation, monitoredType: 'friend' });
      await sendMassPrivateMessage(teamspeak, message);
      announcedLevelUps.set(name, currentLevel);
    }
    await setLevelTrackerLevel({ name, level: currentLevel });
  }
};

const getDeathCacheKey = ({ characterName, time }) => `${characterName}::${time}`;

const getNotPokedKills = async (kills = []) => {
  try {
    const deathsCache = await getDeathsCache();
    const cachedKeys = new Set(deathsCache.map(({ characterName, time }) => getDeathCacheKey({ characterName, time })));
    const killsToPoke = [];
    for (const death of kills) {
      const { type, level, killers = [], time, characterName } = death;
      if (type !== 'friend' && type !== 'enemy') continue;
      const cacheKey = getDeathCacheKey({ characterName, time });
      if (cachedKeys.has(cacheKey)) continue;
      try {
        await WarEvent.create({ characterName, type, level, killers: killers.map(k => ({ name: k.name, isPlayer: k.player ?? true })), time: new Date(time) });
      } catch (err) { console.error('[WAR] Erro salvando WarEvent:', err.message); }
      killsToPoke.push(formatDeathMessage({ type, characterName, level, killers, time }));
      await addDeathsCache({ characterName, time });
    }
    return killsToPoke;
  } catch (error) { throw error; }
};

const deleteOrphanNeutralPageChannelsFromTs = async (teamspeak) => {
  try {
    const tsChannels = await teamspeak.channelList();
    const dbNeutralPages = await Channels.find({ type: { $regex: /^neutral-page-/ } });
    const validDbCids = new Set(dbNeutralPages.map(({ cid }) => Number(cid)));
    const orphanNeutralPageChannels = tsChannels.filter(({ propcache = {} }) => {
      const channelName = String(propcache.channel_name || '');
      const cid = Number(propcache.cid || 0);
      const isNeutralPageName = channelName.startsWith('[cspacer]Neutrals Page ') || channelName.startsWith('Neutrals Page ');
      if (!isNeutralPageName) return false;
      return !validDbCids.has(cid);
    });
    for (const orphanChannel of orphanNeutralPageChannels) { try { await orphanChannel.del(true); } catch (error) {} }
  } catch (error) { console.error('Erro limpando canais órfãos de neutral page:', error); }
};

const processServerSaveStatus = async (teamspeak) => {
  try {
    const worldOverview = await tibiaAPI.getWorldOverview();
    const serverSaveStatus = await getServerSaveStatus();
    const onlineCount = Number(worldOverview.onlineCount || 0);
    if (onlineCount <= 0) {
      if (!serverSaveStatus?.isOffline) await setServerSaveOffline();
      return;
    }
    if (serverSaveStatus?.isOffline) {
      const message = buildServerSaveMessage({ worldName: WORLD_NAME, boostedCreature: worldOverview.boostedCreature, boostedBoss: worldOverview.boostedBoss });
      await sendMassPrivateMessage(teamspeak, message);
      await setServerSaveOnline();
      await setServerSaveAnnounced();
      const { updateDailyInfoChannel } = await import('./daily-info');
      await updateDailyInfoChannel(teamspeak);
    }
  } catch (error) { console.error('[SERVERSAVE] Erro status:', error); }
};

export const startTasks = (teamspeak) => {
  const fastTask = cron.schedule('0-59/5 * * * * *', async () => {
    if (isFastTaskRunning) return;
    isFastTaskRunning = true;
    try {
      const enemyCharacters = await Characters.find({ type: 'enemy' });
      const friendCharacters = await Characters.find({ type: 'friend' });
      const monitoredCharacters = [
        ...enemyCharacters.map(({ type, characterName }) => ({ type, characterName })),
        ...friendCharacters.map(({ type, characterName }) => ({ type, characterName })),
      ];

      const playersOnline = await tibiaAPI.getWorldOnline();
      const onlinePlayerNamesLower = new Set(playersOnline.filter(p => p && p.name).map(({ name }) => name.toLowerCase()));

      console.log(`[WORLD] Online no mundo: ${playersOnline.length}`);

      if (!global.focusOnlineState) { global.focusOnlineState = false; }
      const focusCharacter = await Characters.findOne({ isFocus: true });
      if (focusCharacter && focusCharacter.characterName) {
        const focusName = focusCharacter.characterName.toLowerCase();
        const isOnline = onlinePlayerNamesLower.has(focusName);
        if (isOnline && !global.focusOnlineState) {
          global.focusOnlineState = true;
          await sendMassPoke(teamspeak, `🎯 [b]FOCO ONLINE:[/b] ${focusCharacter.characterName}`);
        } else if (!isOnline) { global.focusOnlineState = false; }
      }

      updateRecentlyOfflineMap(new Set(playersOnline.filter(p => p && p.name).map(({ name }) => name)));

      const onlineEnemyCharacters = enemyCharacters.filter(c => c && c.characterName && onlinePlayerNamesLower.has(c.characterName.toLowerCase())).map(({ type, characterName }) => ({ type, characterName }));
      const onlineFriendCharacters = friendCharacters.filter(c => c && c.characterName && onlinePlayerNamesLower.has(c.characterName.toLowerCase())).map(({ type, characterName }) => ({ type, characterName }));

      console.log(`[DEATH] Amigos: ${onlineFriendCharacters.length} | Inimigos: ${onlineEnemyCharacters.length}`);

      const recentlyOfflineCharacters = getRecentlyOfflineCharacters(monitoredCharacters);
      const deathPriorityCharacters = [...onlineEnemyCharacters, ...onlineFriendCharacters, ...recentlyOfflineCharacters].filter(({ characterName }) => characterName);

      const allCharactersInformation = await getInformationFromCharacters(deathPriorityCharacters);
      const deathListByCharacters = [];
      allCharactersInformation.forEach((data) => { if (data && data.kills) deathListByCharacters.push(...data.kills); });

      const killsToPoke = await getNotPokedKills(deathListByCharacters);
      if (killsToPoke.length > 0) {
        for (const deathData of killsToPoke) {
          await sendMassPoke(teamspeak, deathData.shortMessage);
          await sendMassPrivateMessage(teamspeak, deathData.fullMessage);
        }
      }

      if (focusCharacter && focusCharacter.characterName) {
        const focusName = focusCharacter.characterName.toLowerCase();
        const matchedDeath = deathListByCharacters.find(d => d.type === 'friend' && d.killers?.some(k => k.name?.toLowerCase() === focusName));
        if (matchedDeath) await sendMassPoke(teamspeak, `🚨 [b]FOCO MATOU:[/b] ${focusCharacter.characterName} eliminou ${matchedDeath.characterName}`);
      }

      await processLevelUps(playersOnline, friendCharacters, teamspeak);
      await syncOnlineTrackers(playersOnline);
      await syncMonthlyLevelTrackers(playersOnline);

      const enemyOnlineOfflineData = await generateDescription(getOnlineCharacters(playersOnline, enemyCharacters));
      const friendOnlineOfflineData = await generateDescription(getOnlineCharacters(playersOnline, friendCharacters));

      const channelLists = (await teamspeak.channelList()).map(({ propcache }) => propcache.channel_name);
      await updateChannel(teamspeak, 'enemy', enemyOnlineOfflineData, channelLists);
      await updateChannel(teamspeak, 'friend', friendOnlineOfflineData, channelLists);

      await moveAfkClients(teamspeak);
      await processServerSaveStatus(teamspeak);
    } catch (error) { console.error('[CRON] Erro na fastTask:', error); } finally { isFastTaskRunning = false; }
  }, { scheduled: false });

  const neutralTask = cron.schedule('*/30 * * * * *', async () => {
    if (isSlowTaskRunning) return;
    isSlowTaskRunning = true;
    try {
      const enemyCharacters = await Characters.find({ type: 'enemy' });
      const friendCharacters = await Characters.find({ type: 'friend' });
      const playersOnline = await tibiaAPI.getWorldOnline();
      const automaticNeutralData = getAutomaticNeutralCharacters(playersOnline, friendCharacters, enemyCharacters);
      const channelLists = (await teamspeak.channelList()).map(({ propcache }) => propcache.channel_name);
      const neutralSummaryData = { online: automaticNeutralData.online, dbCharacters: automaticNeutralData.dbCharacters, description: `[b][color=#00AAFF]Online ${automaticNeutralData.online.length}/${automaticNeutralData.dbCharacters.length}[/color][/b]\n\n[b]Neutral list is paginated below in groups of ${NEUTRAL_PAGE_SIZE}.[/b]\n` };
      await updateChannel(teamspeak, 'neutral', neutralSummaryData, channelLists);
      const neutralPages = paginateList(automaticNeutralData.online, NEUTRAL_PAGE_SIZE);
      const neutralParentChannel = await Channels.findOne({ type: 'neutral' });
      for (let i = 0; i < neutralPages.length; i += 1) {
        const page = neutralPages[i];
        const pageData = { online: page, dbCharacters: page.map(p => ({ characterName: p.name, type: 'neutral-auto' })) };
        const { description } = await generateDescription(pageData);
        await upsertNeutralPageChannel(teamspeak, i, `${(i * NEUTRAL_PAGE_SIZE) + 1}-${(i * NEUTRAL_PAGE_SIZE) + page.length}`, description, neutralParentChannel);
      }
      await deleteUnusedNeutralPageChannels(teamspeak, neutralPages.map((_, index) => index));
      await deleteOrphanNeutralPageChannelsFromTs(teamspeak);
      await syncRegistrationGroups(teamspeak);
      await updateMeta();
    } catch (error) { console.error('[CRON] Erro na neutralTask:', error); } finally { isSlowTaskRunning = false; }
  }, { scheduled: false });

  fastTask.start();
  neutralTask.start();

  cron.schedule('0 * * * *', async () => {
    const friendGuilds = await Characters.distinct('guildName', { type: 'friend' });
    const enemyGuilds = await Characters.distinct('guildName', { type: 'enemy' });
    for (const g of friendGuilds) { if (g) await syncGuildsTask(teamspeak, g, 'friend'); }
    for (const g of enemyGuilds) { if (g) await syncGuildsTask(teamspeak, g, 'enemy'); }
  });
};
