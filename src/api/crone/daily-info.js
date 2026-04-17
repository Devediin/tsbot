import moment from 'moment';
import TibiaAPI from '../tibia';
import Channels from '../models/channels';
import { updateChannel } from '../../scripts/channels';
global.dailyInfoCache = '';

const { WORLD_NAME } = process.env;

const tibiaAPI = new TibiaAPI({ worldName: WORLD_NAME });

let yasirOnline = false;

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
   WORLD BOARD PARSER
=========================== */

export const parseWorldBoard = (text = '') => {
  const normalized = text.toLowerCase();

  if (normalized.includes('oriental ships sighted')) {
    yasirOnline = true;
  } else {
    yasirOnline = false;
  }
};

/* ===========================
   UPDATE CHANNEL
=========================== */

export const updateDailyInfoChannel = async (teamspeak) => {
  try {
    const worldOverview = await tibiaAPI.getWorldOverview();
    const serverName = worldOverview?.name || WORLD_NAME;
    const serverSaveTime = global.lastServerSaveTime || moment().format('HH:mm');

    const rashid = getRashidLocation();
    const dreamBoss = getDreamCourtsBoss();
    const tibiadrome = getTibiadromeInfo();

const description = `
[b]📅 Server Save[/b]
🟢 ${serverName} voltou às ${serverSaveTime}

[b]🧳 Rashid[/b]
📍 ${rashid}

[b]🧞 Yasir (Oriental Trader)[/b]
${yasirOnline ? '🟢 ONLINE' : '🔴 OFFLINE'}

[b]👑 Dream Courts Boss[/b]
${dreamBoss}

[b]🎭 Tibiadrome[/b]
Rotação #${tibiadrome.number}
${tibiadrome.start} → ${tibiadrome.end}
`;
    // ✅ salvar em memória para o dashboard
    global.dailyInfoCache = description;

    // atualizar no TS
    const channelList = await teamspeak.channelList();
    const dailyChannel = channelList.find(c =>
      c.propcache.channel_name === '[cspacer]Daily Info'
    );

    if (dailyChannel) {
      await dailyChannel.edit({
        channel_description: description
      });
    }

    console.log('[DAILY INFO] Canal atualizado com sucesso.');

  } catch (error) {
    console.error('[DAILY INFO] Erro ao atualizar canal:', error);
  }
};
