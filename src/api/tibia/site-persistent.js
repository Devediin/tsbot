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

class TibiaSitePersistentWatcher {
  constructor() {
    this.browser = null;
    this.context = null;
    this.pages = new Map();
    this.latestDeaths = new Map();
  }

  async init() {
    if (this.browser && this.context) {
      return;
    }

    this.browser = await chromium.launch({ headless: true });

    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'UTC',
      bypassCSP: true,
      ignoreHTTPSErrors: true,
    });
  }

  async ensurePage(characterName) {
    await this.init();

    if (this.pages.has(characterName)) {
      return this.pages.get(characterName);
    }

    const page = await this.context.newPage();

    await page.setExtraHTTPHeaders({
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    });

    const url = `${TIBIA_CHARACTER_URL}${encodeURIComponent(characterName)}`;

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await page.waitForTimeout(1000);

    this.pages.set(characterName, page);
    return page;
  }

  async refreshCharacter(characterName) {
    const page = await this.ensurePage(characterName);

    try {
      await page.reload({
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      await page.waitForTimeout(1200);

      const text = await page.locator('body').innerText();
      const deaths = extractDeathLinesFromText(text);
      const newestDeath = deaths[0] || null;

      if (!newestDeath) {
        return null;
      }

      const previousRaw = this.latestDeaths.get(characterName) || null;
      this.latestDeaths.set(characterName, newestDeath.raw);

      return {
        newestDeath,
        changed: previousRaw !== null && previousRaw !== newestDeath.raw,
        previousRaw,
      };
    } catch (error) {
      try {
        await page.close();
      } catch (e) {
        // ignore
      }

      this.pages.delete(characterName);

      const freshPage = await this.ensurePage(characterName);
      await freshPage.waitForTimeout(1200);

      const text = await freshPage.locator('body').innerText();
      const deaths = extractDeathLinesFromText(text);
      const newestDeath = deaths[0] || null;

      if (!newestDeath) {
        return null;
      }

      const previousRaw = this.latestDeaths.get(characterName) || null;
      this.latestDeaths.set(characterName, newestDeath.raw);

      return {
        newestDeath,
        changed: previousRaw !== null && previousRaw !== newestDeath.raw,
        previousRaw,
      };
    }
  }

  async primeCharacter(characterName) {
    const page = await this.ensurePage(characterName);
    const text = await page.locator('body').innerText();
    const deaths = extractDeathLinesFromText(text);
    const newestDeath = deaths[0] || null;

    if (newestDeath) {
      this.latestDeaths.set(characterName, newestDeath.raw);
    }

    return newestDeath;
  }

  async removeCharacter(characterName) {
    if (this.pages.has(characterName)) {
      try {
        await this.pages.get(characterName).close();
      } catch (error) {
        // ignore
      }
      this.pages.delete(characterName);
    }

    this.latestDeaths.delete(characterName);
  }

  async syncCharacters(characterNames = []) {
    const nextSet = new Set(characterNames);

    for (const existingName of Array.from(this.pages.keys())) {
      if (!nextSet.has(existingName)) {
        await this.removeCharacter(existingName);
      }
    }

    for (const name of characterNames) {
      if (!this.pages.has(name)) {
        await this.primeCharacter(name);
      }
    }
  }

  async close() {
    for (const page of this.pages.values()) {
      try {
        await page.close();
      } catch (error) {
        // ignore
      }
    }

    this.pages.clear();
    this.latestDeaths.clear();

    if (this.context) {
      try {
        await this.context.close();
      } catch (error) {
        // ignore
      }
    }

    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        // ignore
      }
    }

    this.context = null;
    this.browser = null;
  }
}

const tibiaSitePersistentWatcher = new TibiaSitePersistentWatcher();

export default tibiaSitePersistentWatcher;
