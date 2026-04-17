import moment from 'moment';
import momentTimezone from 'moment-timezone';
import TibiaAPI from '../tibia';

const { WORLD_NAME } = process.env;

const tibiaAPI = new TibiaAPI({ worldName: WORLD_NAME });

global.dailyInfoCache = '';
global.lastServerSaveTime = null;

/* ===========================
   RASHID
=========================== */

const getRashidLocation = () => {
  const day = moment().format('dddd');

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

/* ===========================
   DREAM COURTS
=========================== */

const dreamCourtsRotation = [
  'Plagueroot',
  'Malofur Mangrinder',
  'Maxxenius',
  'Alptramun',
  'Izcandar',
];

const DREAM_COURTS_BASE_DATE = moment('2026-04-12');

const getDreamCourtsBoss = () => {
  const diffDays = moment().diff(DREAM_COURTS_BASE_DATE, 'days');
  const index = ((diffDays % 5) + 5) % 5;
  return dreamCourtsRotation[index];
};

/* ===========================
   TIBIADROME
=========================== */

const TIBIADROME_BASE_NUMBER = 125;
const TIBIADROME_BASE_DATE = moment('2026-04-15T05:00:00');

const getTibiadromeInfo = () => {
  const now = moment();
  const diffDays = now.diff(TIBIADROME_BASE_DATE, 'days');
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

/* ===========================
   UPDATE DAILY INFO
=========================== */

export const updateDailyInfoChannel = async (teamspeak) => {
  try {
    const worldOverview = await tibiaAPI.getWorldOverview();
    const serverName = worldOverview?.name || WORLD_NAME;

    const serverSaveTime = global.lastServerSaveTime
      ? global.lastServerSaveTime
      : momentTimezone().tz('America/Sao_Paulo').format('HH:mm');

    const rashid = getRashidLocation();
    const dreamBoss = getDreamCourtsBoss();
    const tibiadrome = getTibiadromeInfo();

    const description = `
[b]📅 Server Save[/b]
🟢 ${serverName} voltou às ${serverSaveTime}

[b]🧳 Rashid[/b]
[img]https://www.tibiawiki.com.br/images/f/f5/Rashid.gif[/img]
📍 ${rashid}

[b]🧞 Yasir (Oriental Trader)[/b]
[img]https://www.tibiawiki.com.br/images/4/4a/Yasir.gif[/img]
${global.isTwitchLive ? '🟢 ONLINE' : '🔴 OFFLINE'}

[b]👑 Dream Courts Boss[/b]
${dreamBoss}

[b]🎭 Tibiadrome[/b]
Rotação #${tibiadrome.number}
${tibiadrome.start} → ${tibiadrome.end}
`;

    global.dailyInfoCache = description;

    const channelList = await teamspeak.channelList();
    const dailyChannel = channelList.find(c =>
      c.propcache.channel_name === '[cspacer]Daily Info'
    );

    if (dailyChannel) {
      await dailyChannel.edit({
        channel_description: description.trim()
      });
    }

    console.log('[DAILY INFO] Atualizado.');

  } catch (error) {
    console.error('[DAILY INFO ERROR]', error);
  }
};
