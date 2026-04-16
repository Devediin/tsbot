import express from 'express';
import session from 'express-session';
import cors from 'cors';
import path from 'path';

const app = express();
const PORT = process.env.WEB_PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.WEB_SECRET || 'niidehelper_secret',
  resave: false,
  saveUninitialized: false,
}));

// Rotas
import authRoutes from './routes/auth';
import descriptionRoutes from './routes/description';
import publicRoutes from './routes/public';

app.use('/api/auth', authRoutes);
app.use('/api/description', descriptionRoutes);
app.use('/api/public', publicRoutes);

// Pasta pública
app.use(express.static(path.join(process.cwd(), 'src/web/public')));

app.listen(PORT, () => {
  console.log(`🌐 Web Panel running on port ${PORT}`);
});
