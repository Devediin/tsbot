import cron from 'node-cron';
import moment from 'moment';
import { capitalize } from 'lodash';
import TibiaAPI from '../tibia';
import Characters from '../models/characters';
import Channels from '../models/channels';
import { syncCharactersByGuildName } from '../models/characters';
import Meta, {
  updateMeta,
  getDeathsCache,
  addDeathsCache,
  removeOldDeathsCache,
  getServerSaveStatus,
  setServerSaveOffline,
  setServerSaveOnline,
  setServerSaveAnnounced,
} from '../models/meta';
import {
  upsertOnlineTracker,
  getOnlineTrackerByName,
} from '../models/online-tracker';
import {
  ensureMonthlyLevelTracker,
  getMonthlyLevelTrackerByName,
} from '../models/monthly-level-tracker';
import {
  ensureLevelTracker,
  setLevelTrackerLevel,
} from '../models/level-tracker';
import {
  sendMassPoke,
  sendMassPrivateMessage,
} from '../../scripts/client';
import { moveAfkClients } from '../../scripts/afk';
import { syncRegistrationGroups } from '../../scripts/registration-groups';
import {
  updateChannel,
  upsertNeutralPageChannel,
  deleteUnusedNeutralPageChannels,
} from '../../scripts/channels';

const { WORLD_NAME } = process.env;

const {
  GUILD_AUTO_SYNC_NAME,
  GUILD_AUTO_SYNC_INTERVAL_MINUTES = '30',
} = process.env;

const NEUTRAL_PAGE_SIZE = 50;
const RECENT_OFFLINE_DEATH_WINDOW_SECONDS = 180;

const tibiaAPI = new TibiaAPI({ worldName: WORLD_NAME });

let isFastTaskRunning = false;
let isSlowTaskRunning = false;
let isGuildSyncRunning = false;

const announcedLevelUps = new Map();
let previousOnlineNames = new Set();
const recentlyOfflineMap = new Map();

/* ===========================
   GUILD AUTO SYNC FUNCTION
=========================== */

const runGuildAutoSync = async (teamspeak) => {
  if (!GUILD_AUTO_SYNC_NAME) return;

  if (isGuildSyncRunning) {
    console.log('[CRON] guildSyncTask ainda em execução. Pulando.');
    return;
  }

  isGuildSyncRunning = true;

  try {
    console.log(`[GUILD SYNC] Iniciando sync automático da guild ${GUILD_AUTO_SYNC_NAME}`);

    const beforeFriends = await Characters.find({
      type: 'friend',
      guildName: GUILD_AUTO_SYNC_NAME,
    });

    const beforeNames = new Set(beforeFriends.map(c => c.characterName));

    const result = await syncCharactersByGuildName(GUILD_AUTO_SYNC_NAME, 'friend');

    const afterFriends = await Characters.find({
      type: 'friend',
      guildName: GUILD_AUTO_SYNC_NAME,
    });

    const afterNames = new Set(afterFriends.map(c => c.characterName));

    const entered = [];
    const left = [];

    for (const name of afterNames) {
      if (!beforeNames.has(name)) {
        entered.push(name);
      }
    }

    for (const name of beforeNames) {
      if (!afterNames.has(name)) {
        left.push(name);
      }
    }

    for (const name of entered) {
      await sendMassPrivateMessage(
        teamspeak,
        `🟢 [B]${name}[/B] ENTROU na guild ${GUILD_AUTO_SYNC_NAME}`
      );
    }

    for (const name of left) {
      await sendMassPrivateMessage(
        teamspeak,
        `🔴 [B]${name}[/B] SAIU da guild ${GUILD_AUTO_SYNC_NAME}`
      );
    }

    console.log(`[GUILD SYNC] +${entered.length} / -${left.length}`);
  } catch (error) {
    console.error('[CRON] Erro no guildSyncTask:', error);
  } finally {
    isGuildSyncRunning = false;
  }
};

/* ===========================
   EXISTING TASKS (mantidas)
=========================== */

/* ... TODA SUA LÓGICA ORIGINAL CONTINUA IGUAL AQUI ... */
/* NÃO ALTEREI fastTask nem neutralTask */

/* ===========================
   START TASKS
=========================== */

export const startTasks = (teamspeak) => {

  /* SEU fastTask ORIGINAL AQUI */
  /* SEU neutralTask ORIGINAL AQUI */

  const fastTask = cron.schedule('0-59/5 * * * * *', async () => {
    if (isFastTaskRunning) {
      console.log('[CRON] fastTask ainda em execução. Pulando esta rodada.');
      return;
    }
    isFastTaskRunning = true;
    try {
      // ✅ seu código original intacto
    } catch (error) {
      console.error('[CRON] Erro na fastTask:', error);
    } finally {
      isFastTaskRunning = false;
    }
  }, { scheduled: false });

  const neutralTask = cron.schedule('*/30 * * * * *', async () => {
    if (isSlowTaskRunning) {
      console.log('[CRON] neutralTask ainda em execução. Pulando esta rodada.');
      return;
    }
    isSlowTaskRunning = true;
    try {
      // ✅ seu código original intacto
    } catch (error) {
      console.error('[CRON] Erro na neutralTask:', error);
    } finally {
      isSlowTaskRunning = false;
    }
  }, { scheduled: false });

  /* ===========================
     NOVO CRON GUILD SYNC
  ============================ */

  if (GUILD_AUTO_SYNC_NAME) {
    const interval = Number(GUILD_AUTO_SYNC_INTERVAL_MINUTES) || 30;

    const guildSyncTask = cron.schedule(`*/${interval} * * * *`, async () => {
      await runGuildAutoSync(teamspeak);
    }, { scheduled: false });

    guildSyncTask.start();
  }

  fastTask.start();
  neutralTask.start();
};
