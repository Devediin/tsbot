import { chromium } from 'playwright';

const TIBIA_CHARACTER_URL = 'https://www.tibia.com/community/?subtopic=characters&name=';

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

export const getCharacterDeathsFromTibiaSite = async (characterName) => {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    await page.goto(
      `${TIBIA_CHARACTER_URL}${encodeURIComponent(characterName)}`,
      { waitUntil: 'networkidle', timeout: 60000 }
    );

    const text = await page.locator('body').innerText();
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

    const deathLines = lines
      .filter((line) => line.includes('Died at Level') || line.includes('Killed at Level'))
      .map(parseTibiaDeathLine)
      .filter(Boolean);

    return deathLines;
  } finally {
    await browser.close();
  }
};

export default getCharacterDeathsFromTibiaSite;
