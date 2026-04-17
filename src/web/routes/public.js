import express from 'express';
import axios from 'axios';
import Characters from '../../api/models/characters.js';
import { getOnlineTrackerByName } from '../../api/models/online-tracker.js';
import { getDeathsCache } from '../../api/models/meta.js';
import moment from 'moment';
import { parseLootSession } from '../../utils/lootSplit.js';
import PlayerHistory from '../api/models/player-history.js';

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

/* RANKING */
router.get('/ranking', async (req, res) => {
  try {

    const characters = await Characters.find({ type: 'friend' });

    const ranking = [];

    for (const char of characters) {

      const tracker = await getOnlineTrackerByName(char.characterName);

      const resp = await axios.get(
        `https://api.tibiadata.com/v4/character/${encodeURIComponent(char.characterName)}`
      );

      const info = resp.data.character.character;

      ranking.push({
        name: char.characterName,
        level: info.level,
        vocation: info.vocation,
        onlineTimeMinutes: tracker?.isOnline
          ? moment().diff(moment(tracker.firstSeenOnline), 'minutes')
          : 0
      });
    }

    const sortedByLevel = [...ranking].sort((a,b) => b.level - a.level);
    const sortedByOnline = [...ranking].sort((a,b) => b.onlineTimeMinutes - a.onlineTimeMinutes);

    res.json({
      topLevel: sortedByLevel[0] || null,
      topOnlineToday: sortedByOnline[0] || null,
      averageLevel: Math.round(
        ranking.reduce((sum, p) => sum + p.level, 0) / (ranking.length || 1)
      )
    });

  } catch (e) {
    res.json({});
  }
});

router.get('/ranking-advanced', async (req, res) => {
  try {

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const histories = await PlayerHistory.find({
      date: { $gte: oneWeekAgo }
    });

    const grouped = {};

    histories.forEach(entry => {
      if (!grouped[entry.name]) {
        grouped[entry.name] = [];
      }
      grouped[entry.name].push(entry);
    });

    const levelUps = [];

    Object.keys(grouped).forEach(name => {
      const records = grouped[name].sort((a,b) => a.date - b.date);
      const diff = records[records.length - 1].level - records[0].level;

      levelUps.push({ name, diff });
    });

    levelUps.sort((a,b) => b.diff - a.diff);

    const deaths = await getDeathsCache();
    const deathsLastWeek = deaths.filter(d =>
      new Date(d.time) >= oneWeekAgo
    );

    const deathCount = {};
    deathsLastWeek.forEach(d => {
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
      levelUpRanking: levelUps,
      deathRanking
    });

  } catch (e) {
    res.json({});
  }
});

export default router;
