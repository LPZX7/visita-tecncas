require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');

if (!process.env.JWT_SECRET) {
  console.warn('[aviso] JWT_SECRET não definido no .env — usando um valor padrão inseguro. Configure JWT_SECRET antes de ir para produção.');
}

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5183,http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameSrc: ['https://www.google.com']
    }
  }
}));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api', (req, res, next) => {
  const selfOrigin = `${req.protocol}://${req.get('host')}`;
  cors({
    origin(origin, callback) {
      if (!origin || origin === selfOrigin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error('Origem não permitida pelo CORS'));
    }
  })(req, res, next);
}, routes);

const frontendDist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const port = process.env.PORT || 4100;
app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
