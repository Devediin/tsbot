import express from 'express';
import bcrypt from 'bcrypt';

const router = express.Router();

const ADMIN_USER = process.env.WEB_ADMIN_USER || 'admin';
const ADMIN_PASS_HASH = process.env.WEB_ADMIN_PASS_HASH || '';

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (username !== ADMIN_USER) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const match = await bcrypt.compare(password, ADMIN_PASS_HASH);

  if (!match) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.authenticated = true;
  res.json({ success: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

export default router;
