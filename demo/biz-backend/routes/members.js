import { Router } from 'express';
import { getDb } from '../db.js';

export const membersRouter = Router();

// GET /api/biz/members/directory — all active members with optional department filter
membersRouter.get('/directory', (req, res) => {
  const db = getDb();
  const { department } = req.query;

  let sql = "SELECT uid, name, department, position, role, created_at FROM users WHERE status = 'active'";
  const params = [];

  if (department) {
    sql += ' AND department = ?';
    params.push(department);
  }

  sql += ' ORDER BY role ASC, department ASC, name ASC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// GET /api/biz/members/directory/:uid — single member detail
membersRouter.get('/directory/:uid', (req, res) => {
  const db = getDb();
  const user = db.prepare(
    "SELECT uid, name, department, position, role, created_at FROM users WHERE uid = ? AND status = 'active'"
  ).get(req.params.uid);
  if (!user) return res.status(404).json({ error: '成员不存在或已离职' });
  res.json(user);
});
