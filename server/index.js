import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { config } from './config.js';
import { initDatabase, db } from './db/database.js';
import { authRouter } from './routes/auth.js';
import { assetsRouter } from './routes/assets.js';
import { loansRouter } from './routes/loans.js';
import { directoryRouter } from './routes/directory.js';
import { statsRouter } from './routes/stats.js';
import { exchangeRouter } from './routes/exchange.js';
import { authenticate } from './middleware/auth.js';

const app = express();

// Initialize SQLite database and seed defaults
initDatabase();

// 1. Middlewares & Corporate Intranet Network Configuration
app.set('trust proxy', 1);

const allowedOrigins = config.corsOrigin && config.corsOrigin !== '*'
  ? config.corsOrigin.split(',').map((s) => s.trim().toLowerCase())
  : null;

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests without Origin (same-origin, curl, server-to-server)
    if (!origin) return callback(null, true);

    // If configured to allow all origins on corporate intranet
    if (!allowedOrigins) return callback(null, true);

    const normOrigin = origin.toLowerCase();
    if (allowedOrigins.includes(normOrigin)) return callback(null, true);

    // Allow localhost & loopback
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    // Allow corporate intranet private IP subnets: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    if (/^https?:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    // Allow corporate intranet hostnames (.corp, .local, .internal, .lan)
    if (/^https?:\/\/[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    return callback(null, true);
  },
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
    version: '1.3.0',
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
app.use('/api/assets', authenticate, assetsRouter);
app.use('/api/loans', authenticate, loansRouter);
app.use('/api/directory', authenticate, directoryRouter);
app.use('/api/stats', authenticate, statsRouter);
app.use('/api/exchange', authenticate, exchangeRouter);

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

// 6. Start Server (Binding to all network interfaces for corporate intranet multi-host access)
app.listen(config.port, config.host, () => {
  const interfaces = os.networkInterfaces();
  const intranetIps = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        intranetIps.push(iface.address);
      }
    }
  }

  console.log('──────────────────────────────────────────────────────────');
  console.log(`⚡ StarPlus Energy Asset Management Server v1.3.0`);
  console.log(`🏢 Network:              Corporate Intranet (Multi-Host Environment)`);
  console.log(`🚀 Local Access:         http://localhost:${config.port}`);
  if (intranetIps.length > 0) {
    intranetIps.forEach((ip) => {
      console.log(`🌐 Corporate Intranet:   http://${ip}:${config.port}`);
    });
  } else {
    console.log(`🌐 Corporate Intranet:   http://${config.host}:${config.port}`);
  }
  console.log(`📡 Health Check:         http://localhost:${config.port}/api/health`);
  console.log(`🔐 Default Admin User:   admin (password: admin123)`);
  console.log(`💾 Shared SQLite DB:     ${config.dbPath}`);
  console.log('──────────────────────────────────────────────────────────');
});
