import express from 'express';
import Characters from '../../api/models/characters.js';
import { getOnlineTrackerByName } from '../../api/models/online-tracker.js';
import { getDeathsCache } from '../../api/models/meta.js';
import TibiaAPI from '../../api/tibia/index.js';

const router = express.Router();
const tibiaAPI = new TibiaAPI({ worldName: process.env.WORLD_NAME });

// ONLINE FRIENDS / ENEMIES
router.get('/online', async (req, res) => {
  const characters = await Characters.find({
    type: { $in: ['friend', 'enemy'] }
  });

  const onlineList = [];

  for (const char of characters) {
    const tracker = await getOnlineTrackerByName(char.characterName);

    if (tracker?.isOnline) {
      const info = await tibiaAPI.getCharacterInformation(char.characterName);

      if (info?.info) {
        onlineList.push({
          name: char.characterName,
          type: char.type,
          level: info.info.level,
          vocation: info.info.vocation,
          onlineTime: tracker.firstSeenOnline
        });
      }
    }
  }

  res.json({ online: onlineList });
});

// ÚLTIMAS MORTES
router.get('/deaths', async (req, res) => {
  const deaths = await getDeathsCache();
  res.json({ deaths: deaths.slice(-10).reverse() });
});

export default router;
