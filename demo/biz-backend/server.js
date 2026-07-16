import express from 'express';
import cors from 'cors';
import { groupsRouter } from './routes/groups.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { membersRouter } from './routes/members.js';
import { authMiddleware, requireRole } from './middleware/auth.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/biz/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Auth routes (login/register) — no auth middleware
app.use('/api/biz/auth', authRouter);

// Group routes — require JWT auth
app.use('/api/biz/groups', authMiddleware, groupsRouter);

// User-groups listing — require JWT auth
app.get('/api/biz/users/:uid/groups', authMiddleware, (req, res, next) => {
  req.url = `/users/${req.params.uid}/groups`;
  groupsRouter(req, res, next);
});

// Admin routes — require admin role (super_admin or admin)
app.use('/api/biz/admin', authMiddleware, requireRole('super_admin', 'admin'), adminRouter);

// Member directory — any authenticated user
app.use('/api/biz/members', authMiddleware, membersRouter);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Biz backend listening on port ${PORT}`);
});
