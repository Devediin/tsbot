import { chromium } from 'playwright';

const TIBIA_CHARACTER_URL = 'https://www.tibia.com/community/?subtopic=characters&name=';
const ATTEMPTS = 4;
const WAIT_BETWEEN_ATTEMPTS_MS = 1500;

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

export const getCharacterDeathsFromTibiaSite = async (characterName) => {
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
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });

    const url = `${TIBIA_CHARACTER_URL}${encodeURIComponent(characterName)}`;

    let bestDeathLines = [];

    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      if (attempt === 1) {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
      } else {
        await page.reload({
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
      }

      await sleep(WAIT_BETWEEN_ATTEMPTS_MS);

      const text = await page.locator('body').innerText();
      const deathLines = extractDeathLinesFromText(text);

      if (deathLines.length > bestDeathLines.length) {
        bestDeathLines = deathLines;
      } else if (deathLines.length > 0) {
        bestDeathLines = deathLines;
      }
    }

    await context.close();
    return bestDeathLines;
  } finally {
    await browser.close();
  }
};

export default getCharacterDeathsFromTibiaSite;
