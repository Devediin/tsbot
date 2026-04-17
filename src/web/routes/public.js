import express from 'express';
import axios from 'axios';
import Characters from '../../api/models/characters.js';
import { getOnlineTrackerByName } from '../../api/models/online-tracker.js';
import { getDeathsCache } from '../../api/models/meta.js';
import moment from 'moment';

const router = express.Router();

/* DAILY */
router.get('/daily', async (req, res) => {
  res.json(global.dailyInfoCachePortal || {});
});

/* LIVE */
router.get('/live', async (req, res) => {
  res.json({
    live: global.isTwitchLive || false,
    data: global.twitchLiveData || null
  });
});

/* ONLINE */
router.get('/online', async (req, res) => {
  try {
    const characters = await Characters.find({ type: 'friend' });

    const grouped = {
      'Elite Knight': [],
      'Royal Paladin': [],
      'Master Sorcerer': [],
      'Elder Druid': [],
      'Exalted Monk': [],
    };

    function getGroup(vocation) {
      if (vocation.includes('Elite Knight') || vocation === 'Knight') return 'Elite Knight';
      if (vocation.includes('Royal Paladin') || vocation === 'Paladin') return 'Royal Paladin';
      if (vocation.includes('Master Sorcerer') || vocation === 'Sorcerer') return 'Master Sorcerer';
      if (vocation.includes('Elder Druid') || vocation === 'Druid') return 'Elder Druid';
      if (vocation.includes('Exalted Monk') || vocation === 'Monk') return 'Exalted Monk';
      return null;
    }

    for (const char of characters) {
      const tracker = await getOnlineTrackerByName(char.characterName);

      if (tracker && tracker.isOnline) {

        const diffMinutes = tracker.firstSeenOnline
          ? moment().diff(moment(tracker.firstSeenOnline), 'minutes')
          : 0;

        const hours = Math.floor(diffMinutes / 60);
        const minutes = diffMinutes % 60;

        const formattedTime =
          hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

        grouped[getGroup('Elite Knight')]?.push({
          name: char.characterName,
          level: 0,
          onlineTime: formattedTime
        });
      }
    }

    res.json(grouped);

  } catch (error) {
    console.error(error);
    res.json({});
  }
});

/* DEATHS */
router.get('/deaths', async (req, res) => {
  try {
    const deaths = await getDeathsCache();
    const detailed = [];

    for (const d of deaths.slice(-10).reverse()) {

      const response = await axios.get(
        `https://api.tibiadata.com/v4/character/${encodeURIComponent(d.characterName)}`
      );

      const kills = response?.data?.character?.deaths;

      if (kills && kills.length > 0) {
        const kill = kills[0];

        const killers = kill.killers
          ? kill.killers.map(k => k.name).join(' e ')
          : 'Unknown';

        detailed.push({
          characterName: d.characterName,
          level: kill.level,
          killers: killers
        });
      }
    }

    res.json({ deaths: detailed });

  } catch (error) {
    console.error(error);
    res.json({ deaths: [] });
  }
});

export default router;
