import bcrypt from 'bcryptjs';
import { getDb } from '../db.js';

const db = getDb();

const existing = db.prepare('SELECT COUNT(*) as cnt FROM users WHERE role = ?').get('super_admin');
if (existing.cnt > 0) {
  console.log('Super admin already exists, skipping seed.');
  process.exit(0);
}

// Seed default departments
const deps = ['技术部', '产品部', '运营部', '综合部', '未分配'];
for (const name of deps) {
  db.prepare('INSERT OR IGNORE INTO departments (name) VALUES (?)').run(name);
}

// Create super admin
const password = 'admin' + Math.random().toString(36).slice(2, 8);
const passwordHash = bcrypt.hashSync(password, 10);
const uid = 'u_admin_001';

db.prepare(`
  INSERT OR IGNORE INTO users (uid, name, password_hash, department, position, role, status, preset_password)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(uid, '系统管理员', passwordHash, '技术部', '系统管理员', 'super_admin', 'active', 1);

console.log('=== 超级管理员已创建 ===');
console.log(`UID:      ${uid}`);
console.log(`密码:     ${password}`);
console.log(`角色:     super_admin`);
console.log(`状态:     首次登录需修改密码`);
console.log('========================');
process.exit(0);
