import moment from 'moment';
import momentTimezone from 'moment-timezone';
import TibiaAPI from '../tibia';

const { WORLD_NAME } = process.env;
const tibiaAPI = new TibiaAPI({ worldName: WORLD_NAME });

global.dailyInfoCacheTS = '';
global.dailyInfoCachePortal = {};
global.isYasirActive = false;

const getRashidLocation = () => {
  const nowBRT = momentTimezone.tz('America/Sao_Paulo');
  const day = nowBRT.format('dddd');
  const map = {
    Monday: 'Svargrond',
    Tuesday: 'Liberty Bay',
    Wednesday: 'Port Hope',
    Thursday: 'Ankrahmun',
    Friday: 'Darashia',
    Saturday: 'Edron',
    Sunday: 'Carlin',
  };
  return map[day] || 'Desconhecido';
};

const dreamCourtsRotation = ['Plagueroot', 'Malofur Mangrinder', 'Maxxenius', 'Alptramun', 'Izcandar'];
const DREAM_COURTS_BASE_DATE = momentTimezone.tz('2026-04-12', 'America/Sao_Paulo');

const getDreamCourtsBoss = () => {
  const nowBRT = momentTimezone.tz('America/Sao_Paulo');
  const diffDays = nowBRT.diff(DREAM_COURTS_BASE_DATE, 'days');
  const index = ((diffDays % 5) + 5) % 5;
  return dreamCourtsRotation[index];
};

const TIBIADROME_BASE_NUMBER = 125;
const TIBIADROME_BASE_DATE = momentTimezone.tz('2026-04-15T05:00:00', 'America/Sao_Paulo');

const getTibiadromeInfo = () => {
  const nowBRT = momentTimezone.tz('America/Sao_Paulo');
  const diffDays = nowBRT.diff(TIBIADROME_BASE_DATE, 'days');
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

/*
  ✅ Agora detecta Yasir automaticamente pelo World Overview
*/
const detectMiniWorldChange = (worldOverview) => {
  try {
    const miniWorld = worldOverview?.world_information?.world_quest_titles || [];

    const hasYasir = miniWorld.some(title =>
      title.toLowerCase().includes('oriental trader')
    );

    global.isYasirActive = hasYasir;

  } catch (err) {
    console.error('[MINI WORLD DETECTION ERROR]', err);
  }
};

export const parseWorldBoard = (text) => {
  if (!text || typeof text !== 'string') return;

  try {
    const lower = text.toLowerCase();

    // Detecta horário (Server Save manual)
    const timeMatch = text.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
    if (timeMatch) {
      global.lastServerSaveTime = timeMatch[0];
    }

    // ✅ DETECÇÃO CORRETA DO YASIR
    if (
      lower.includes('oriental ships sighted') ||
      lower.includes('oriental trader') ||
      lower.includes('yasir')
    ) {
      global.isYasirActive = true;
    } else {
      global.isYasirActive = false;
    }

    console.log('[WORLD BOARD] Yasir detectado:', global.isYasirActive);

  } catch (err) {
    console.error('[WORLD BOARD PARSE ERROR]', err);
  }
};

export const updateDailyInfoChannel = async (teamspeak) => {
  try {
    const worldOverview = await tibiaAPI.getWorldOverview();

    detectMiniWorldChange(worldOverview);

    const serverName = worldOverview?.name || WORLD_NAME;
    const serverSaveTime = global.lastServerSaveTime || '05:00';
    const rashid = getRashidLocation();
    const dreamBoss = getDreamCourtsBoss();
    const tibiadrome = getTibiadromeInfo();

    const descriptionTS = `
[b]📅 Server Save[/b]
🟢 ${serverName} voltou às ${serverSaveTime}

[b]🧳 Rashid[/b]
[img]https://www.tibiawiki.com.br/images/f/f5/Rashid.gif[/img]
📍 ${rashid}

[b]🧞 Yasir (Oriental Trader)[/b]
[img]https://www.tibiawiki.com.br/images/4/4a/Yasir.gif[/img]
${global.isYasirActive ? '🟢 DISPONÍVEL HOJE' : '🔴 NÃO ATIVO'}

[b]👑 Dream Courts Boss[/b]
${dreamBoss}

[b]🎭 Tibiadrome[/b]
Rotação #${tibiadrome.number}
${tibiadrome.start} → ${tibiadrome.end}
`;

    global.dailyInfoCacheTS = descriptionTS.trim();
    global.dailyInfoCachePortal = {
      server: serverName,
      serverSaveTime,
      rashid,
      yasirActive: global.isYasirActive,
      dreamBoss,
      tibiadrome,
    };

    const channelList = await teamspeak.channelList();

    const dailyChannel = channelList.find(c =>
      c.propcache?.channel_name?.includes('Daily Info')
    );

    if (!dailyChannel) {
      console.log('[DAILY INFO] Canal Daily Info não encontrado.');
      return;
    }

    await dailyChannel.edit({
      channel_description: descriptionTS.trim(),
    });

    console.log('[DAILY INFO] Atualizado. Rashid:', rashid, 'Dream Boss:', dreamBoss, 'Yasir:', global.isYasirActive);

  } catch (error) {
    console.error('[DAILY INFO ERROR]', error);
  }
};
