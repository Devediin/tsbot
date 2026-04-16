import express from 'express';
import session from 'express-session';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.WEB_PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.WEB_SECRET || 'niidehelper_secret',
  resave: false,
  saveUninitialized: false,
}));

// Rotas
import authRoutes from './routes/auth.js';
import descriptionRoutes from './routes/description.js';
import publicRoutes from './routes/public.js';

app.use('/api/auth', authRoutes);
app.use('/api/description', descriptionRoutes);
app.use('/api/public', publicRoutes);

// Frontend estático
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`🌐 Web Panel running on port ${PORT}`);
});
