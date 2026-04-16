import express from 'express';
import Channels from '../../api/models/channels.js';

const router = express.Router();

router.get('/daily', async (req, res) => {
  const channel = await Channels.findOne({ type: 'dailyInfo' });
  res.json(channel || {});
});

export default router;
