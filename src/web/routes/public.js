import express from 'express';
import Channels from '../../api/models/channels.js';
import Characters from '../../api/models/characters.js';
import { getOnlineTrackerByName } from '../../api/models/online-tracker.js';
import { getDeathsCache } from '../../api/models/meta.js';
import { getLevelTrackerByName } from '../../api/models/level-tracker.js';

const router = express.Router();

// Daily Info
router.get('/daily', async (req, res) => {
  const channel = await Channels.findOne({ type: 'dailyInfo' });
  res.json(channel || {});
});

// Online Members
router.get('/online', async (req, res) => {
  const characters = await Characters.find({ type: 'friend' });
  const online = [];

  for (const char of characters) {
    const tracker = await getOnlineTrackerByName(char.characterName);
    if (tracker?.isOnline) {
      online.push(char.characterName);
    }
  }

  res.json({ online });
});

// Últimos deaths
router.get('/deaths', async (req, res) => {
  const deaths = await getDeathsCache();
  res.json({ deaths: deaths.slice(-10).reverse() });
});

export default router;
