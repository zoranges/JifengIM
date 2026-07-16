import { Router } from 'express';
import { getDb } from '../db.js';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { wkAddSubscriber, wkRemoveSubscriber, wkDeleteChannel } from '../wkclient.js';

const CHANNEL_TYPE_GROUP = 2;

export const adminRouter = Router();

function requireBody(req, res, fields) {
  for (const f of fields) {
    if (!req.body[f]) {
      res.status(400).json({ error: `缺少必填字段: ${f}` });
      return false;
    }
  }
  return true;
}

const VALID_ROLES = ['super_admin', 'admin', 'project_lead', 'employee'];

// GET /api/biz/admin/stats — user statistics
adminRouter.get('/stats', (req, res) => {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const active = db.prepare("SELECT COUNT(*) as c FROM users WHERE status = 'active'").get().c;
  const departed = db.prepare("SELECT COUNT(*) as c FROM users WHERE status = 'departed'").get().c;
  const admins = db.prepare("SELECT COUNT(*) as c FROM users WHERE role IN ('super_admin','admin')").get().c;
  res.json({ total, active, departed, admins });
});

// POST /api/biz/admin/users — create employee account
adminRouter.post('/users', (req, res) => {
  if (!requireBody(req, res, ['name', 'password'])) return;
  const { name, password, department, position, role } = req.body;

  if (!name || name.trim().length === 0 || name.length > 32) {
    return res.status(400).json({ error: '显示名称需1-32个字符' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: '密码至少6位' });
  }
  const userRole = role || 'employee';
  if (!VALID_ROLES.includes(userRole)) {
    return res.status(400).json({ error: '无效的角色值' });
  }

  const db = getDb();
  let uid;
  let attempts = 0;
  do {
    uid = 'u' + nanoid(10);
    if (++attempts > 10) {
      uid = 'u' + nanoid(16);
      break;
    }
  } while (db.prepare('SELECT uid FROM users WHERE uid = ?').get(uid));

  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO users (uid, name, password_hash, department, position, role, status, preset_password)
    VALUES (?, ?, ?, ?, ?, ?, 'active', 1)
  `).run(uid, name.trim(), passwordHash, department || '', position || '', userRole);

  res.json({ uid, name: name.trim(), department: department || '', position: position || '', role: userRole, status: 'active', preset_password: 1 });
});

// GET /api/biz/admin/users — list users with filters, pagination, and sorting
adminRouter.get('/users', (req, res) => {
  const db = getDb();
  const { status, department, role, search, page, page_size, sort_by, sort_dir } = req.query;

  let where = 'WHERE 1=1';
  const params = [];

  if (status) { where += ' AND status = ?'; params.push(status); }
  if (department) { where += ' AND department = ?'; params.push(department); }
  if (role) { where += ' AND role = ?'; params.push(role); }
  if (search) { where += ' AND (name LIKE ? OR uid LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM users ${where}`).get(...params);
  const total = countRow.total;

  const allowedSorts = { name: 'name', department: 'department', role: 'role', created_at: 'created_at' };
  const sortCol = allowedSorts[sort_by] || 'created_at';
  const dir = sort_dir === 'asc' ? 'ASC' : 'DESC';

  const pageNum = Math.max(1, parseInt(page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(page_size) || 20));
  const offset = (pageNum - 1) * pageSize;

  const rows = db.prepare(
    `SELECT uid, name, department, position, role, status, preset_password, created_at FROM users ${where} ORDER BY ${sortCol} ${dir} LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset);

  res.json({ rows, total, page: pageNum, page_size: pageSize });
});

// GET /api/biz/admin/users/:uid — single user detail
adminRouter.get('/users/:uid', (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT uid, name, department, position, role, status, preset_password, created_at FROM users WHERE uid = ?').get(req.params.uid);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json(user);
});

// PUT /api/biz/admin/users/:uid — update user profile
adminRouter.put('/users/:uid', (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE uid = ?').get(req.params.uid);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const { name, department, position, role } = req.body;

  if (name !== undefined && name.trim()) {
    db.prepare("UPDATE users SET name = ?, updated_at = datetime('now') WHERE uid = ?").run(name.trim(), req.params.uid);
  }
  if (department !== undefined) {
    db.prepare("UPDATE users SET department = ?, updated_at = datetime('now') WHERE uid = ?").run(department, req.params.uid);
  }
  if (position !== undefined) {
    db.prepare("UPDATE users SET position = ?, updated_at = datetime('now') WHERE uid = ?").run(position, req.params.uid);
  }
  if (role !== undefined) {
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: '无效的角色值' });
    if (role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: '只有超级管理员可以设定超级管理员角色' });
    }
    db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE uid = ?").run(role, req.params.uid);
  }

  const updated = db.prepare('SELECT uid, name, department, position, role, status, preset_password, created_at FROM users WHERE uid = ?').get(req.params.uid);
  res.json(updated);
});

// POST /api/biz/admin/users/:uid/reset-password
adminRouter.post('/users/:uid/reset-password', (req, res) => {
  if (!requireBody(req, res, ['new_password'])) return;
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: '密码至少6位' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE uid = ?').get(req.params.uid);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare("UPDATE users SET password_hash = ?, preset_password = 1, updated_at = datetime('now') WHERE uid = ?").run(hash, req.params.uid);
  res.json({ ok: true, uid: req.params.uid });
});

// POST /api/biz/admin/users/:uid/depart — mark user as departed
adminRouter.post('/users/:uid/depart', async (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE uid = ?').get(req.params.uid);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (user.status === 'departed') return res.status(400).json({ error: '该用户已处于离职状态' });

  const transferLog = [];

  const ownedGroups = db.prepare(`
    SELECT g.id, g.name FROM groups g
    JOIN group_members gm ON g.id = gm.group_id
    WHERE gm.uid = ? AND gm.role = 1
  `).all(req.params.uid);

  for (const group of ownedGroups) {
    const successor = db.prepare(`
      SELECT gm.uid, gm.nickname FROM group_members gm
      JOIN users u ON gm.uid = u.uid
      WHERE gm.group_id = ? AND gm.uid != ? AND u.status = 'active'
      ORDER BY gm.joined_at ASC
      LIMIT 1
    `).get(group.id, req.params.uid);

    if (successor) {
      db.prepare('UPDATE group_members SET role = 1 WHERE group_id = ? AND uid = ?').run(group.id, successor.uid);
      db.prepare("UPDATE groups SET owner_uid = ?, updated_at = datetime('now') WHERE id = ?").run(successor.uid, group.id);
      transferLog.push({ group_id: group.id, group_name: group.name, new_owner: successor.uid, action: 'transferred' });
    } else {
      try { await wkDeleteChannel(group.id, CHANNEL_TYPE_GROUP); } catch {}
      db.prepare('DELETE FROM group_members WHERE group_id = ?').run(group.id);
      db.prepare('DELETE FROM groups WHERE id = ?').run(group.id);
      transferLog.push({ group_id: group.id, group_name: group.name, action: 'dissolved' });
    }
  }

  const randomPwd = nanoid(16);
  const hash = bcrypt.hashSync(randomPwd, 10);
  db.prepare("UPDATE users SET password_hash = ?, status = 'departed', updated_at = datetime('now') WHERE uid = ?").run(hash, req.params.uid);

  res.json({ ok: true, uid: req.params.uid, transfer_log: transferLog });
});

// POST /api/biz/admin/users/:uid/reinstate — reinstate departed user
adminRouter.post('/users/:uid/reinstate', (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE uid = ?').get(req.params.uid);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (user.status !== 'departed') return res.status(400).json({ error: '该用户不在离职状态' });

  if (!requireBody(req, res, ['new_password'])) return;
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: '密码至少6位' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare("UPDATE users SET password_hash = ?, status = 'active', preset_password = 1, updated_at = datetime('now') WHERE uid = ?").run(hash, req.params.uid);
  res.json({ ok: true, uid: req.params.uid, status: 'active' });
});

// GET /api/biz/admin/departments
adminRouter.get('/departments', (req, res) => {
  const db = getDb();
  const deps = db.prepare(`
    SELECT d.id, d.name, d.created_at, COUNT(u.uid) as user_count
    FROM departments d
    LEFT JOIN users u ON u.department = d.name AND u.status = 'active'
    GROUP BY d.id
    ORDER BY d.id ASC
  `).all();
  res.json(deps);
});

// POST /api/biz/admin/departments
adminRouter.post('/departments', (req, res) => {
  if (!requireBody(req, res, ['name'])) return;
  const { name } = req.body;
  if (!name.trim()) return res.status(400).json({ error: '部门名称不能为空' });

  const db = getDb();
  try {
    const result = db.prepare('INSERT INTO departments (name) VALUES (?)').run(name.trim());
    res.json({ id: result.lastInsertRowid, name: name.trim() });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: '部门名称已存在' });
    }
    throw err;
  }
});

// PUT /api/biz/admin/departments/:id
adminRouter.put('/departments/:id', (req, res) => {
  if (!requireBody(req, res, ['name'])) return;
  const { name } = req.body;
  if (!name.trim()) return res.status(400).json({ error: '部门名称不能为空' });

  const db = getDb();
  const dep = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
  if (!dep) return res.status(404).json({ error: '部门不存在' });

  const oldName = dep.name;
  db.prepare('UPDATE departments SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  db.prepare('UPDATE users SET department = ? WHERE department = ?').run(name.trim(), oldName);

  res.json({ id: Number(req.params.id), name: name.trim() });
});

// DELETE /api/biz/admin/departments/:id
adminRouter.delete('/departments/:id', (req, res) => {
  const db = getDb();
  const dep = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
  if (!dep) return res.status(404).json({ error: '部门不存在' });

  db.prepare("UPDATE users SET department = '未分配', updated_at = datetime('now') WHERE department = ?").run(dep.name);
  db.prepare('DELETE FROM departments WHERE id = ?').run(req.params.id);

  res.json({ ok: true });
});
