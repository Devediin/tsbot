import moment from 'moment';
import TibiaAPI from '../tibia';
import Channels from '../models/channels';
import { updateChannel } from '../../scripts/channels';

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
  if (text.includes('Oriental ships sighted')) {
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
    const serverSaveTime = moment().format('HH:mm');

    const rashid = getRashidLocation();
    const dreamBoss = getDreamCourtsBoss();
    const tibiadrome = getTibiadromeInfo();

    const description = `
[b][color=#00AAFF]Server Save[/color][/b]
🟢 ${serverName} voltou às ${serverSaveTime}

[b][color=#00AAFF]Rashid[/color][/b]
📍 ${rashid}

[b][color=#00AAFF]Yasir (Oriental Trader)[/color][/b]
${yasirOnline ? '🟢 ONLINE' : '🔴 OFFLINE'}

[b][color=#00AAFF]Dream Courts Boss[/color][/b]
👑 ${dreamBoss}

[b][color=#00AAFF]Tibiadrome[/color][/b]
🎭 Rotação #${tibiadrome.number}
📅 ${tibiadrome.start} até ${tibiadrome.end}
`;

    const channelList = await teamspeak.channelList();

    const dailyChannel = channelList.find(c =>
      c.propcache.channel_name === '[cspacer]Daily Info'
    );

    if (!dailyChannel) {
      console.log('[DAILY INFO] Canal não encontrado no TS.');
      return;
    }

    await dailyChannel.edit({
      channel_description: description.trim(),
    });

    console.log('[DAILY INFO] Canal atualizado com sucesso.');
  } catch (error) {
    console.error('[DAILY INFO] Erro ao atualizar canal:', error);
  }
};
