const axios = require('axios');

const CHARACTER_NAME = process.argv[2] || 'Bank Ediiin';
const CHECK_EVERY_MS = 1000;
const TIBIA_DATA_API_URL = 'https://api.tibiadata.com/v4/';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  let previousDeath = null;

  while (true) {
    try {
      const { data } = await axios.get(
        `${TIBIA_DATA_API_URL}character/${encodeURIComponent(CHARACTER_NAME)}`
      );

      const deaths = (((data || {}).character || {}).deaths || []);
      const newestDeath = deaths[0] || null;

      const now = new Date();
      const nowIso = now.toISOString();
      const nowBr = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

      if (!newestDeath) {
        console.log(`[TD-WATCH] ${nowIso} | ${nowBr} | sem deaths`);
      } else {
        const summary = `${newestDeath.time} | lvl=${newestDeath.level} | killer=${newestDeath.killers?.[0]?.name || 'unknown'}`;
        console.log(`[TD-WATCH] ${nowIso} | ${nowBr} | newest=${summary}`);

        const currentKey = JSON.stringify(newestDeath);
        if (previousDeath && currentKey !== previousDeath) {
          console.log(`[TD-WATCH] NOVA DEATH DETECTADA EM ${nowBr} => ${summary}`);
        }

        previousDeath = currentKey;
      }
    } catch (error) {
      console.error('[TD-WATCH] erro:', error.response?.status, error.message || error);
    }

    await sleep(CHECK_EVERY_MS);
  }
})();
