import express from 'express';
import Characters from '../../api/models/characters.js';
import { getOnlineTrackerByName } from '../../api/models/online-tracker.js';
import { getDeathsCache } from '../../api/models/meta.js';
import TibiaAPI from '../../api/tibia/index.js';
import moment from 'moment';

const router = express.Router();
const tibiaAPI = new TibiaAPI({ worldName: process.env.WORLD_NAME });

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

/* ONLINE – versão que já funcionava */
function getVocationGroup(vocation) {
  if (vocation.includes('Elite Knight') || vocation === 'Knight') return 'Elite Knight';
  if (vocation.includes('Royal Paladin') || vocation === 'Paladin') return 'Royal Paladin';
  if (vocation.includes('Master Sorcerer') || vocation === 'Sorcerer') return 'Master Sorcerer';
  if (vocation.includes('Elder Druid') || vocation === 'Druid') return 'Elder Druid';
  if (vocation.includes('Exalted Monk') || vocation === 'Monk') return 'Exalted Monk';
  return null;
}

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

    for (const char of characters) {
      const tracker = await getOnlineTrackerByName(char.characterName);

      if (tracker?.isOnline) {
        const info = await tibiaAPI.getCharacterInformation(char.characterName);

        if (info?.info) {
          const group = getVocationGroup(info.info.vocation);
          if (!group) continue;

          const diffMinutes = tracker.firstSeenOnline
            ? moment().diff(moment(tracker.firstSeenOnline), 'minutes')
            : 0;

          const hours = Math.floor(diffMinutes / 60);
          const minutes = diffMinutes % 60;

          const formattedTime =
            hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

          grouped[group].push({
            name: char.characterName,
            level: info.info.level,
            onlineTime: formattedTime
          });
        }
      }
    }

    res.json(grouped);
  } catch (error) {
    console.error(error);
    res.json({});
  }
});

/* DEATHS – versão que já estava funcionando */
router.get('/deaths', async (req, res) => {
  try {
    const deaths = await getDeathsCache();
    const detailed = [];

    for (const d of deaths.slice(-10).reverse()) {
      const response = await tibiaAPI.getCharacterInformation(d.characterName);
      const kills = response?.kills;

      if (kills && kills.length > 0) {
        const kill = kills[0];

        const killers = kill.killers
          ? kill.killers.map(k => k.name).join(' e ')
          : 'Unknown';

        detailed.push({
          characterName: d.characterName,
          level: kill.level || '???',
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
