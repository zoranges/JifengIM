import { Router } from 'express';
import { getDb } from '../db.js';
import { nanoid } from 'nanoid';
import {
  wkCreateChannel,
  wkAddSubscriber,
  wkRemoveSubscriber,
  wkDeleteChannel,
} from '../wkclient.js';

const CHANNEL_TYPE_GROUP = 2;

export const groupsRouter = Router();

function requireBody(req, res, fields) {
  for (const f of fields) {
    if (!req.body[f]) {
      res.status(400).json({ error: `缺少必填字段: ${f}` });
      return false;
    }
  }
  return true;
}

function isGroupOwnerOrAdmin(db, groupId, uid, userRole) {
  if (userRole === 'super_admin' || userRole === 'admin') return true;
  const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND uid = ?').get(groupId, uid);
  return member && member.role === 1;
}

function getNextRoomNumber(db) {
  const row = db.prepare("SELECT MAX(CAST(room_number AS INTEGER)) as maxNum FROM groups WHERE room_number != ''").get();
  return String((row.maxNum || 0) + 1);
}

// POST /api/biz/groups/create
groupsRouter.post('/create', async (req, res) => {
  if (!requireBody(req, res, ['name', 'nickname'])) return;
  const uid = req.user.uid;
  const role = req.user.role;
  const { name, nickname } = req.body;

  if (role !== 'super_admin' && role !== 'admin' && role !== 'project_lead') {
    return res.status(403).json({ error: '普通员工没有创建群聊的权限，请联系项目负责人或管理员' });
  }

  const db = getDb();
  const groupId = 'g' + nanoid(10);
  const roomNumber = getNextRoomNumber(db);

  try {
    db.prepare('INSERT INTO groups (id, name, owner_uid, room_number) VALUES (?, ?, ?, ?)').run(groupId, name.trim(), uid, roomNumber);
    db.prepare('INSERT INTO group_members (group_id, uid, nickname, role) VALUES (?, ?, ?, 1)').run(groupId, uid, nickname);

    await wkCreateChannel(groupId, CHANNEL_TYPE_GROUP);
    await wkAddSubscriber(groupId, CHANNEL_TYPE_GROUP, uid);
  } catch (err) {
    db.prepare('DELETE FROM group_members WHERE group_id = ? AND uid = ?').run(groupId, uid);
    db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
    res.status(500).json({ error: err.message });
    return;
  }

  res.json({ group_id: groupId, name: name.trim(), room_number: roomNumber, owner_uid: uid });
});

// POST /api/biz/groups/join
groupsRouter.post('/join', async (req, res) => {
  if (!requireBody(req, res, ['group_id', 'nickname'])) return;
  const uid = req.user.uid;
  const { group_id, nickname } = req.body;
  const db = getDb();

  const group = db.prepare('SELECT id, name FROM groups WHERE id = ?').get(group_id);
  if (!group) {
    res.status(404).json({ error: '群组不存在' });
    return;
  }

  const existing = db.prepare('SELECT * FROM group_members WHERE group_id = ? AND uid = ?').get(group_id, uid);
  if (existing) {
    res.status(409).json({ error: '你已在群中' });
    return;
  }

  db.prepare('INSERT INTO group_members (group_id, uid, nickname, role) VALUES (?, ?, ?, 0)').run(group_id, uid, nickname);
  await wkAddSubscriber(group_id, CHANNEL_TYPE_GROUP, uid);

  res.json({ group_id: group.id, name: group.name });
});

// POST /api/biz/groups/leave
groupsRouter.post('/leave', async (req, res) => {
  if (!requireBody(req, res, ['group_id'])) return;
  const uid = req.user.uid;
  const { group_id } = req.body;
  const db = getDb();

  const member = db.prepare('SELECT * FROM group_members WHERE group_id = ? AND uid = ?').get(group_id, uid);
  if (!member) {
    res.status(404).json({ error: '你不在该群中' });
    return;
  }

  if (member.role === 1) {
    res.status(400).json({ error: '群主不能退出，请先转让群主或解散群' });
    return;
  }

  db.prepare('DELETE FROM group_members WHERE group_id = ? AND uid = ?').run(group_id, uid);
  await wkRemoveSubscriber(group_id, CHANNEL_TYPE_GROUP, uid);

  res.json({ ok: true });
});

// GET /api/biz/groups/search?q=xxx
groupsRouter.get('/search', (req, res) => {
  const q = req.query.q || '';
  const db = getDb();
  const group = db.prepare('SELECT id, name, owner_uid, room_number, created_at FROM groups WHERE id = ?').get(q);
  if (!group) {
    res.status(404).json({ error: '群组不存在' });
    return;
  }
  const memberCount = db.prepare('SELECT COUNT(*) as count FROM group_members WHERE group_id = ?').get(q);
  res.json({ ...group, member_count: memberCount.count });
});

