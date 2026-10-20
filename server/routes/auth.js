import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/database.js';
import { config } from '../config.js';
import { authenticate, requireRole } from '../middleware/auth.js';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post('/login', (req, res) => {
  const { knoxId, username, password } = req.body || {};
  const cleanId = String(knoxId || username || '').trim();

  if (!cleanId || !password) {
    return res.status(400).json({
      success: false,
      error: 'Knox ID and password are required.',
    });
  }

  const user = db.prepare(`
    SELECT id, username, password_hash, full_name, role, knox_id, title
    FROM users
    WHERE LOWER(username) = LOWER(?) OR LOWER(knox_id) = LOWER(?)
  `).get(cleanId, cleanId);

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Invalid Knox ID or password.',
    });
  }

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({
      success: false,
      error: 'Invalid Knox ID or password.',
    });
  }

  // Update last login
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(new Date().toISOString(), user.id);

  // Sign JWT
  const tokenPayload = {
    id: user.id,
    knoxId: user.knox_id || user.username,
    role: user.role,
  };

  const token = jwt.sign(tokenPayload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

  // Set HTTP-Only Cookie
  res.cookie('spe_token', token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: config.cookieMaxAge,
  });

  return res.json({
    success: true,
    message: 'Login successful.',
    user: {
      id: user.id,
      knoxId: user.knox_id || user.username,
      fullName: user.full_name,
      role: user.role,
      title: user.title || '',
    },
    token, // Also returned for API / mobile client flexibility
  });
});

// POST /api/auth/logout
authRouter.post('/logout', (req, res) => {
  res.clearCookie('spe_token', {
    httpOnly: true,
    sameSite: 'lax',
  });
  return res.json({
    success: true,
    message: 'Logged out successfully.',
  });
});

// GET /api/auth/me
authRouter.get('/me', authenticate, (req, res) => {
  return res.json({
    success: true,
    user: req.user,
  });
});

// POST /api/auth/change-password
authRouter.post('/change-password', authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      error: 'New password must be at least 6 characters long.',
    });
  }

  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(400).json({
      success: false,
      error: 'Current password does not match.',
    });
  }

  const salt = bcrypt.genSaltSync(10);
  const newHash = bcrypt.hashSync(newPassword, salt);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);

  return res.json({
    success: true,
    message: 'Password updated successfully.',
  });
});

// GET /api/auth/users (Admin only)
authRouter.get('/users', authenticate, requireRole('ADMIN'), (req, res) => {
  const users = db.prepare(`
    SELECT id, username, full_name, role, knox_id, created_at, last_login
    FROM users
    ORDER BY created_at DESC
  `).all();

  return res.json({
    success: true,
    users,
  });
});

// POST /api/auth/users (Admin only: create new system user)
authRouter.post('/users', authenticate, requireRole('ADMIN'), (req, res) => {
  const { username, password, fullName = '', role = 'OPERATOR', knoxId = '' } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required.' });
  }

  const trimmedUsername = username.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(trimmedUsername);
  if (existing) {
    return res.status(409).json({ success: false, error: `User "${trimmedUsername}" already exists.` });
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);
  const id = `usr-${Date.now()}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, username, password_hash, full_name, role, knox_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, trimmedUsername, passwordHash, fullName.trim(), role.toUpperCase(), knoxId.trim(), now);

  const newUser = db.prepare('SELECT id, username, full_name, role, knox_id, created_at FROM users WHERE id = ?').get(id);
  return res.status(201).json({
    success: true,
    message: 'User created successfully.',
    user: newUser,
  });
});

// PUT /api/auth/users/:id (Admin only: update user)
authRouter.put('/users/:id', authenticate, requireRole('ADMIN'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }

  const { fullName = user.full_name, role = user.role, knoxId = user.knox_id, password } = req.body || {};

  let passwordHash = user.password_hash;
  if (password && password.trim().length >= 6) {
    const salt = bcrypt.genSaltSync(10);
    passwordHash = bcrypt.hashSync(password.trim(), salt);
  }

  db.prepare(`
    UPDATE users
    SET full_name = ?, role = ?, knox_id = ?, password_hash = ?
    WHERE id = ?
  `).run(fullName.trim(), role.toUpperCase(), knoxId.trim(), passwordHash, user.id);

  const updated = db.prepare('SELECT id, username, full_name, role, knox_id, created_at, last_login FROM users WHERE id = ?').get(user.id);
  return res.json({
    success: true,
    message: 'User updated successfully.',
    user: updated,
  });
});

// DELETE /api/auth/users/:id (Admin only: delete user)
authRouter.delete('/users/:id', authenticate, requireRole('ADMIN'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }

  if (user.id === req.user.id) {
    return res.status(400).json({ success: false, error: 'You cannot delete your own active account.' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  return res.json({ success: true, message: `User "${user.username}" deleted successfully.` });
});

