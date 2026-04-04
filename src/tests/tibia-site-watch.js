const { chromium } = require('playwright');

const TIBIA_CHARACTER_URL = 'https://www.tibia.com/community/?subtopic=characters&name=';
const CHARACTER_NAME = process.argv[2] || 'Bank Ediiin';
const RELOAD_EVERY_MS = 5000;

const parseTibiaDeathLine = (line = '') => {
  const cleanedLine = String(line || '').trim();
  if (!cleanedLine) return null;

  const match = cleanedLine.match(/^(.+?\sCEST|.+?\sCET)\s+(Died|Killed) at Level (\d+) by (.+)\.$/i);
  if (!match) return null;

  const [, rawTime, rawType, rawLevel, rawKiller] = match;

  return {
    raw: cleanedLine,
    time: rawTime.trim(),
    type: rawType.trim(),
    level: Number(rawLevel),
    killer: rawKiller.trim(),
  };
};

const extractDeathLinesFromText = (text = '') => {
  const lines = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .filter((line) => line.includes('Died at Level') || line.includes('Killed at Level'))
    .map(parseTibiaDeathLine)
    .filter(Boolean);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'UTC',
      bypassCSP: true,
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();

    await page.setExtraHTTPHeaders({
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    });

    const url = `${TIBIA_CHARACTER_URL}${encodeURIComponent(CHARACTER_NAME)}`;

    console.log(`[WATCH] Abrindo ${CHARACTER_NAME}`);
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    let previousRawDeath = null;

    while (true) {
      try {
        await page.reload({
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });

        await page.waitForTimeout(1500);

        const text = await page.locator('body').innerText();
        const deaths = extractDeathLinesFromText(text);
        const newestDeath = deaths[0] || null;

        const now = new Date();
        const nowIso = now.toISOString();
        const nowBr = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

        if (!newestDeath) {
          console.log(`[WATCH] ${nowIso} | ${nowBr} | sem deaths`);
        } else {
          console.log(`[WATCH] ${nowIso} | ${nowBr} | newest=${newestDeath.raw}`);

          if (previousRawDeath && newestDeath.raw !== previousRawDeath) {
            console.log(`[WATCH] NOVA DEATH DETECTADA EM ${nowBr} => ${newestDeath.raw}`);
          }

          previousRawDeath = newestDeath.raw;
        }
      } catch (error) {
        console.error('[WATCH] erro no ciclo:', error.message || error);
      }

      await sleep(RELOAD_EVERY_MS);
    }
  } catch (error) {
    console.error('[WATCH] erro fatal:', error.message || error);
    process.exit(1);
  }
})();
