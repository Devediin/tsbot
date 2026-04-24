import moment from 'moment';
import momentTimezone from 'moment-timezone';
import TibiaAPI from '../tibia';
import Characters from '../models/characters.js';
import { WORLD_CHANGES_DICTIONARY } from '../data/worldChanges.js';

const { WORLD_NAME } = process.env;
const tibiaAPI = new TibiaAPI({ worldName: WORLD_NAME });

global.dailyInfoCacheTS = '';
global.dailyInfoCachePortal = global.dailyInfoCachePortal || {};
global.isYasirActive = false;
global.activeWorldChanges = [];

const DREAM_COURTS_IMAGES = {
  'Izcandar': 'https://www.tibiawiki.com.br/images/0/0f/Izcandar_the_Banished.gif',
  'Plagueroot': 'https://www.tibiawiki.com.br/images/2/24/Plagueroot.gif',
  'Malofur Mangrinder': 'https://www.tibiawiki.com.br/images/3/3b/Malofur_Mangrinder.gif',
  'Maxxenius': 'https://www.tibiawiki.com.br/images/a/a2/Maxxenius.gif',
  'Alptramun': 'https://www.tibiawiki.com.br/images/c/c9/Alptramun.gif'
};

/* =========================
   FUNÇÕES BASE (MANTIDAS ORIGINAIS)
========================= */
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

const TIBIADROME_BASE_NUMBER = 125;
const TIBIADROME_BASE_DATE = momentTimezone.tz('2026-04-15T05:00:00', 'America/Sao_Paulo');

const getTibiadromeInfo = () => {
  const tibiaDate = getTibiaDate();
  const diffDays = tibiaDate.diff(TIBIADROME_BASE_DATE, 'days');
  const rotationOffset = Math.floor(diffDays / 15);
  return {
    number: TIBIADROME_BASE_NUMBER + rotationOffset,
    start: TIBIADROME_BASE_DATE.clone().add(rotationOffset * 15, 'days').format('DD/MM/YYYY'),
    end: TIBIADROME_BASE_DATE.clone().add((rotationOffset + 1) * 15, 'days').format('DD/MM/YYYY'),
  };
};

/* =========================
   WORLD BOARD (COMANDO)
========================= */
export const parseWorldBoard = (text) => {
  if (!text || typeof text !== 'string') return;
  try {
    const lower = text.toLowerCase();
    
    // Detecta Yasir
    global.isYasirActive = lower.includes('oriental ships sighted') || lower.includes('oriental trader') || lower.includes('yasir');
    
    // Detecta MWCs
    const detected = [];
    WORLD_CHANGES_DICTIONARY.forEach(mwc => {
      if (lower.includes(mwc.key.toLowerCase())) { detected.push(mwc); }
    });
    global.activeWorldChanges = detected;

    // ATUALIZAÇÃO IMEDIATA DO CACHE DO PORTAL
    if (global.dailyInfoCachePortal) {
      global.dailyInfoCachePortal.yasir = { 
        active: global.isYasirActive,
        label: global.isYasirActive ? 'Disponível hoje' : 'Não ativo hoje'
      };
      global.dailyInfoCachePortal.worldChanges = detected;
      global.dailyInfoCachePortal.updatedAt = momentTimezone.tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm');
    }

    console.log('[WORLD BOARD] Processado. Yasir:', global.isYasirActive, '| MWCs:', detected.length);
  } catch (err) { console.error('[WORLD BOARD ERROR]', err); }
};

/* =========================
   UPDATE DAILY INFO (TS + CACHE GERAL)
========================= */
export const updateDailyInfoChannel = async (teamspeak) => {
  try {
    const worldOverview = await tibiaAPI.getWorldOverview();
    const serverName = worldOverview?.name || WORLD_NAME;

    // Busca dados Boosted (Nome e Imagem)
    const bCreature = await tibiaAPI.getBoostedCreature();
    const bBoss = await tibiaAPI.getBoostedBoss();

    const rashid = getRashidLocation();
    const dreamBossName = getDreamCourtsBoss();
    const tibiadrome = getTibiadromeInfo();

    // --- MENSAGEM TS (Usa .name para evitar [object Object]) ---
    let descriptionTS = `
[center][size=14][b]⚔️ NIIDE HELPER - DAILY INFO ⚔️[/b][/size][/center]
[hr]
[b]🌍 SERVIDOR[/b]
🟢 [b]${serverName}[/b]
[hr]
[b]🐉 BOOSTED DO DIA[/b]
Creature: [b]${bCreature.name}[/b]
Boss: [b]${bBoss.name}[/b]
[hr]
[b]🧳 RASHID HOJE[/b]
[img]https://www.tibiawiki.com.br/images/f/f5/Rashid.gif[/img]
📍 [b]${rashid}[/b]
[hr]
[b]🧞 YASIR (ORIENTAL TRADER)[/b]
[img]https://www.tibiawiki.com.br/images/4/4a/Yasir.gif[/img]
${global.isYasirActive ? '🟢 [b]DISPONÍVEL[/b] HOJE' : '🔴 [b]NÃO ATIVO HOJE[/b]'}
`;

    if (global.activeWorldChanges.length > 0) {
      descriptionTS += `\n[hr]\n[b]🌍 WORLD CHANGES ATIVAS[/b]\n`;
      global.activeWorldChanges.forEach(wc => {
        descriptionTS += `● [b]${wc.name}[/b] (${wc.loc})\n`;
      });
    }

    descriptionTS += `\n[hr]\n[b]👑 DREAM COURTS[/b]\nBoss: ⭐ [b]${dreamBossName}[/b]\n[hr]\n[b]🎭 TIBIADROME[/b]\n🏆 Rotação [b]#${tibiadrome.number}[/b]\n📅 ${tibiadrome.start} → ${tibiadrome.end}\n[hr]\n[center][size=10]Atualizado automaticamente pelo NiideHelper[/size][/center]`;

    // --- ATUALIZA CACHE DO PORTAL ---
    global.dailyInfoCachePortal = {
      server: { name: serverName },
      boosted: { 
        creature: bCreature.name, 
        creatureImg: bCreature.image,
        boss: bBoss.name,
        bossImg: bBoss.image
      },
      rashid: { city: rashid },
      yasir: { 
        active: global.isYasirActive,
        label: global.isYasirActive ? 'Disponível hoje' : 'Não ativo hoje'
      },
      worldChanges: global.activeWorldChanges,
      dreamCourts: { 
        boss: dreamBossName,
        image: DREAM_COURTS_IMAGES[dreamBossName] || '' 
      },
      tibiadrome: tibiadrome,
      updatedAt: momentTimezone.tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm'),
    };

    const channelList = await teamspeak.channelList();
    const dailyChannel = channelList.find(c => c.propcache?.channel_name?.includes('Daily Info'));
    if (dailyChannel) {
      await dailyChannel.edit({ channel_description: descriptionTS.trim() });
    }
  } catch (error) { console.error('[DAILY INFO ERROR]', error); }
};
