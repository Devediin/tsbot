import express from 'express';
import axios from 'axios';
import mongoose from 'mongoose';
import Characters from '../../api/models/characters.js';
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

/* DEATHS */
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

/* WAR */
router.get('/war', async (req, res) => {
  try {

    const deaths = await getDeathsCache();
    const fifteenMinutesAgo = moment().subtract(15, 'minutes').toDate();

    let threat = null;

    const recentFriendDeath = deaths
      .filter(d => d.type === 'friend')
      .sort((a,b) => new Date(b.time) - new Date(a.time))[0];

    if (recentFriendDeath && new Date(recentFriendDeath.time) >= fifteenMinutesAgo) {
      const killer = recentFriendDeath.killers?.[0]?.name || 'Unknown';
      const minutesPassed = moment().diff(moment(recentFriendDeath.time), 'minutes');
      const remaining = 15 - minutesPassed;

      if (remaining > 0) {
        threat = {
          name: killer,
          remaining
        };
      }
    }

    const enemyKills = {};
    const friendKills = {};

    deaths.forEach(d => {
      if (d.type === 'friend') {
        const killer = d.killers?.[0]?.name;
        if (killer) {
          enemyKills[killer] = (enemyKills[killer] || 0) + 1;
        }
      }

      if (d.type === 'enemy') {
        friendKills[d.characterName] =
          (friendKills[d.characterName] || 0) + 1;
      }
    });

    const topEnemy = Object.entries(enemyKills)
      .sort((a,b) => b[1] - a[1])[0] || null;

    const topFriend = Object.entries(friendKills)
      .sort((a,b) => b[1] - a[1])[0] || null;

    res.json({
      threat,
      topEnemy,
      topFriend,
      totalDeaths: Object.values(enemyKills).reduce((a,b) => a+b, 0),
      totalKills: Object.values(friendKills).reduce((a,b) => a+b, 0)
    });

  } catch (e) {
    console.error(e);
    res.json({});
  }
});

export default router;
