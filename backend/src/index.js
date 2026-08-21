require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const { initDb } = require('./lib/db');
const { syncMilvusChamados } = require('./lib/milvusSync');

const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me-in-production')) {
  throw new Error('JWT_SECRET forte é obrigatório em produção.');
}
if (!process.env.JWT_SECRET) {
  console.warn('[aviso] JWT_SECRET não definido no .env — usando um valor padrão inseguro. Configure JWT_SECRET antes de ir para produção.');
}

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5183,http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://viacep.com.br'],
      frameSrc: ['https://www.google.com']
    }
  }
}));
app.use(express.json({ limit: '1mb' }));

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

(async () => {
  try {
    await initDb();
    app.listen(port, () => {
      console.log(`Backend running on http://localhost:${port}`);
    });

    if (process.env.MILVUS_API_TOKEN) {
      const runMilvusSync = () => {
        syncMilvusChamados()
          .then((r) => { if (r.novos > 0) console.log(`[milvus] ${r.novos} chamado(s) novo(s) de "Visita Técnica" importado(s) para revisão`); })
          .catch((err) => console.error('[milvus] Falha na sincronização:', err.message));
      };
      runMilvusSync();
      setInterval(runMilvusSync, 5 * 60 * 1000);
    }

  } catch (err) {
    console.error('Falha ao inicializar o banco de dados:', err);
    process.exit(1);
  }
})();
