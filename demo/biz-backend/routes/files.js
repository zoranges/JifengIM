import express, { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getDb } from '../db.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// 上传目录
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

function userUploadDir(uid) {
  const dir = path.join(UPLOADS_DIR, 'personal', uid);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function sanitizeFilename(name) {
  // 保留中文和常见字符，替换危险字符
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 200);
}

function fileCategory(mime) {
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'doc';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ─── 上传文件 ───────────────────────────────────────────────
router.post('/upload',
  express.raw({ type: 'multipart/form-data', limit: '55mb' }),
  (req, res, next) => {
  try {
    const uid = req.user.uid;

    // express.raw() middleware 已解析 body 为 Buffer
    const buf = req.body;
    if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
      return res.status(400).json({ error: '未选择文件' });
    }

    if (buf.length > MAX_FILE_SIZE) {
      return res.status(413).json({ error: '文件超过 50MB 限制' });
    }

    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: '需要 multipart/form-data' });
    }

    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      return res.status(400).json({ error: '无效的上传格式' });
    }

    const parts = parseMultipart(buf, boundary);
    const filePart = parts.find(p => p.name === 'file');
    if (!filePart || !filePart.data || filePart.data.length === 0) {
      return res.status(400).json({ error: '未选择文件' });
    }

    const originalName = filePart.filename || 'file';
    const safeName = sanitizeFilename(originalName);
    const ext = path.extname(safeName);
    const baseName = path.basename(safeName, ext);
    const id = crypto.randomUUID();
    const storedName = `${id}-${baseName}${ext}`;

    const dir = userUploadDir(uid);
    const filePath = path.join(dir, storedName);
    fs.writeFileSync(filePath, filePart.data);

    const mimeType = filePart.contentType || 'application/octet-stream';
    const size = filePart.data.length;

    // 写入数据库
    const db = getDb();
    const relPath = `/files/personal/${uid}/${storedName}`;
    db.prepare(
      'INSERT INTO personal_files (id, uid, name, size, mime_type, file_path) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, uid, originalName, size, mimeType, relPath);

    res.json({
      ok: true,
      file: {
        id,
        name: originalName,
        size,
        sizeText: formatSize(size),
        mimeType,
        fileType: fileCategory(mimeType),
        url: relPath,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 简易 multipart 解析（不依赖第三方库）
function parseMultipart(buf, boundary) {
  const parts = [];
  const boundaryBuf = Buffer.from('--' + boundary);
  const endBoundary = Buffer.from('--' + boundary + '--');
  const crlf = Buffer.from('\r\n\r\n');
  const crlf2 = Buffer.from('\r\n');

  let pos = 0;
  while (pos < buf.length) {
    // 找 boundary 开始
    const boundaryPos = buf.indexOf(boundaryBuf, pos);
    if (boundaryPos === -1) break;
    const headerStart = boundaryPos + boundaryBuf.length + 2; // skip \r\n
    if (headerStart >= buf.length) break;

    // 找 header 结束 (\r\n\r\n)
    const headerEnd = buf.indexOf(crlf, headerStart);
    if (headerEnd === -1) break;

    const headerText = buf.slice(headerStart, headerEnd).toString();
    const dataStart = headerEnd + 4;

    // 找下一个 boundary 作为 data 结束
    const nextBoundary = buf.indexOf(boundaryBuf, dataStart);
    let dataEnd;
    if (nextBoundary !== -1) {
      // data ends before the next boundary's \r\n
      dataEnd = nextBoundary - 2;
    } else {
      // 找结束 boundary
      const endPos = buf.indexOf(endBoundary, dataStart);
      if (endPos !== -1) {
        dataEnd = endPos - 2;
      } else {
        dataEnd = buf.length - 2;
      }
    }

    const data = buf.slice(dataStart, dataEnd);

    // 解析 header
    const nameMatch = headerText.match(/name="([^"]+)"/);
    const filenameMatch = headerText.match(/filename="([^"]+)"/);
    const contentTypeMatch = headerText.match(/Content-Type:\s*(.+)/i);

    parts.push({
      name: nameMatch ? nameMatch[1] : '',
      filename: filenameMatch ? filenameMatch[1] : null,
      contentType: contentTypeMatch ? contentTypeMatch[1].trim() : null,
      data,
    });

    pos = dataEnd + 2;
    if (nextBoundary === -1) break;
    pos = nextBoundary;
  }

  return parts;
}

// ─── 文件列表 ────────────────────────────────────────────────
router.get('/', (req, res, next) => {
  try {
    const uid = req.user.uid;
    const db = getDb();
    const {
      search = '',
      category_id = '',
      sort = 'created_at',
      order = 'desc',
      page = '1',
      limit = '50',
    } = req.query;

    const validSort = ['name', 'size', 'created_at'].includes(sort) ? sort : 'created_at';
    const validOrder = order === 'asc' ? 'ASC' : 'DESC';
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const offset = (pageNum - 1) * limitNum;

    let where = 'WHERE f.uid = ?';
    const params = [uid];

    if (search) {
      where += ' AND f.name LIKE ?';
      params.push(`%${search}%`);
    }
    if (category_id) {
      where += ' AND f.category_id = ?';
      params.push(category_id);
    }

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM personal_files f ${where}`).get(...params);
    const total = countRow.total;

    const files = db.prepare(
      `SELECT f.id, f.name, f.size, f.mime_type, f.file_path, f.category_id, f.created_at, f.uid,
              COALESCE(u.name, f.uid) as uploader_name
       FROM personal_files f
       LEFT JOIN users u ON u.uid = f.uid
       ${where}
       ORDER BY f.${validSort} ${validOrder}
       LIMIT ? OFFSET ?`
    ).all(...params, limitNum, offset);

    res.json({
      files: files.map(f => ({
        id: f.id,
        name: f.name,
        size: f.size,
        sizeText: formatSize(f.size),
        mimeType: f.mime_type,
        fileType: fileCategory(f.mime_type),
        url: f.file_path,
        categoryId: f.category_id,
        uploaderUid: f.uid,
        uploaderName: f.uploader_name,
        createdAt: f.created_at,
      })),
      total,
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    next(err);
  }
});

// ─── 分类 CRUD ───────────────────────────────────────────────

// 创建分类
router.post('/categories', (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: '分类名称不能为空' });
    }
    const db = getDb();
    const id = crypto.randomUUID();
    const maxOrder = db.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) as maxOrd FROM personal_file_categories WHERE uid = ?'
    ).get(uid);

    db.prepare(
      'INSERT INTO personal_file_categories (id, uid, name, sort_order) VALUES (?, ?, ?, ?)'
    ).run(id, uid, String(name).trim(), maxOrder.maxOrd + 1);

    res.json({ ok: true, category: { id, name: String(name).trim(), sortOrder: maxOrder.maxOrd + 1 } });
  } catch (err) {
    next(err);
  }
});

// 列出分类（含文件数）
router.get('/categories', (req, res, next) => {
  try {
    const uid = req.user.uid;
    const db = getDb();
    const categories = db.prepare(
      'SELECT id, name, sort_order, created_at FROM personal_file_categories WHERE uid = ? ORDER BY sort_order'
    ).all(uid);

    const result = categories.map(cat => {
      const count = db.prepare(
        'SELECT COUNT(*) as cnt FROM personal_files WHERE uid = ? AND category_id = ?'
      ).get(uid, cat.id);
      return {
        id: cat.id,
        name: cat.name,
        sortOrder: cat.sort_order,
        fileCount: count.cnt,
        createdAt: cat.created_at,
      };
    });

    // 同时返回各类型的文件数
    const rawCounts = db.prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN mime_type LIKE 'image/%' THEN 1 ELSE 0 END) as images,
         SUM(CASE WHEN mime_type LIKE 'video/%' THEN 1 ELSE 0 END) as videos,
         SUM(CASE WHEN mime_type LIKE 'audio/%' THEN 1 ELSE 0 END) as audios,
         SUM(CASE WHEN mime_type NOT LIKE 'image/%' AND mime_type NOT LIKE 'video/%' AND mime_type NOT LIKE 'audio/%' THEN 1 ELSE 0 END) as docs
       FROM personal_files WHERE uid = ?`
    ).get(uid);

    res.json({
      categories: result,
      counts: {
        total: rawCounts.total,
        images: rawCounts.images,
        videos: rawCounts.videos,
        audios: rawCounts.audios,
        docs: rawCounts.docs,
      },
    });
  } catch (err) {
    next(err);
  }
});

// 重命名分类
router.patch('/categories/:id', (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: '分类名称不能为空' });
    }
    const db = getDb();
    const cat = db.prepare('SELECT * FROM personal_file_categories WHERE id = ? AND uid = ?').get(req.params.id, uid);
    if (!cat) return res.status(404).json({ error: '分类不存在' });

    db.prepare('UPDATE personal_file_categories SET name = ? WHERE id = ?').run(String(name).trim(), req.params.id);
    res.json({ ok: true, category: { id: cat.id, name: String(name).trim() } });
  } catch (err) {
    next(err);
  }
});

