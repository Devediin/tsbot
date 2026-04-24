import moment from 'moment';
import momentTimezone from 'moment-timezone';
import crypto from 'crypto'; // Necessário para gerar o link do Wiki
import TibiaAPI from '../tibia';
import { WORLD_CHANGES_DICTIONARY } from '../data/worldChanges.js';

const { WORLD_NAME } = process.env;
const tibiaAPI = new TibiaAPI({ worldName: WORLD_NAME });

global.dailyInfoCacheTS = '';
global.dailyInfoCachePortal = global.dailyInfoCachePortal || {};
global.isYasirActive = false;
global.activeWorldChanges = [];

// Função que gera o link do GIF animado do TibiaWiki automaticamente
const getWikiGif = (name) => {
  if (!name || name === 'Desconhecido') return '';
  // Formata o nome: Primeira letra maiúscula e espaços viram "_"
  const formattedName = name.charAt(0).toUpperCase() + name.slice(1).replace(/ /g, '_') + '.gif';
  // Gera o Hash MD5 do nome do arquivo
  const hash = crypto.createHash('md5').update(formattedName).digest('hex');
  // O Wiki usa a primeira letra do hash e as duas primeiras como subpastas
  return `https://www.tibiawiki.com.br/images/${hash[0]}/${hash.substring(0, 2)}/${formattedName}`;
};

const DREAM_COURTS_IMAGES = {
  'Izcandar': 'https://www.tibiawiki.com.br/images/0/0f/Izcandar_the_Banished.gif',
  'Plagueroot': 'https://www.tibiawiki.com.br/images/2/24/Plagueroot.gif',
  'Malofur Mangrinder': 'https://www.tibiawiki.com.br/images/3/3b/Malofur_Mangrinder.gif',
  'Maxxenius': 'https://www.tibiawiki.com.br/images/a/a2/Maxxenius.gif',
  'Alptramun': 'https://www.tibiawiki.com.br/images/c/c9/Alptramun.gif'
};

const getTibiaDate = () => {
  const nowBRT = momentTimezone.tz('America/Sao_Paulo');
  if (nowBRT.hour() < 5) { nowBRT.subtract(1, 'day'); }
  return nowBRT;
};

const getRashidLocation = () => {
  const tibiaDate = getTibiaDate();
  const day = tibiaDate.format('dddd');
  const map = {
    Monday: 'Svargrond', Tuesday: 'Liberty Bay', Wednesday: 'Port Hope',
    Thursday: 'Ankrahmun', Friday: 'Darashia', Saturday: 'Edron', Sunday: 'Carlin',
  };
  return map[day] || 'Desconhecido';
};

const dreamCourtsRotation = ['Izcandar', 'Plagueroot', 'Malofur Mangrinder', 'Maxxenius', 'Alptramun'];
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

    // Cache para o Portal com links automáticos do Wiki
    global.dailyInfoCachePortal = {
      server: { name: worldOverview?.name || WORLD_NAME },
      boosted: { 
        creature: bCreature.name, 
        creatureImg: getWikiGif(bCreature.name), // Link Wiki
        creatureFallback: bCreature.image,      // Link TibiaData (Backup)
        boss: bBoss.name,
        bossImg: getWikiGif(bBoss.name),         // Link Wiki
        bossFallback: bBoss.image                // Link TibiaData (Backup)
      },
      rashid: { city: rashid },
      yasir: { active: global.isYasirActive },
      worldChanges: global.activeWorldChanges,
      dreamCourts: { 
        boss: dreamBossName,
        image: DREAM_COURTS_IMAGES[dreamBossName] || '' 
      },
      tibiadrome: tibiadrome,
      updatedAt: momentTimezone.tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm'),
    };

    // Atualização TS (Apenas nomes)
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
  } catch (error) { console.error('[DAILY INFO ERROR]', error); }
};