// GET /api/biz/groups/with-members — all groups with members for current user
groupsRouter.get('/with-members', (req, res) => {
  const db = getDb();
  const uid = req.user.uid;

  const groups = db.prepare(`
    SELECT g.id, g.name, g.owner_uid, g.room_number, g.created_at, gm.nickname as my_nickname, gm.role as my_role
    FROM group_members gm JOIN groups g ON gm.group_id = g.id
    WHERE gm.uid = ?
    ORDER BY g.created_at DESC
  `).all(uid);

  const groupIds = groups.map(g => g.id);
  if (groupIds.length === 0) return res.json([]);

  const placeholders = groupIds.map(() => '?').join(',');
  const members = db.prepare(`
    SELECT gm.group_id, gm.uid, gm.nickname, gm.role, gm.joined_at
    FROM group_members gm
    WHERE gm.group_id IN (${placeholders})
    ORDER BY gm.role DESC, gm.joined_at ASC
  `).all(...groupIds);

  const membersByGroup = {};
  for (const m of members) {
    if (!membersByGroup[m.group_id]) membersByGroup[m.group_id] = [];
    membersByGroup[m.group_id].push(m);
  }

  const result = groups.map(g => ({
    group_id: g.id,
    group_name: g.name,
    owner_uid: g.owner_uid,
    room_number: g.room_number,
    my_nickname: g.my_nickname,
    my_role: g.my_role,
    members: membersByGroup[g.id] || [],
  }));

  res.json(result);
});

// GET /api/biz/groups/:id
groupsRouter.get('/:id', (req, res) => {
  const db = getDb();
  const group = db.prepare('SELECT id, name, owner_uid, room_number, created_at FROM groups WHERE id = ?').get(req.params.id);
  if (!group) {
    res.status(404).json({ error: '群组不存在' });
    return;
  }
  const members = db.prepare('SELECT uid, nickname, role, joined_at FROM group_members WHERE group_id = ?').all(req.params.id);
  res.json({ ...group, members });
});

// PUT /api/biz/groups/:id  (rename, owner/admin only)
groupsRouter.put('/:id', (req, res) => {
  if (!requireBody(req, res, ['name'])) return;
  const uid = req.user.uid;
  const db = getDb();

  if (!isGroupOwnerOrAdmin(db, req.params.id, uid, req.user.role)) {
    res.status(403).json({ error: '只有群主或管理员可以修改群信息' });
    return;
  }

  db.prepare("UPDATE groups SET name = ?, updated_at = datetime('now') WHERE id = ?").run(req.body.name, req.params.id);
  res.json({ ok: true, name: req.body.name });
});

// DELETE /api/biz/groups/:id  (disband, owner/admin only)
groupsRouter.delete('/:id', async (req, res) => {
  const uid = req.user.uid;
  const db = getDb();

  if (!isGroupOwnerOrAdmin(db, req.params.id, uid, req.user.role)) {
    res.status(403).json({ error: '只有群主或管理员可以解散群' });
    return;
  }

  await wkDeleteChannel(req.params.id, CHANNEL_TYPE_GROUP);
  db.prepare('DELETE FROM group_members WHERE group_id = ?').run(req.params.id);
  db.prepare('DELETE FROM groups WHERE id = ?').run(req.params.id);

  res.json({ ok: true });
});

// GET /api/biz/groups/:id/members
groupsRouter.get('/:id/members', (req, res) => {
  const db = getDb();
  const members = db.prepare('SELECT uid, nickname, role, joined_at FROM group_members WHERE group_id = ?').all(req.params.id);
  res.json(members);
});

// PUT /api/biz/groups/:id/nickname
groupsRouter.put('/:id/nickname', (req, res) => {
  if (!requireBody(req, res, ['nickname'])) return;
  const uid = req.user.uid;
  const db = getDb();

  const result = db.prepare('UPDATE group_members SET nickname = ? WHERE group_id = ? AND uid = ?').run(req.body.nickname, req.params.id, uid);
  if (result.changes === 0) {
    res.status(404).json({ error: '你不在该群中' });
    return;
  }
  res.json({ ok: true, nickname: req.body.nickname });
});

// POST /api/biz/groups/:id/kick  (owner/admin only)
groupsRouter.post('/:id/kick', async (req, res) => {
  if (!requireBody(req, res, ['target_uid'])) return;
  const uid = req.user.uid;
  const { target_uid } = req.body;
  const db = getDb();

  if (uid === target_uid) {
    res.status(400).json({ error: '不能踢自己' });
    return;
  }

  if (!isGroupOwnerOrAdmin(db, req.params.id, uid, req.user.role)) {
    res.status(403).json({ error: '只有群主或管理员可以踢人' });
    return;
  }

  db.prepare('DELETE FROM group_members WHERE group_id = ? AND uid = ?').run(req.params.id, target_uid);
  await wkRemoveSubscriber(req.params.id, CHANNEL_TYPE_GROUP, target_uid);

  res.json({ ok: true });
});

