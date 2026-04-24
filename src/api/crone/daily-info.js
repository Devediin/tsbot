import moment from 'moment';
import momentTimezone from 'moment-timezone';
import TibiaAPI from '../tibia';
import Characters from '../models/characters.js';
// Importação do dicionário novo
import { WORLD_CHANGES_DICTIONARY } from '../data/worldChanges.js';

const { WORLD_NAME } = process.env;
const tibiaAPI = new TibiaAPI({ worldName: WORLD_NAME });

global.dailyInfoCacheTS = '';
global.dailyInfoCachePortal = {};
global.isYasirActive = false;
global.activeWorldChanges = []; // Nova variável global para MWCs

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
  const currentRotation = TIBIADROME_BASE_NUMBER + rotationOffset;
  const rotationStart = TIBIADROME_BASE_DATE.clone().add(rotationOffset * 15, 'days');
  const rotationEnd = rotationStart.clone().add(15, 'days');
  return {
    number: currentRotation,
    start: rotationStart.format('DD/MM/YYYY'),
    end: rotationEnd.format('DD/MM/YYYY'),
  };
};

/* =========================
   WORLD BOARD (YASIR + MWCs)
========================= */
export const parseWorldBoard = (text) => {
  if (!text || typeof text !== 'string') return;

  try {
    const lower = text.toLowerCase();
    
    // Detecta Yasir (Mantendo sua lógica original)
    if (lower.includes('oriental ships sighted') || lower.includes('oriental trader') || lower.includes('yasir')) {
      global.isYasirActive = true;
    } else {
      global.isYasirActive = false;
    }

    // Detecta todas as outras World Changes do Dicionário
    const detected = [];
    WORLD_CHANGES_DICTIONARY.forEach(mwc => {
      if (lower.includes(mwc.key.toLowerCase())) {
        detected.push(mwc);
      }
    });
    global.activeWorldChanges = detected;

    console.log('[WORLD BOARD] Yasir:', global.isYasirActive, '| MWCs detectadas:', detected.length);
  } catch (err) {
    console.error('[WORLD BOARD PARSE ERROR]', err);
  }
};

/* =========================
   UPDATE DAILY INFO
========================= */
export const updateDailyInfoChannel = async (teamspeak) => {
  try {
    const worldOverview = await tibiaAPI.getWorldOverview();
    const serverName = worldOverview?.name || WORLD_NAME;

    // Busca os nomes reais das criaturas boostadas
    const boostedCreature = await tibiaAPI.getBoostedCreature();
    const boostedBoss = await tibiaAPI.getBoostedBoss();

    const rashid = getRashidLocation();
    const dreamBoss = getDreamCourtsBoss();
    const tibiadrome = getTibiadromeInfo();

    // Montando a descrição para o TS (Mantendo seu visual original)
    let descriptionTS = `
[center][size=14][b]⚔️ NIIDE HELPER - DAILY INFO ⚔️[/b][/size][/center]
[hr]

[b]🌍 SERVIDOR[/b]
🟢 [b]${serverName}[/b]

[hr]

[b]🐉 BOOSTED DO DIA[/b]
Creature: [b]${boostedCreature}[/b]
Boss: [b]${boostedBoss}[/b]

[hr]

[b]🧳 RASHID HOJE[/b]
[img]https://www.tibiawiki.com.br/images/f/f5/Rashid.gif[/img]
📍 [b]${rashid}[/b]

[hr]

[b]🧞 YASIR (ORIENTAL TRADER)[/b]
[img]https://www.tibiawiki.com.br/images/4/4a/Yasir.gif[/img]
${global.isYasirActive ? '🟢 [b]DISPONÍVEL[/b] HOJE' : '🔴 [b]NÃO ATIVO HOJE[/b]'}
`;

    // ADICIONA BLOCO DE WORLD CHANGES SE HOUVER
    if (global.activeWorldChanges.length > 0) {
      descriptionTS += `\n[hr]\n[b]🌍 WORLD CHANGES ATIVAS[/b]\n`;
      global.activeWorldChanges.forEach(wc => {
        descriptionTS += `● [b]${wc.name}[/b] (${wc.loc})\n`;
      });
    }

    descriptionTS += `
[hr]
[b]👑 DREAM COURTS[/b]
Boss Atual: ⭐ [b]${dreamBoss}[/b]

[hr]
[b]🎭 TIBIADROME[/b]
🏆 Rotação [b]#${tibiadrome.number}[/b]
📅 ${tibiadrome.start} → ${tibiadrome.end}

[hr]
[center][size=10]Atualizado automaticamente pelo NiideHelper[/size][/center]
`;

    global.dailyInfoCacheTS = descriptionTS.trim();

    // Cache para o Portal
    global.dailyInfoCachePortal = {
      server: { name: serverName },
      boosted: { creature: boostedCreature, boss: boostedBoss },
      rashid: { city: rashid },
      yasir: { active: global.isYasirActive },
      worldChanges: global.activeWorldChanges,
      dreamCourts: { boss: dreamBoss },
      tibiadrome: tibiadrome,
      updatedAt: momentTimezone.tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm'),
    };

    const channelList = await teamspeak.channelList();
    const dailyChannel = channelList.find(c => c.propcache?.channel_name?.includes('Daily Info'));

    if (dailyChannel) {
      await dailyChannel.edit({ channel_description: descriptionTS.trim() });
    }

    console.log('[DAILY INFO] Canal e Portal atualizados.');

  } catch (error) {
    console.error('[DAILY INFO ERROR]', error);
  }
};
