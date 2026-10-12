import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { initDatabase, db } from './db/database.js';
import { authRouter } from './routes/auth.js';
import { assetsRouter } from './routes/assets.js';
import { loansRouter } from './routes/loans.js';
import { directoryRouter } from './routes/directory.js';
import { statsRouter } from './routes/stats.js';
import { exchangeRouter } from './routes/exchange.js';

const app = express();

// Initialize SQLite database and seed defaults
initDatabase();

// 1. Middlewares
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 2. Health & System Status Endpoint
app.get('/api/health', (req, res) => {
  const assetCount = db.prepare('SELECT COUNT(*) as count FROM assets').get();
  const loanCount = db.prepare('SELECT COUNT(*) as count FROM loans').get();
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  const empCount = db.prepare('SELECT COUNT(*) as count FROM employees').get();
  const deptCount = db.prepare('SELECT COUNT(*) as count FROM departments').get();
  const locCount = db.prepare('SELECT COUNT(*) as count FROM locations').get();

  res.json({
    status: 'ok',
    system: 'StarPlus Energy Asset Management System (SPE-AMS)',
    version: '1.2.1',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      driver: 'node:sqlite (native)',
      path: config.dbPath,
      assetRecords: assetCount.count,
      loanRecords: loanCount.count,
      registeredUsers: userCount.count,
      employees: empCount.count,
      departments: deptCount.count,
      locations: locCount.count,
    },
  });
});

// 3. API Routers
app.use('/api/auth', authRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/loans', loansRouter);
app.use('/api/directory', directoryRouter);
app.use('/api/stats', statsRouter);
app.use('/api/exchange', exchangeRouter);

// 4. Serve Frontend static files if production build exists
if (fs.existsSync(config.clientDistPath)) {
  app.use(express.static(config.clientDistPath));

  // SPA Fallback for React Router in Express 5
  app.get('{*path}', (req, res) => {
    // Only serve index.html if the request isn't an unhandled /api call
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(config.clientDistPath, 'index.html'));
  });
}

// 5. Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    error: config.nodeEnv === 'development' ? err.message : 'Internal Server Error',
  });
});

// 6. Start Server
app.listen(config.port, () => {
  console.log('──────────────────────────────────────────────────────────');
  console.log(`⚡ StarPlus Energy Asset Management Server v1.2.1`);
  console.log(`🚀 API Server running at: http://localhost:${config.port}`);
  console.log(`📡 Health Check:         http://localhost:${config.port}/api/health`);
  console.log(`🔐 Default Admin User:   admin (password: admin123)`);
  console.log(`💾 SQLite Database:      ${config.dbPath}`);
  console.log('──────────────────────────────────────────────────────────');
});
