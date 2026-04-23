import express from 'express';
import axios from 'axios';
import Characters from '../../api/models/characters.js';
import { getOnlineTrackerByName } from '../../api/models/online-tracker.js';
import { getDeathsCache } from '../../api/models/meta.js';
import moment from 'moment';
import { parseLootSession } from '../../utils/lootSplit.js';
import PlayerHistory from '../../api/models/player-history.js';

const router = express.Router();

/* =========================
   DAILY
========================= */

router.get('/daily', (req, res) =>
  res.json(global.dailyInfoCachePortal || {})
);

router.get('/live', (req, res) =>
  res.json({
    live: global.isTwitchLive || false,
    data: global.twitchLiveData || null
  })
);

/* =========================
   ONLINE
========================= */

router.get('/online', async (req, res) => {
  try {
    const characters = await Characters.find({ type: 'friend' });

    const grouped = {
      'Elite Knight': [],
      'Royal Paladin': [],
      'Master Sorcerer': [],
      'Elder Druid': [],
      'Exalted Monk': []
    };

    const getGroup = (voc) => {
      if (voc.includes('Elite Knight')) return 'Elite Knight';
      if (voc.includes('Royal Paladin')) return 'Royal Paladin';
      if (voc.includes('Master Sorcerer')) return 'Master Sorcerer';
      if (voc.includes('Elder Druid')) return 'Elder Druid';
      if (voc.includes('Exalted Monk')) return 'Exalted Monk';
      return null;
    };

    for (const char of characters) {
      const tracker = await getOnlineTrackerByName(char.characterName);

      if (tracker?.isOnline) {
        const resp = await axios.get(
          `https://api.tibiadata.com/v4/character/${encodeURIComponent(char.characterName)}`
        );

        const info = resp.data.character.character;
        const group = getGroup(info.vocation);

        if (group) {
          const diff = moment().diff(
            moment(tracker.firstSeenOnline),
            'minutes'
          );

          const time =
            Math.floor(diff / 60) > 0
              ? `${Math.floor(diff / 60)}h ${diff % 60}m`
              : `${diff % 60}m`;

          grouped[group].push({
            name: char.characterName,
            level: info.level,
            onlineTime: time
          });
        }
      }
    }

    res.json(grouped);
  } catch (e) {
    res.json({});
  }
});

/* =========================
   DEATHS
========================= */

router.get('/deaths', async (req, res) => {
  try {
    const deaths = await getDeathsCache();
    const detailed = [];

    for (const d of deaths.slice(-10).reverse()) {
      const resp = await axios.get(
        `https://api.tibiadata.com/v4/character/${encodeURIComponent(d.characterName)}`
      );

      const lastKill =
        resp.data.character.deaths?.find(k => k.time === d.time) ||
        resp.data.character.deaths?.[0];

      detailed.push({
        characterName: d.characterName,
        level: lastKill?.level || '???',
        killers: lastKill?.killers
          ? lastKill.killers.map(k => k.name).join(' e ')
          : 'Unknown'
      });
    }

    res.json({ deaths: detailed });
  } catch (e) {
    res.json({ deaths: [] });
  }
});

/* =========================
   LOOT SPLIT
========================= */

router.post('/loot', (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Texto não enviado.' });
    }

    const result = parseLootSession(text);
    res.json(result);

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* =========================
   RANKING GERAL
========================= */

router.get('/ranking', async (req, res) => {
  try {
    const characters = await Characters.find({ type: 'friend' });
    const ranking = [];

    for (const char of characters) {
      const resp = await axios.get(
        `https://api.tibiadata.com/v4/character/${encodeURIComponent(char.characterName)}`
      );

      const info = resp.data.character.character;

      ranking.push({
        name: char.characterName,
        level: info.level
      });
    }

    ranking.sort((a,b) => b.level - a.level);

    res.json({
      topLevel: ranking[0] || null
    });

  } catch (e) {
    res.json({});
  }
});

/* =========================
   RANKING MENSAL (UNIFICADO)
========================= */

router.get('/ranking-advanced', async (req, res) => {
  try {

    const startOfMonth = moment().startOf('month').toDate();

    const characters = await Characters.find({ type: 'friend' });

    const levelUpRanking = [];

    for (const char of characters) {

      const history = await PlayerHistory.find({ name: char.characterName })
        .sort({ date: 1 });

      if (!history || history.length < 2) continue;

      const firstRecord = history.find(h => h.date >= startOfMonth) || history[0];
      const lastRecord = history[history.length - 1];

      const gain = lastRecord.level - firstRecord.level;

      levelUpRanking.push({
        name: char.characterName,
        levelGain: gain
      });
    }

    levelUpRanking.sort((a,b) => b.levelGain - a.levelGain);

    const deaths = await getDeathsCache();
    const deathsThisMonth = deaths.filter(d =>
      new Date(d.time) >= startOfMonth
    );

    const deathCount = {};

    deathsThisMonth.forEach(d => {
      deathCount[d.characterName] =
        (deathCount[d.characterName] || 0) + 1;
    });

    const deathRanking = Object.keys(deathCount)
      .map(name => ({
        name,
        deaths: deathCount[name]
      }))
      .sort((a,b) => b.deaths - a.deaths);

    res.json({
      levelUpRanking,
      deathRanking
    });

  } catch (e) {
    console.error(e);
    res.json({});
  }
});

/* =========================
   DESTAQUE MENSAL
========================= */

router.get('/monthly-highlight', async (req, res) => {
  try {

    const ranking = await new Promise(resolve => {
      router.handle(
        { method: 'GET', url: '/ranking-advanced' },
        { json: resolve },
        () => {}
      );
    });

    res.json({
      playerOfMonth: ranking.levelUpRanking?.[0] || null,
      tragedyOfMonth: ranking.deathRanking?.[0] || null
    });

  } catch (e) {
    res.json({});
  }
});

export default router;
