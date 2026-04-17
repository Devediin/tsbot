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

const dreamCourtsRotation = [
  'Plagueroot',
  'Malofur Mangrinder',
  'Maxxenius',
  'Alptramun',
  'Izcandar',
];

const DREAM_COURTS_BASE_DATE = momentTimezone.tz(
  '2026-04-12',
  'America/Sao_Paulo'
);

const getDreamCourtsBoss = () => {
  const nowBRT = momentTimezone.tz('America/Sao_Paulo');
  const diffDays = nowBRT.diff(DREAM_COURTS_BASE_DATE, 'days');
  const index = ((diffDays % 5) + 5) % 5;
  return dreamCourtsRotation[index];
};

const TIBIADROME_BASE_NUMBER = 125;
const TIBIADROME_BASE_DATE = momentTimezone.tz(
  '2026-04-15T05:00:00',
  'America/Sao_Paulo'
);

const getTibiadromeInfo = () => {
  const nowBRT = momentTimezone.tz('America/Sao_Paulo');
  const diffDays = nowBRT.diff(TIBIADROME_BASE_DATE, 'days');
  const rotationOffset = Math.floor(diffDays / 15);
  const currentRotation = TIBIADROME_BASE_NUMBER + rotationOffset;
  const rotationStart = TIBIADROME_BASE_DATE
    .clone()
    .add(rotationOffset * 15, 'days');
  const rotationEnd = rotationStart.clone().add(15, 'days');

  return {
    number: currentRotation,
    start: rotationStart.format('DD/MM/YYYY'),
    end: rotationEnd.format('DD/MM/YYYY'),
  };
};

export const parseWorldBoard = (text) => {
  if (!text || typeof text !== 'string') return;

  try {
    const lower = text.toLowerCase();

    // ✅ Detecta Yasir corretamente
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
    const serverName = worldOverview?.name || WORLD_NAME;

    const rashid = getRashidLocation();
    const dreamBoss = getDreamCourtsBoss();
    const tibiadrome = getTibiadromeInfo();

const descriptionTS = `
[center][size=14][b]⚔️ NIIDE HELPER - DAILY INFO ⚔️[/b][/size][/center]
[hr]

[b]🌍 SERVIDOR[/b]
🟢 [b]${serverName}[/b]

[hr]

[b]🧳 RASHID HOJE[/b]
[img]https://www.tibiawiki.com.br/images/f/f5/Rashid.gif[/img]
📍 [b]${rashid}[/b]

[hr]

[b]🧞 YASIR (ORIENTAL TRADER)[/b]
[img]https://www.tibiawiki.com.br/images/4/4a/Yasir.gif[/img]
${global.isYasirActive ? '🟢 [b]DISPONÍVEL[/b] HOJE EM UMA DAS CIDADES' : '🔴 [b]NÃO ATIVO HOJE[/b]'}

[hr]

[b]👑 DREAM COURTS[/b]
Boss Atual:
⭐ [b]${dreamBoss}[/b]

[hr]

[b]🎭 TIBIADROME[/b]
🏆 Rotação [b]#${tibiadrome.number}[/b]
📅 ${tibiadrome.start} → ${tibiadrome.end}

[hr]
[center][size=10]Atualizado automaticamente pelo NiideHelper[/size][/center]
`;

    global.dailyInfoCacheTS = descriptionTS.trim();
global.dailyInfoCachePortal = {
  server: {
    name: serverName,
  },
  rashid: {
    city: rashid,
  },
  yasir: {
    active: global.isYasirActive,
    label: global.isYasirActive
      ? 'Disponível hoje'
      : 'Não ativo hoje',
  },
  dreamCourts: {
    boss: dreamBoss,
  },
  tibiadrome: {
    rotation: tibiadrome.number,
    start: tibiadrome.start,
    end: tibiadrome.end,
  },
  updatedAt: momentTimezone
    .tz('America/Sao_Paulo')
    .format('DD/MM/YYYY HH:mm'),
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

    console.log(
      '[DAILY INFO] Atualizado.',
      'Rashid:',
      rashid,
      'Dream Boss:',
      dreamBoss,
      'Yasir:',
      global.isYasirActive
    );
  } catch (error) {
    console.error('[DAILY INFO ERROR]', error);
  }
};
