import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  // Initial user credentials sourced securely from .env
  initialAdmin: {
    username: process.env.INITIAL_ADMIN_USERNAME || 'admin',
    password: process.env.INITIAL_ADMIN_PASSWORD || 'admin123',
    fullName: process.env.INITIAL_ADMIN_NAME || 'IT Administrator',
    knoxId: process.env.INITIAL_ADMIN_KNOX_ID || 'KNOX-IT-001',
  },
  initialOperator: {
    username: process.env.INITIAL_OPERATOR_USERNAME || 'operator',
    password: process.env.INITIAL_OPERATOR_PASSWORD || 'operator123',
    fullName: process.env.INITIAL_OPERATOR_NAME || 'Field IT Operator',
    knoxId: process.env.INITIAL_OPERATOR_KNOX_ID || 'KNOX-IT-002',
  },
};
