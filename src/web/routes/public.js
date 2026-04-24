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

/* RANKING */
router.get('/ranking-monthly', async (req, res) => {
  try {
    const monthKey = moment().format('YYYY-MM');

    // 1. LEVEL RANKING (Só quem ainda é monitorado)
    const monthlyData = await mongoose.connection.collection('monthlyLevelTrackers').find({ monthKey }).toArray();
    const levelRanking = [];
    for (const entry of monthlyData) {
      const char = await Characters.findOne({ characterName: entry.name });
      if (!char) continue; // SE SAIU DA GUILD, PULA

      const tracker = await mongoose.connection.collection('levelTrackers').findOne({ name: entry.name });
      if (tracker) {
        const gain = tracker.lastLevel - entry.startLevel;
        if (gain > 0) {
          levelRanking.push({ name: entry.name, totalGain: gain, type: char.type });
        }
      }
    }
    levelRanking.sort((a, b) => b.totalGain - a.totalGain);

    // 2. DEATH RANKING (Só quem ainda é monitorado)
    const deaths = await getDeathsCache();
    const startOfMonth = moment().startOf('month').toDate();
    const deathMap = {};
    for (const d of deaths) {
      if (new Date(d.time) >= startOfMonth) {
        const char = await Characters.findOne({ characterName: d.characterName });
        if (char) { // SÓ ADICIONA SE EXISTIR NO BANCO
          deathMap[d.characterName] = { count: (deathMap[d.characterName]?.count || 0) + 1, type: char.type };
        }
      }
    }
    const deathRanking = Object.keys(deathMap).map(name => ({
      name, deaths: deathMap[name].count, type: deathMap[name].type
    })).sort((a, b) => b.deaths - a.deaths);

    // 3. ÚLTIMOS LEVEL UPS (Filtro rigoroso + campo correto)
    const recentHistory = await mongoose.connection.collection('leveluphistories')
      .find({}).sort({ _id: -1 }).limit(50).toArray();
    
    const recentLevelUps = [];
    for (const h of recentHistory) {
      const char = await Characters.findOne({ characterName: h.name });
      if (!char) continue; // SE SAIU DA GUILD, PULA

      recentLevelUps.push({
        name: h.name,
        level: h.level || h.newLevel || h.currentLevel || '?', // Tenta vários campos para evitar undefined
        type: char.type
      });
      if (recentLevelUps.length >= 10) break; // Pega os 10 mais recentes que ainda estão na guild
    }

    res.json({ levelRanking, deathRanking, recentLevelUps });
  } catch (e) {
    res.json({ levelRanking: [], deathRanking: [], recentLevelUps: [] });
  }
});
/* =========================
   WAR (AGORA USANDO MONGO)
========================= */
router.get('/war', async (req, res) => {
  try {
    const fifteenMinutesAgo = moment().subtract(15, 'minutes').toDate();

    // 1. THREAT (Verifica se algum Friend morreu nos últimos 15 min)
    const recentFriendDeath = await WarEvent.findOne({ type: 'friend' }).sort({ time: -1 });
    let threat = null;
    if (recentFriendDeath && recentFriendDeath.time >= fifteenMinutesAgo) {
      // Pega o primeiro matador da lista que seja Player
      const killer = recentFriendDeath.killers?.find(k => k.isPlayer)?.name || 'Unknown';
      const minutesPassed = moment().diff(moment(recentFriendDeath.time), 'minutes');
      const remaining = 15 - minutesPassed;
      if (remaining > 0) threat = { name: killer, remaining };
    }

    // 2. TOTAL KILLS (Enemy morto por Friend da lista)
    const totalKillsAgg = await WarEvent.aggregate([
      { $match: { type: 'enemy' } },
      { $unwind: "$killers" },
      { $lookup: { from: "characters", localField: "killers.name", foreignField: "characterName", as: "kData" }},
      { $match: { "kData.type": "friend" } },
      { $group: { _id: "$_id" } },
      { $count: "total" }
    ]);
    const totalKills = totalKillsAgg[0]?.total || 0;

    // 3. TOTAL DEATHS (Friend morto por Enemy da lista)
    const totalDeathsAgg = await WarEvent.aggregate([
      { $match: { type: 'friend' } },
      { $unwind: "$killers" },
      { $lookup: { from: "characters", localField: "killers.name", foreignField: "characterName", as: "kData" }},
      { $match: { "kData.type": "enemy" } },
      { $group: { _id: "$_id" } },
      { $count: "total" }
    ]);
    const totalDeaths = totalDeathsAgg[0]?.total || 0;

    // 4. TOP FRIEND & TOP ENEMY
    const friendAgg = await WarEvent.aggregate([
      { $match: { type: 'enemy' } }, { $unwind: "$killers" },
      { $lookup: { from: "characters", localField: "killers.name", foreignField: "characterName", as: "kData" }},
      { $match: { "kData.type": "friend" } },
      { $group: { _id: "$killers.name", count: { $sum: 1 } } },
      { $sort: { count: -1 } }, { $limit: 1 }
    ]);
    const enemyAgg = await WarEvent.aggregate([
      { $match: { type: 'friend' } }, { $unwind: "$killers" },
      { $lookup: { from: "characters", localField: "killers.name", foreignField: "characterName", as: "kData" }},
      { $match: { "kData.type": "enemy" } },
      { $group: { _id: "$killers.name", count: { $sum: 1 } } },
      { $sort: { count: -1 } }, { $limit: 1 }
    ]);

    // 5. ÚLTIMAS BAIXAS (Feed geral de inimigos)
    const lastEnemys = await WarEvent.find({ type: 'enemy' }).sort({ time: -1 }).limit(10);

    res.json({
      threat,
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
