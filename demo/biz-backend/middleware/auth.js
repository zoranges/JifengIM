import jwt from 'jsonwebtoken';
import { getDb } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'wukongim-dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';

export function generateToken(uid) {
  return jwt.sign({ uid }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录或令牌已过期' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { uid: decoded.uid };
  } catch {
    return res.status(401).json({ error: '未登录或令牌已过期' });
  }

  const db = getDb();
  const user = db.prepare('SELECT status, role FROM users WHERE uid = ?').get(req.user.uid);
  if (!user) {
    return res.status(401).json({ error: '用户不存在' });
  }
  if (user.status === 'departed') {
    return res.status(403).json({ error: '账号已标记为离职状态，无法登录' });
  }

  req.user.role = user.role;
  req.user.status = user.status;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  };
}