// POST /api/biz/groups/:id/invite — invite members (owner/admin only)
groupsRouter.post('/:id/invite', async (req, res) => {
  if (!requireBody(req, res, ['uids'])) return;
  const uid = req.user.uid;
  const { uids, nicknames } = req.body;
  const db = getDb();

  if (!Array.isArray(uids) || uids.length === 0) {
    return res.status(400).json({ error: '请选择要邀请的成员' });
  }

  if (!isGroupOwnerOrAdmin(db, req.params.id, uid, req.user.role)) {
    res.status(403).json({ error: '只有群主或管理员可以邀请成员' });
    return;
  }

  const group = db.prepare('SELECT id, name FROM groups WHERE id = ?').get(req.params.id);
  if (!group) {
    res.status(404).json({ error: '群组不存在' });
    return;
  }

  const result = { invited: [], skipped: [] };
  for (let i = 0; i < uids.length; i++) {
    const inviteeUid = uids[i];
    const existing = db.prepare('SELECT uid FROM group_members WHERE group_id = ? AND uid = ?').get(req.params.id, inviteeUid);
    if (existing) {
      result.skipped.push(inviteeUid);
      continue;
    }
    const nickname = (nicknames && nicknames[i]) || inviteeUid;
    db.prepare('INSERT INTO group_members (group_id, uid, nickname, role) VALUES (?, ?, ?, 0)').run(req.params.id, inviteeUid, nickname);
    db.prepare('INSERT OR IGNORE INTO group_invitations (group_id, inviter_uid, invitee_uid, status) VALUES (?, ?, ?, ?)').run(req.params.id, uid, inviteeUid, 'accepted');
    await wkAddSubscriber(req.params.id, CHANNEL_TYPE_GROUP, inviteeUid);
    result.invited.push(inviteeUid);
  }

  res.json(result);
});

// POST /api/biz/groups/:id/pin — pin a message
groupsRouter.post('/:id/pin', (req, res) => {
  if (!requireBody(req, res, ['message_id', 'client_msg_no'])) return;
  const uid = req.user.uid;
  const { message_id, message_seq, client_msg_no, content_preview, message_type, from_uid } = req.body;
  const db = getDb();

  const member = db.prepare('SELECT * FROM group_members WHERE group_id = ? AND uid = ?').get(req.params.id, uid);
  if (!member) { res.status(403).json({ error: '只有群成员可以置顶消息' }); return; }

  const existing = db.prepare('SELECT * FROM pinned_messages WHERE group_id = ? AND message_id = ?').get(req.params.id, message_id);
  if (existing) { res.status(409).json({ error: '消息已置顶' }); return; }

  const result = db.prepare(
    'INSERT INTO pinned_messages (group_id, message_id, message_seq, client_msg_no, pinned_by_uid, content_preview, message_type, from_uid) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(req.params.id, message_id, message_seq || 0, client_msg_no, uid, content_preview || '', message_type || 0, from_uid || '');

  const row = db.prepare('SELECT * FROM pinned_messages WHERE id = ?').get(result.lastInsertRowid);
  res.json(row);
});

// POST /api/biz/groups/:id/unpin — unpin a message
groupsRouter.post('/:id/unpin', (req, res) => {
  if (!requireBody(req, res, ['message_id'])) return;
  const uid = req.user.uid;
  const { message_id } = req.body;
  const db = getDb();

  const member = db.prepare('SELECT * FROM group_members WHERE group_id = ? AND uid = ?').get(req.params.id, uid);
  if (!member) { res.status(403).json({ error: '只有群成员可以取消置顶' }); return; }

  const pinned = db.prepare('SELECT * FROM pinned_messages WHERE group_id = ? AND message_id = ?').get(req.params.id, message_id);
  if (!pinned) { res.status(404).json({ error: '置顶消息不存在' }); return; }

  if (pinned.pinned_by_uid !== uid && member.role !== 1 && req.user.role !== 'super_admin' && req.user.role !== 'admin') {
    res.status(403).json({ error: '只有群主或置顶者可以取消置顶' }); return;
  }

  db.prepare('DELETE FROM pinned_messages WHERE group_id = ? AND message_id = ?').run(req.params.id, message_id);
  res.json({ ok: true });
});

// GET /api/biz/groups/:id/pins — list pinned messages
groupsRouter.get('/:id/pins', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT pm.*, gm.nickname AS pinned_by_nickname
    FROM pinned_messages pm
    LEFT JOIN group_members gm ON pm.pinned_by_uid = gm.uid AND pm.group_id = gm.group_id
    WHERE pm.group_id = ?
    ORDER BY pm.created_at ASC
  `).all(req.params.id);
  res.json(rows);
});

// GET /api/biz/users/:uid/groups
groupsRouter.get('/users/:uid/groups', (req, res) => {
  if (req.params.uid !== req.user.uid) {
    return res.status(403).json({ error: '无权访问' });
  }
  const db = getDb();
  const rows = db.prepare(`
    SELECT g.id, g.name, g.owner_uid, g.room_number, g.created_at, gm.nickname, gm.role
    FROM group_members gm
    JOIN groups g ON gm.group_id = g.id
    WHERE gm.uid = ?
    ORDER BY g.created_at DESC
  `).all(req.params.uid);
  res.json(rows);
});
