import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import TibiaAPI from '../../api/tibia/index.js';

const router = express.Router();

const tibiaAPI = new TibiaAPI({ worldName: process.env.WORLD_NAME });

router.post('/generate', requireAuth, async (req, res) => {
  try {
    const { characterName } = req.body;

    if (!characterName) {
      return res.status(400).json({ error: 'Character required' });
    }

    const info = await tibiaAPI.getCharacterInformation(characterName);

    if (!info?.info) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const { vocation, level, world } = info.info;

    const description = `
Main: ${characterName}
World: ${world}
Level: ${level}
Vocation: ${vocation}
`;

    res.json({ description });
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
