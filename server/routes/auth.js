import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, logAudit } from '../db/database.js';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { authenticate, requireAdminAccount } from '../middleware/auth.js';
import { accountKnoxId } from '../../shared/accountIdentity.js';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post('/login', (req, res) => {
  const { knoxId, username, password } = req.body || {};
  if (knoxId != null && username != null && String(knoxId).trim().toLowerCase() !== String(username).trim().toLowerCase()) return res.status(400).json({ success: false, error: 'Username and Knox ID must be the same login ID.' });
  const cleanId = String(knoxId || username || '').trim();

  if (!cleanId || typeof password !== 'string' || !password) {
    return res.status(400).json({
      success: false,
      error: 'Knox ID and password are required.',
    });
  }

  const user = db.prepare(`
    SELECT id, username, password_hash, full_name, role, knox_id, title
    FROM users
    WHERE LOWER(TRIM(knox_id)) = LOWER(?) OR LOWER(TRIM(username)) = LOWER(?)
    ORDER BY CASE WHEN LOWER(TRIM(knox_id)) = LOWER(?) THEN 0 ELSE 1 END
  `).get(cleanId, cleanId, cleanId);

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
    knoxId: accountKnoxId(user),
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
      knoxId: accountKnoxId(user),
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

const publicUserFields = 'id, username, full_name, role, knox_id, title, created_at, last_login';
const accountFields = ['username', 'fullName', 'knoxId', 'title'];

function accountInput(body, existing) {
  const values = {
    username: existing?.username || '', knoxId: existing?.knox_id || '',
    fullName: existing?.full_name || '', title: existing?.title || '',
  };
  for (const key of ['fullName', 'title']) {
    if (Object.hasOwn(body, key)) {
      if (typeof body[key] !== 'string') return { error: 'Account details must be text.' };
      values[key] = body[key].trim();
    }
  }
  const hasKnox = Object.hasOwn(body, 'knoxId'), hasUsername = Object.hasOwn(body, 'username');
  for (const key of ['knoxId', 'username']) if (Object.hasOwn(body, key) && typeof body[key] !== 'string') return { error: 'Knox ID must be text.' };
  if (hasKnox && hasUsername && body.knoxId.trim().toLowerCase() !== body.username.trim().toLowerCase()) return { error: 'Username and Knox ID must be the same login ID.' };
  if (hasKnox || hasUsername || !existing) {
    const identity = String(hasKnox ? body.knoxId : body.username || '').trim();
    if (!identity) return { error: 'Knox ID is required.' };
    const unchangedLegacyAlias = existing && !hasKnox && identity.toLowerCase() === String(existing.username || '').trim().toLowerCase();
    const unchangedCanonical = existing && identity === accountKnoxId(existing);
    values.identityChanged = !unchangedLegacyAlias && !unchangedCanonical;
    if (values.identityChanged) values.username = values.knoxId = identity;
  }
  const role = body.role ?? existing?.role ?? 'OPERATOR';
  if (typeof role !== 'string' || !['ADMIN', 'OPERATOR'].includes(role.trim().toUpperCase())) return { error: 'Choose Admin or Operator.' };
  values.role = role.trim().toUpperCase();
  const password = body.password;
  if ((!existing || (password !== undefined && password !== '')) && (typeof password !== 'string' || password.length < 6)) return { error: 'Password must be at least 6 characters long.' };
  values.password = password || '';
  return { values };
}

function conflictingIdentity(values, id = '') {
  if (id && !values.identityChanged) return null;
  const username = values.username.toLowerCase(), knoxId = values.knoxId.toLowerCase();
  return db.prepare(`SELECT id FROM users WHERE id <> ? AND (
    LOWER(TRIM(username)) = ? OR LOWER(TRIM(knox_id)) = ? OR
    (? <> '' AND (LOWER(TRIM(username)) = ? OR LOWER(TRIM(knox_id)) = ?)))`).get(
      id, username, username, knoxId, knoxId, knoxId,
    );
}

// PUT /api/auth/me: edit only the authenticated account's profile or password.
authRouter.put('/me', authenticate, (req, res) => {
  const existing = req.user?.id ? db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) : null;
  if (!existing) return res.status(401).json({ success: false, error: 'Sign in to edit your profile.' });
  const body = req.body || {};
  if (existing.role !== 'ADMIN' && accountFields.some((key) => Object.hasOwn(body, key))) return res.status(403).json({ success: false, error: 'Operators can change only their password. Ask an admin to update account details.' });
  const allowed = new Set(['username', 'fullName', 'knoxId', 'title', 'currentPassword', 'newPassword']);
  if (Object.keys(body).some((key) => !allowed.has(key))) return res.status(400).json({ success: false, error: 'Only your profile details and password can be changed here.' });
  for (const key of [...accountFields, 'currentPassword', 'newPassword']) {
    if (Object.hasOwn(body, key) && typeof body[key] !== 'string') return res.status(400).json({ success: false, error: 'Profile details and passwords must be text.' });
  }
  const { values, error } = accountInput({ ...Object.fromEntries(accountFields.filter((key) => Object.hasOwn(body, key)).map((key) => [key, body[key]])), role: existing.role }, existing);
  if (error) return res.status(400).json({ success: false, error });
  if (conflictingIdentity(values, existing.id)) return res.status(409).json({ success: false, error: 'That Knox ID is already used by another account.' });
  const passwordChange = Boolean(body.newPassword);
  if (existing.role !== 'ADMIN' && !passwordChange) return res.status(400).json({ success: false, error: 'Enter your current password and a new password to change it.' });
  if ((passwordChange && (!body.currentPassword || body.newPassword.length < 6)) || (!passwordChange && body.currentPassword)) return res.status(400).json({ success: false, error: 'Enter your current password and a new password of at least 6 characters.' });
  if (passwordChange && !bcrypt.compareSync(body.currentPassword, existing.password_hash)) return res.status(400).json({ success: false, error: 'Current password does not match.' });
  const passwordHash = passwordChange ? bcrypt.hashSync(body.newPassword, 10) : existing.password_hash;
  db.prepare('UPDATE users SET username = ?, full_name = ?, knox_id = ?, title = ?, password_hash = ? WHERE id = ?')
    .run(values.username, values.fullName, values.knoxId, values.title, passwordHash, existing.id);
  logAudit(passwordChange ? 'CHANGE_OWN_PASSWORD' : 'UPDATE_OWN_PROFILE', 'users', existing.id, { username: values.username, passwordChanged: passwordChange }, req.user);
  const user = db.prepare('SELECT ' + publicUserFields + ' FROM users WHERE id = ?').get(existing.id);
  return res.json({ success: true, message: 'Profile updated successfully.', user });
});

// User administration always requires a real, persisted admin account.
authRouter.get('/users', authenticate, requireAdminAccount, (req, res) => {
  const users = db.prepare('SELECT ' + publicUserFields + ' FROM users ORDER BY full_name COLLATE NOCASE, username COLLATE NOCASE').all();
  return res.json({ success: true, users });
});

authRouter.post('/users', authenticate, requireAdminAccount, (req, res) => {
  const { values, error } = accountInput(req.body || {});
  if (error) return res.status(400).json({ success: false, error });
  if (conflictingIdentity(values)) return res.status(409).json({ success: false, error: 'That Knox ID is already used by another account.' });
  const id = 'usr-' + randomUUID();
  const passwordHash = bcrypt.hashSync(values.password, 10);
  db.prepare(`INSERT INTO users (id, username, password_hash, full_name, role, knox_id, title, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, values.username, passwordHash, values.fullName, values.role, values.knoxId, values.title, new Date().toISOString());
  logAudit('CREATE_USER', 'users', id, { username: values.username, role: values.role }, req.user);
  const user = db.prepare('SELECT ' + publicUserFields + ' FROM users WHERE id = ?').get(id);
  return res.status(201).json({ success: true, message: 'Account created successfully.', user });
});

authRouter.put('/users/:id', authenticate, requireAdminAccount, (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ success: false, error: 'User not found.' });
  const { values, error } = accountInput(req.body || {}, existing);
  if (error) return res.status(400).json({ success: false, error });
  if (existing.id === req.user.id && values.role !== 'ADMIN') return res.status(400).json({ success: false, error: 'You cannot remove admin access from your own active account.' });
  if (existing.role === 'ADMIN' && values.role !== 'ADMIN' && db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN'").get().count <= 1) return res.status(400).json({ success: false, error: 'At least one admin account is required.' });
  if (conflictingIdentity(values, existing.id)) return res.status(409).json({ success: false, error: 'That Knox ID is already used by another account.' });
  const passwordHash = values.password ? bcrypt.hashSync(values.password, 10) : existing.password_hash;
  db.prepare(`UPDATE users SET username = ?, full_name = ?, role = ?, knox_id = ?, title = ?, password_hash = ? WHERE id = ?`).run(values.username, values.fullName, values.role, values.knoxId, values.title, passwordHash, existing.id);
  logAudit(values.password ? 'RESET_USER_PASSWORD' : 'UPDATE_USER', 'users', existing.id, { username: values.username, role: values.role, passwordChanged: Boolean(values.password) }, req.user);
  const user = db.prepare('SELECT ' + publicUserFields + ' FROM users WHERE id = ?').get(existing.id);
  return res.json({ success: true, message: values.password ? 'Password updated successfully.' : 'Account updated successfully.', user });
});

authRouter.delete('/users/:id', authenticate, requireAdminAccount, (req, res) => {
  const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found.' });
  if (user.id === req.user.id) return res.status(400).json({ success: false, error: 'You cannot delete your own active account.' });
  if (user.role === 'ADMIN' && db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN'").get().count <= 1) return res.status(400).json({ success: false, error: 'At least one admin account is required.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  logAudit('DELETE_USER', 'users', user.id, { username: user.username }, req.user);
  return res.json({ success: true, message: 'Account deleted successfully.' });
});
