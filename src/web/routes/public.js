import express from 'express';
import Characters from '../../api/models/characters.js';
import { getOnlineTrackerByName } from '../../api/models/online-tracker.js';
import { getDeathsCache } from '../../api/models/meta.js';
import TibiaAPI from '../../api/tibia/index.js';
import moment from 'moment';

const router = express.Router();
const tibiaAPI = new TibiaAPI({ worldName: process.env.WORLD_NAME });

// ONLINE FRIENDS
router.get('/online', async (req, res) => {
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

    if (tracker?.isOnline) {
      const info = await tibiaAPI.getCharacterInformation(char.characterName);

      if (info?.info) {
        const group = getGroup(info.info.vocation);

        if (!group) continue;

        const onlineMinutes = tracker.firstSeenOnline
          ? moment().diff(moment(tracker.firstSeenOnline), 'minutes')
          : 0;

        grouped[group].push({
          name: char.characterName,
          level: info.info.level,
          onlineTime: `${onlineMinutes}m`
        });
      }
    }
  }

  res.json(grouped);
});

// ÚLTIMAS MORTES (formato real)
router.get('/deaths', async (req, res) => {
  const deaths = await getDeathsCache();

  const formatted = deaths.slice(-10).reverse().map(d => ({
    characterName: d.characterName,
    level: d.level,
    killer: d.mainKiller,
    type: d.type
  }));

  res.json({ deaths: formatted });
});

export default router;
