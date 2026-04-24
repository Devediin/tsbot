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
  const formattedName = name.charAt(0).toUpperCase() + name.slice(1).replace(/ /g, '_') + '.gif';
  const hash = crypto.createHash('md5').update(formattedName).digest('hex');
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

    // Links de Imagem
    const creatureGif = getWikiGif(bCreature.name);
    const bossGif = getWikiGif(bBoss.name);
    const dreamGif = getWikiGif(dreamBossName);

    // Cache para o Portal
    global.dailyInfoCachePortal = {
      server: { name: worldOverview?.name || WORLD_NAME },
      boosted: { 
        creature: bCreature.name, 
        creatureImg: creatureGif,
        creatureFallback: bCreature.image,
        boss: bBoss.name,
        bossImg: bossGif,
        bossFallback: bBoss.image
      },
      rashid: { city: rashid },
      yasir: { active: global.isYasirActive },
      worldChanges: global.activeWorldChanges,
      dreamCourts: { 
        boss: dreamBossName,
        image: dreamGif
      },
      tibiadrome: tibiadrome,
      updatedAt: momentTimezone.tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm'),
    };

    // --- MENSAGEM TS (COM BBCODE [IMG]) ---
    let desc = `[center][size=14][b]⚔️ NIIDE HELPER - DAILY INFO ⚔️[/b][/size][/center]\n[hr]\n`;
    
    desc += `[b]🌍 SERVIDOR:[/b] 🟢 [b]${worldOverview?.name || WORLD_NAME}[/b]\n[hr]\n`;
    
    desc += `[b]🐉 BOOSTED DO DIA[/b]\n`;
    desc += `[img]${creatureGif}[/img] [b]${bCreature.name}[/b]\n`;
    desc += `[img]${bossGif}[/img] [b]${bBoss.name}[/b]\n[hr]\n`;

    desc += `[b]🧳 RASHID HOJE[/b]\n`;
    desc += `[img]https://www.tibiawiki.com.br/images/f/f5/Rashid.gif[/img] 📍 [b]${rashid}[/b]\n[hr]\n`;

    desc += `[b]🧞 YASIR (ORIENTAL TRADER)[/b]\n`;
    desc += `[img]https://www.tibiawiki.com.br/images/4/4a/Yasir.gif[/img] ${global.isYasirActive ? '🟢 DISPONÍVEL' : '🔴 NÃO ATIVO'}\n[hr]\n`;

    desc += `[b]👑 DREAM COURTS[/b]\n`;
    desc += `[img]${dreamGif}[/img] ⭐ [b]${dreamBossName}[/b]\n[hr]\n`;

    desc += `[b]🎭 TIBIADROME[/b]\n🏆 Rotação [b]#${tibiadrome.number}[/b]\n📅 ${tibiadrome.start} → ${tibiadrome.end}\n`;

    if (global.activeWorldChanges.length > 0) {
      desc += `[hr][b]🌍 WORLD CHANGES ATIVAS[/b]\n`;
      global.activeWorldChanges.forEach(wc => {
        desc += `● [b]${wc.name}[/b] (${wc.loc})\n`;
      });
    }

    desc += `\n[hr]\n[center][size=10]Atualizado automaticamente pelo NiideHelper[/size][/center]`;

    const channelList = await teamspeak.channelList();
    const dailyChannel = channelList.find(c => c.propcache?.channel_name?.includes('Daily Info'));
    if (dailyChannel) await dailyChannel.edit({ channel_description: desc.trim() });

    console.log('[DAILY INFO] Atualizado.', 'Rashid:', rashid, 'Dream Boss:', dreamBossName);

  } catch (error) { console.error('[DAILY INFO ERROR]', error); }
};
