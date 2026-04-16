import express from 'express';
import TibiaAPI from '../../api/tibia/index.js';

const router = express.Router();

const tibiaAPI = new TibiaAPI({ worldName: process.env.WORLD_NAME });

router.post('/generate', async (req, res) => {
  try {
    const { characterName } = req.body;

    if (!characterName) {
      return res.status(400).json({ error: 'Character required' });
    }

    const info = await tibiaAPI.getCharacterInformation(characterName);

    if (!info?.info) {
      return res.status(404).json({ error: 'Character not found' });
    }

    if (info.info.world !== process.env.WORLD_NAME) {
      return res.status(400).json({ error: 'Character not in correct world' });
    }

    const description = `Main: ${info.info.name}`;

    res.json({ description });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