// 删除分类（文件移回未分类）
router.delete('/categories/:id', (req, res, next) => {
  try {
    const uid = req.user.uid;
    const db = getDb();
    const cat = db.prepare('SELECT * FROM personal_file_categories WHERE id = ? AND uid = ?').get(req.params.id, uid);
    if (!cat) return res.status(404).json({ error: '分类不存在' });

    // 将该分类下的文件设为未分类
    db.prepare('UPDATE personal_files SET category_id = NULL WHERE category_id = ? AND uid = ?').run(req.params.id, uid);
    // 删除分类
    db.prepare('DELETE FROM personal_file_categories WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── 文件下载（原名） ──────────────────────────────────────
router.get('/:id/download', (req, res, next) => {
  try {
    const uid = req.user.uid;
    const db = getDb();
    const file = db.prepare('SELECT * FROM personal_files WHERE id = ? AND uid = ?').get(req.params.id, uid);
    if (!file) return res.status(404).json({ error: '文件不存在' });

    // 磁盘路径：file_path 格式为 /files/personal/{uid}/{storedName}
    const diskRelPath = file.file_path.replace(/^\/files\//, '');
    const absPath = path.join(UPLOADS_DIR, diskRelPath);

    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ error: '文件已从磁盘删除' });
    }

    const stat = fs.statSync(absPath);
    const originalName = file.name;

    // RFC 5987 编码文件名（支持中文等非 ASCII 字符）
    const encodedName = encodeURIComponent(originalName);
    // ASCII fallback 兼容旧浏览器
    const asciiName = originalName.replace(/[^\x20-\x7E]/g, '_');

    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`
    );

    const stream = fs.createReadStream(absPath);
    stream.on('error', (err) => {
      console.error('文件流读取失败:', absPath, err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: '文件读取失败' });
      }
    });
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

// ─── 文件详情 ────────────────────────────────────────────────
router.get('/:id', (req, res, next) => {
  try {
    const uid = req.user.uid;
    const db = getDb();
    const file = db.prepare('SELECT * FROM personal_files WHERE id = ? AND uid = ?').get(req.params.id, uid);
    if (!file) return res.status(404).json({ error: '文件不存在' });

    res.json({
      id: file.id,
      name: file.name,
      size: file.size,
      sizeText: formatSize(file.size),
      mimeType: file.mime_type,
      fileType: fileCategory(file.mime_type),
      url: file.file_path,
      categoryId: file.category_id,
      createdAt: file.created_at,
    });
  } catch (err) {
    next(err);
  }
});

// ─── 删除文件 ────────────────────────────────────────────────
router.delete('/:id', (req, res, next) => {
  try {
    const uid = req.user.uid;
    const db = getDb();
    const file = db.prepare('SELECT * FROM personal_files WHERE id = ? AND uid = ?').get(req.params.id, uid);
    if (!file) return res.status(404).json({ error: '文件不存在' });

    // 删除磁盘文件 (file_path 是 nginx URL: /files/personal/uid/name)
    const diskRelPath = file.file_path.replace(/^\/files\//, '');
    const absPath = path.join(UPLOADS_DIR, diskRelPath);
    try {
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    } catch (e) {
      // 磁盘删除失败不阻塞 DB 操作
      console.error('删除磁盘文件失败:', absPath, e.message);
    }

    db.prepare('DELETE FROM personal_files WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── 更新文件（重命名 / 移动分类） ───────────────────────────
router.patch('/:id', (req, res, next) => {
  try {
    const uid = req.user.uid;
    const db = getDb();
    const file = db.prepare('SELECT * FROM personal_files WHERE id = ? AND uid = ?').get(req.params.id, uid);
    if (!file) return res.status(404).json({ error: '文件不存在' });

    const { name, category_id } = req.body;
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(String(name).trim());
    }
    if (category_id !== undefined) {
      if (category_id === null || category_id === '') {
        updates.push('category_id = NULL');
      } else {
        // 验证分类属于该用户
        const cat = db.prepare('SELECT id FROM personal_file_categories WHERE id = ? AND uid = ?').get(category_id, uid);
        if (!cat) return res.status(400).json({ error: '分类不存在' });
        updates.push('category_id = ?');
        params.push(category_id);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '无更新字段' });
    }

    params.push(req.params.id);
    db.prepare(`UPDATE personal_files SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT * FROM personal_files WHERE id = ?').get(req.params.id);
    res.json({
      ok: true,
      file: {
        id: updated.id,
        name: updated.name,
        size: updated.size,
        sizeText: formatSize(updated.size),
        mimeType: updated.mime_type,
        fileType: fileCategory(updated.mime_type),
        url: updated.file_path,
        categoryId: updated.category_id,
        createdAt: updated.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

export { router as filesRouter };
