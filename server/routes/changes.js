import { Router } from 'express';
import { db, logAudit } from '../db/database.js';
import { latestSavedChange, undoSavedChange } from '../lib/savedChangeUndo.js';
export const changesRouter = Router();
changesRouter.get('/latest', (req, res) => res.json({ success: true, change: latestSavedChange(db, req.user) }));
changesRouter.post('/undo', (req, res) => {
  try {
    const change = undoSavedChange(db, req.body?.changeId, req.user);
    logAudit('UNDO_SAVED_CHANGE', 'system', change.id, { description: change.description }, req.user);
    return res.json({ success: true, message: 'Last saved change reverted.' });
  } catch (error) { return res.status(409).json({ success: false, error: error.message }); }
});
