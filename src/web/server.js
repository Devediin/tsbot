import express from 'express';
import session from 'express-session';
import cors from 'cors';
import path from 'path';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

const app = express();
const PORT = process.env.WEB_PORT || 3000;

/* =========================
   SEGURANÇA
========================= */
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 120, // 120 requests por IP por minuto
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

/* =========================
   MIDDLEWARES
========================= */

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.WEB_SECRET || 'niidehelper_secret',
  resave: false,
  saveUninitialized: false,
}));

/* =========================
   ROTAS API
========================= */

import authRoutes from './routes/auth';
import descriptionRoutes from './routes/description';
import publicRoutes from './routes/public';

app.use('/api/auth', authRoutes);
app.use('/api/description', descriptionRoutes);
app.use('/api/public', publicRoutes);

/* =========================
   ROTAS WEB
========================= */

app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'src/web/public/index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'src/web/public/dashboard.html'));
});

app.get('/tools', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'src/web/public/tools.html'));
});

app.get('/description', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'src/web/public/description.html'));
});

app.get('/ranking', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'src/web/public/ranking.html'));
});

app.get('/war', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'src/web/public/war.html'));
});

/* =========================
   STATIC FILES
========================= */

app.use(express.static(path.join(process.cwd(), 'src/web/public')));

/* =========================
   LISTEN LOCALHOST ONLY
========================= */

app.listen(PORT, '127.0.0.1', () => {
  console.log(`🌐 Web Panel running securely on 127.0.0.1:${PORT}`);
});
