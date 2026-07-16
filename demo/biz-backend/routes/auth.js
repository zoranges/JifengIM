import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { getDb } from '../db.js';
import { generateToken, authMiddleware } from '../middleware/auth.js';
import { wkGetUserToken } from '../wkclient.js';

export const authRouter = Router();

const INVITE_CODE = '123123';

function requireBody(req, res, fields) {
  for (const f of fields) {
    if (!req.body[f]) {
      res.status(400).json({ error: `缺少必填字段: ${f}` });
      return false;
    }
  }
  return true;
}

// POST /api/biz/auth/register
authRouter.post('/register', async (req, res) => {
  if (!requireBody(req, res, ['password', 'name', 'invite_code'])) return;
  const { password, name, invite_code } = req.body;

  if (invite_code !== INVITE_CODE) {
    return res.status(400).json({ error: '邀请码错误' });
  }
  if (!name || name.trim().length === 0 || name.length > 32) {
    return res.status(400).json({ error: '显示名称需1-32个字符' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: '密码至少6位' });
  }

  const db = getDb();
  // Auto-generate unique UID
  let uid;
  let attempts = 0;
  do {
    uid = 'u' + nanoid(10);
    if (++attempts > 10) {
      uid = 'u' + nanoid(16);
      break;
    }
  } while (db.prepare('SELECT uid FROM users WHERE uid = ?').get(uid));

  const passwordHash = await bcrypt.hash(password, 10);
  db.prepare('INSERT INTO users (uid, name, password_hash) VALUES (?, ?, ?)').run(uid, name.trim(), passwordHash);

  let imToken = password;
  try {
    const imResp = await wkGetUserToken(uid, password);
    if (typeof imResp === 'string') {
      imToken = imResp;
    } else if (imResp && imResp.token) {
      imToken = imResp.token;
    }
  } catch { /* fall back to password as IM token */ }

  const jwtToken = generateToken(uid);
  res.json({ uid, name: name.trim(), token: jwtToken, im_token: imToken });
});

// POST /api/biz/auth/login
authRouter.post('/login', async (req, res) => {
  if (!requireBody(req, res, ['uid', 'password'])) return;
  const { uid, password } = req.body;

  const db = getDb();
  const user = db.prepare('SELECT uid, name, password_hash FROM users WHERE uid = ?').get(uid);
  if (!user) {
    return res.status(401).json({ error: 'UID或密码错误' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'UID或密码错误' });
  }

  let imToken = password;
  try {
    const imResp = await wkGetUserToken(uid, password);
    if (typeof imResp === 'string') {
      imToken = imResp;
    } else if (imResp && imResp.token) {
      imToken = imResp.token;
    }
  } catch { /* fall back to password as IM token */ }

  const jwtToken = generateToken(uid);
  res.json({ uid: user.uid, name: user.name, token: jwtToken, im_token: imToken });
});

// GET /api/biz/auth/me
authRouter.get('/me', authMiddleware, (req, res) => {
  const db = getDb();
  const user = db.prepare(`
    SELECT uid, name, department, position, role, status, preset_password, created_at
    FROM users WHERE uid = ?
  `).get(req.user.uid);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  res.json(user);
});

// PUT /api/biz/auth/profile
authRouter.put('/profile', authMiddleware, (req, res) => {
  if (!requireBody(req, res, ['name'])) return;
  const { name } = req.body;
  if (!name || name.trim().length === 0 || name.length > 32) {
    return res.status(400).json({ error: '显示名称需1-32个字符' });
  }

  const db = getDb();
  db.prepare("UPDATE users SET name = ?, updated_at = datetime('now') WHERE uid = ?").run(name.trim(), req.user.uid);
  res.json({ uid: req.user.uid, name: name.trim() });
});

// PUT /api/biz/auth/password
authRouter.put('/password', authMiddleware, async (req, res) => {
  if (!requireBody(req, res, ['new_password'])) return;
  const { old_password, new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: '新密码至少6位' });
  }

  const db = getDb();
  const user = db.prepare('SELECT password_hash, preset_password FROM users WHERE uid = ?').get(req.user.uid);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  // Skip old password check if this is a preset password
  if (!user.preset_password) {
    if (!old_password) {
      return res.status(400).json({ error: '请输入原密码' });
    }
    const valid = await bcrypt.compare(old_password, user.password_hash);
    if (!valid) {
      return res.status(400).json({ error: '原密码错误' });
    }
  }

  const newHash = await bcrypt.hash(new_password, 10);
  db.prepare("UPDATE users SET password_hash = ?, preset_password = 0, updated_at = datetime('now') WHERE uid = ?").run(newHash, req.user.uid);
  res.json({ ok: true });
});
