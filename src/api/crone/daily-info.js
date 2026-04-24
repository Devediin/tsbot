import moment from 'moment';
import momentTimezone from 'moment-timezone';
import crypto from 'crypto';
import TibiaAPI from '../tibia';
import { WORLD_CHANGES_DICTIONARY } from '../data/worldChanges.js';

const { WORLD_NAME } = process.env;
const tibiaAPI = new TibiaAPI({ worldName: WORLD_NAME });

global.dailyInfoCacheTS = '';
global.dailyInfoCachePortal = global.dailyInfoCachePortal || {};
global.isYasirActive = false;
global.activeWorldChanges = [];

/* =========================
   GERADOR DE LINKS TIBIAWIKI (AUTOMÁTICO)
========================= */
const getWikiGif = (name) => {
  if (!name || name === 'Desconhecido') return '';
  
  // Formatação: Primeira letra Maiúscula, espaços viram "_" e termina em .gif
  const formattedName = name.charAt(0).toUpperCase() + name.slice(1).replace(/ /g, '_') + '.gif';
  
  // O TibiaWiki (MediaWiki) organiza arquivos pelo Hash MD5 do nome do arquivo
  const hash = crypto.createHash('md5').update(formattedName).digest('hex');
  
  // Estrutura do link: /images/ primeira_letra / duas_primeiras_letras / Nome_do_Arquivo.gif
  return `https://www.tibiawiki.com.br/images/${hash[0]}/${hash.substring(0, 2)}/${formattedName}`;
};

/* =========================
   FUNÇÕES BASE (MANTIDAS)
========================= */
const getTibiaDate = () => {
  const nowBRT = momentTimezone.tz('America/Sao_Paulo');
  if (nowBRT.hour() < 5) { nowBRT.subtract(1, 'day'); }
  return nowBRT;
};

const getRashidLocation = () => {
  const tibiaDate = getTibiaDate();
  const map = {
    Monday: 'Svargrond', Tuesday: 'Liberty Bay', Wednesday: 'Port Hope',
    Thursday: 'Ankrahmun', Friday: 'Darashia', Saturday: 'Edron', Sunday: 'Carlin',
  };
  return map[tibiaDate.format('dddd')] || 'Desconhecido';
};

// ATUALIZADO: Nomes completos para bater com os arquivos do TibiaWiki
const dreamCourtsRotation = [
  'Izcandar the Banished',
  'Plagueroot',
  'Malofur Mangrinder',
  'Maxxenius',
  'Alptramun',
];

const DREAM_COURTS_BASE_DATE = momentTimezone.tz('2026-04-16T05:00:00', 'America/Sao_Paulo');

const getDreamCourtsBoss = () => {
  const tibiaDate = getTibiaDate().clone().startOf('day');
  const baseDate = DREAM_COURTS_BASE_DATE.clone().startOf('day');
  const diffDays = tibiaDate.diff(baseDate, 'days');
  const index = ((diffDays % 5) + 5) % 5;
  return dreamCourtsRotation[index];
};

const getTibiadromeInfo = () => {
  const tibiaDate = getTibiaDate();
  const TIBIADROME_BASE_DATE = momentTimezone.tz('2026-04-15T05:00:00', 'America/Sao_Paulo');
  const diffDays = tibiaDate.diff(TIBIADROME_BASE_DATE, 'days');
  const rotationOffset = Math.floor(diffDays / 15);
  return {
    number: 125 + rotationOffset,
    start: TIBIADROME_BASE_DATE.clone().add(rotationOffset * 15, 'days').format('DD/MM/YYYY'),
    end: TIBIADROME_BASE_DATE.clone().add((rotationOffset + 1) * 15, 'days').format('DD/MM/YYYY'),
  };
};

export const parseWorldBoard = (text) => {
  if (!text || typeof text !== 'string') return;
  try {
    const lower = text.toLowerCase();
    global.isYasirActive = lower.includes('oriental ships sighted') || lower.includes('oriental trader') || lower.includes('yasir');
    const detected = [];
    WORLD_CHANGES_DICTIONARY.forEach(mwc => {
      if (lower.includes(mwc.key.toLowerCase())) { detected.push(mwc); }
    });
    global.activeWorldChanges = detected;

    // Atualiza o cache do portal imediatamente
    if (global.dailyInfoCachePortal) {
      global.dailyInfoCachePortal.yasir = { active: global.isYasirActive };
      global.dailyInfoCachePortal.worldChanges = detected;
      global.dailyInfoCachePortal.updatedAt = momentTimezone.tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm');
    }
  } catch (err) { console.error('[WORLD BOARD ERROR]', err); }
};

export const updateDailyInfoChannel = async (teamspeak) => {
  try {
    const worldOverview = await tibiaAPI.getWorldOverview();
    const bCreature = await tibiaAPI.getBoostedCreature();
    const bBoss = await tibiaAPI.getBoostedBoss();
    const rashid = getRashidLocation();
    const dreamBossName = getDreamCourtsBoss();
    const tibiadrome = getTibiadromeInfo();

    // Cache unificado (Tudo agora usa getWikiGif)
    global.dailyInfoCachePortal = {
      server: { name: worldOverview?.name || WORLD_NAME },
      boosted: { 
        creature: bCreature.name, 
        creatureImg: getWikiGif(bCreature.name),
        creatureFallback: bCreature.image,
        boss: bBoss.name,
        bossImg: getWikiGif(bBoss.name),
        bossFallback: bBoss.image
      },
      rashid: { city: rashid },
      yasir: { active: global.isYasirActive },
      worldChanges: global.activeWorldChanges,
      dreamCourts: { 
        boss: dreamBossName,
        image: getWikiGif(dreamBossName) // AUTOMÁTICO
      },
      tibiadrome: tibiadrome,
      updatedAt: momentTimezone.tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm'),
    };

    let desc = `[center][b]⚔️ NIIDE HELPER - DAILY INFO ⚔️[/b][/center]\n[hr]\n`;
    desc += `[b]🐉 BOOSTED:[/b] ${bCreature.name} | [b]👹 BOSS:[/b] ${bBoss.name}\n[hr]\n`;
    desc += `📍 [b]RASHID:[/b] ${rashid}\n🧞 [b]YASIR:[/b] ${global.isYasirActive ? '🟢 SIM' : '🔴 NÃO'}\n[hr]\n`;
    desc += `⭐ [b]DREAM BOSS:[/b] ${dreamBossName}\n🏆 [b]DROME:[/b] #${tibiadrome.number}\n`;
    if (global.activeWorldChanges.length > 0) {
      desc += `[hr][b]🌍 WORLD CHANGES:[/b]\n`;
      global.activeWorldChanges.forEach(wc => desc += `● ${wc.name}\n`);
    }

    const channelList = await teamspeak.channelList();
    const dailyChannel = channelList.find(c => c.propcache?.channel_name?.includes('Daily Info'));
    if (dailyChannel) await dailyChannel.edit({ channel_description: desc });

    console.log('[DAILY INFO] Atualizado.', 'Rashid:', rashid, 'Dream Boss:', dreamBossName);

  } catch (error) { console.error('[DAILY INFO ERROR]', error); }
};
