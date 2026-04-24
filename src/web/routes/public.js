import express from 'express';
import axios from 'axios';
import mongoose from 'mongoose';
import Characters from '../../api/models/characters.js';
import WarEvent from '../../api/models/war-event.js';
import { getOnlineTrackerByName } from '../../api/models/online-tracker.js';
import { getDeathsCache } from '../../api/models/meta.js';
import moment from 'moment';
import { parseLootSession } from '../../utils/lootSplit.js';

const router = express.Router();

/* DAILY */
router.get('/daily', (req, res) =>
  res.json(global.dailyInfoCachePortal || {})
);

router.get('/live', (req, res) =>
  res.json({
    live: global.isTwitchLive || false,
    data: global.twitchLiveData || null
  })
);

/* ONLINE */
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

 /* ------------------------
   DEATH ROUTE
   ---------------------- */

router.get('/deaths', async (req, res) => {
  try {
    const deaths = await getDeathsCache();
    const detailed = [];

    for (const d of deaths.slice(-10).reverse()) {
      const charData = await Characters.findOne({ characterName: d.characterName });
      const type = charData ? charData.type : 'neutral';

      const resp = await axios.get(
        `https://api.tibiadata.com/v4/character/${encodeURIComponent(d.characterName)}`
      ).catch(() => ({ data: { character: {} } }));

      const lastKill =
        resp.data.character.deaths?.find(k => k.time === d.time) ||
        resp.data.character.deaths?.[0];

      detailed.push({
        characterName: d.characterName,
        type: type,
        level: lastKill?.level || '???',
        killers: lastKill?.killers
          ? lastKill.killers.map(k => k.name).join(', ')
          : 'Unknown'
      });
    }
    res.json({ deaths: detailed });
  } catch (e) {
    res.json({ deaths: [] });
  }
});

/* LOOT */
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

/* RANKING MENSAL (mantido como estava) */
router.get('/ranking-monthly', async (req, res) => {
  try {

    const monthKey = moment().format('YYYY-MM');

    const monthlyData = await mongoose.connection
      .collection('monthlyLevelTrackers')
      .find({ monthKey })
      .toArray();

    const levelRanking = [];

    for (const entry of monthlyData) {
      const tracker = await mongoose.connection
        .collection('levelTrackers')
        .findOne({ name: entry.name });

      if (!tracker) continue;

      const gain = tracker.lastLevel - entry.startLevel;

      if (gain > 0) {
        levelRanking.push({
          name: entry.name,
          totalGain: gain
        });
      }
    }

    levelRanking.sort((a,b) => b.totalGain - a.totalGain);

    const deaths = await getDeathsCache();
    const startOfMonth = moment().startOf('month').toDate();

    const deathsThisMonth = deaths.filter(d =>
      new Date(d.time) >= startOfMonth
    );

    const deathMap = {};

    deathsThisMonth.forEach(d => {
      deathMap[d.characterName] =
        (deathMap[d.characterName] || 0) + 1;
    });

    const deathRanking = Object.keys(deathMap)
      .map(name => ({
        name,
        deaths: deathMap[name]
      }))
      .sort((a,b) => b.deaths - a.deaths);

    res.json({
      levelRanking,
      deathRanking
    });

  } catch (e) {
    res.json({
      levelRanking: [],
      deathRanking: []
    });
  }
});

/* =========================
   WAR (AGORA USANDO MONGO)
========================= */
router.get('/war', async (req, res) => {
  try {
    // 1. TOTAL KILLS (Enemy morto por Friend da nossa lista)
    const totalKillsAgg = await WarEvent.aggregate([
      { $match: { type: 'enemy' } },
      { $unwind: "$killers" },
      { $lookup: { from: "characters", localField: "killers.name", foreignField: "characterName", as: "kData" }},
      { $match: { "kData.type": "friend" } },
      { $group: { _id: "$_id" } },
      { $count: "total" }
    ]);
    const totalKills = totalKillsAgg[0]?.total || 0;

    // 2. TOTAL DEATHS (Friend morto por Enemy da lista)
    const totalDeathsAgg = await WarEvent.aggregate([
      { $match: { type: 'friend' } },
      { $unwind: "$killers" },
      { $lookup: { from: "characters", localField: "killers.name", foreignField: "characterName", as: "kData" }},
      { $match: { "kData.type": "enemy" } },
      { $group: { _id: "$_id" } },
      { $count: "total" }
    ]);
    const totalDeaths = totalDeathsAgg[0]?.total || 0;

    // 3. TOP FRIEND (Quem da nossa guild mais matou inimigos)
    const friendAgg = await WarEvent.aggregate([
      { $match: { type: 'enemy' } },
      { $unwind: "$killers" },
      { $lookup: { from: "characters", localField: "killers.name", foreignField: "characterName", as: "kData" }},
      { $match: { "kData.type": "friend" } },
      { $group: { _id: "$killers.name", count: { $sum: 1 } } },
      { $sort: { count: -1 } }, { $limit: 1 }
    ]);

    // 4. TOP ENEMY (Quem da guild deles mais matou nossos amigos)
    const enemyAgg = await WarEvent.aggregate([
      { $match: { type: 'friend' } },
      { $unwind: "$killers" },
      { $lookup: { from: "characters", localField: "killers.name", foreignField: "characterName", as: "kData" }},
      { $match: { "kData.type": "enemy" } },
      { $group: { _id: "$killers.name", count: { $sum: 1 } } },
      { $sort: { count: -1 } }, { $limit: 1 }
    ]);

    // 5. ÚLTIMAS BAIXAS (Feed geral de inimigos, incluindo mortes avulsas)
    const lastEnemys = await WarEvent.find({ type: 'enemy' }).sort({ time: -1 }).limit(10);

    res.json({
      topEnemy: enemyAgg.length > 0 ? [enemyAgg[0]._id, enemyAgg[0].count] : null,
      topFriend: friendAgg.length > 0 ? [friendAgg[0]._id, friendAgg[0].count] : null,
      totalDeaths,
      totalKills,
      lastEnemys: lastEnemys.map(e => ({
        name: e.characterName,
        level: e.level,
        killers: e.killers.map(k => k.name).join(', '),
        time: e.time
      }))
    });
  } catch (e) { res.json({}); }
});

export default router;
