import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseOperators() {
  let raw = process.env.OPERATOR_LIST || '';

  // If unquoted multi-line in .env, dotenv only sees '{'. Read file directly as fallback
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    try {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const match = envContent.match(/OPERATOR_LIST\s*=\s*(?:["']?\{?)([\s\S]*?)(?:\}?["']?(?:\r?\n[A-Z0-9_]+|\s*$))/);
      if (match && match[1] && match[1].includes('{')) {
        raw = match[1];
      }
    } catch {
      // ignore
    }
  }

  const operators = [];
  const itemRegex = /\{([^{}]+)\}/g;
  let match;
  while ((match = itemRegex.exec(raw)) !== null) {
    const parts = match[1].split(',').map((s) => s.trim());
    if (parts.length >= 3) {
      const [knoxId, fullName, password, title] = parts;
      if (knoxId && fullName && password) {
        operators.push({
          knoxId: knoxId.trim(),
          username: knoxId.trim().toLowerCase(),
          fullName: fullName.trim(),
          password: password.trim(),
          title: title ? title.trim() : 'Operator',
          role: 'OPERATOR',
        });
      }
    }
  }

  // Fallback to legacy single operator if no OPERATOR_LIST
  if (operators.length === 0) {
    const singleUser = process.env.INITIAL_OPERATOR_USERNAME || process.env.OPERATOR_USERNAME || 'operator';
    const singlePass = process.env.INITIAL_OPERATOR_PASSWORD || process.env.OPERATOR_PASSWORD || 'operator123';
    const singleName = process.env.INITIAL_OPERATOR_NAME || process.env.OPERATOR_NAME || 'Field IT Operator';
    const singleKnox = process.env.INITIAL_OPERATOR_KNOX_ID || process.env.OPERATOR_KNOX_ID || 'KNOX-IT-002';
    operators.push({
      knoxId: singleKnox,
      username: singleUser.toLowerCase(),
      fullName: singleName,
      password: singlePass,
      title: 'Field IT Operator',
      role: 'OPERATOR',
    });
  }

  return operators;
}

export const config = {
  host: process.env.HOST || '0.0.0.0',
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'starplus-energy-jwt-secret-2026-offline-intranet',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cookieMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  dbPath: process.env.DB_PATH || path.join(__dirname, 'data', 'inventory.db'),
  clientDistPath: path.join(__dirname, '..', 'dist'),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  authOptional: process.env.AUTH_OPTIONAL === 'true', // Restricted access system (requires login)

  // Initial admin credentials sourced securely from .env
  initialAdmin: {
    knoxId: process.env.ADMIN_KNOX_ID || 'KNOX-IT-001',
    fullName: process.env.ADMIN_NAME || 'IT Administrator',
    password: process.env.ADMIN_PASSWORD || 'admin123',
    role: 'ADMIN',
  },

  // Multiple operator accounts sourced from .env OPERATOR_LIST
  operators: parseOperators(),
};
