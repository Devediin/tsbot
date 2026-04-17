import express from 'express';
import axios from 'axios';
import { getDeathsCache } from '../../api/models/meta.js';

const router = express.Router();

/*
  ONLINE ROUTE (não alteramos agora)
*/
router.get('/online', async (req, res) => {
  res.json({});
});

/*
  DEATHS ROUTE – usando TibiaData direto
*/
router.get('/deaths', async (req, res) => {
  try {
    const deaths = await getDeathsCache();
    const detailed = [];

    for (const d of deaths.slice(-10).reverse()) {

      try {
        const response = await axios.get(
          `https://api.tibiadata.com/v4/character/${encodeURIComponent(d.characterName)}`
        );

        const kills = response?.data?.character?.deaths;

        if (kills && kills.length > 0) {
          const match = kills.find(k => k.time === d.time);

          const death = match || kills[0];

          detailed.push({
            characterName: d.characterName,
            level: death.level,
            killer: death.killers?.[0]?.name || 'Unknown'
          });
        } else {
          detailed.push({
            characterName: d.characterName,
            level: '???',
            killer: 'Unknown'
          });
        }

      } catch (apiError) {
        detailed.push({
          characterName: d.characterName,
          level: '???',
          killer: 'Unknown'
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
