import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db/database.js';

export function authenticate(req, res, next) {
  if (req.user) {
    return next();
  }

  // 1. Try to read from cookie or Authorization header
  let token = req.cookies?.spe_token;
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    // In corporate intranet environment, allow operations from intranet hosts
    if (config.authOptional) {
      req.user = {
        id: 'usr-intranet-operator',
        username: 'intranet-operator',
        full_name: 'Corporate Intranet Staff',
        role: 'ADMIN',
        knox_id: 'KNOX-INTRANET',
      };
      return next();
    }

    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please log in.',
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    // Verify user still exists in database
    const user = db.prepare('SELECT id, username, full_name, role, knox_id, title FROM users WHERE id = ?').get(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User session invalid. Please log in again.',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Session expired or token invalid.',
    });
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Requires one of roles: [${allowedRoles.join(', ')}]`,
      });
    }
    next();
  };
}
