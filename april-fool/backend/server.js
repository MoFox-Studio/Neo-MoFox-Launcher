'use strict';

const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── 上传目录 ──
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── CORS：只允许我们的域名 ──
app.use(cors({
  origin: ['https://nvzhuang.ikun114.top', 'http://localhost'],
  methods: ['POST', 'OPTIONS'],
}));

// ── multer：只接受图片，最大 5MB ──
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_SIZE     = 5 * 1024 * 1024; // 5 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req,  file, cb) => {
    // 随机文件名，保留原始扩展名
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只接受图片文件（JPEG/PNG/GIF/WEBP）'));
    }
  },
});

// ── POST /upload ──
app.post('/upload', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: '没有收到文件' });
  }

  console.log(`[${new Date().toISOString()}] 收到女装照片：${req.file.filename}  (${(req.file.size / 1024).toFixed(1)} KB)`);

  res.json({
    ok:      true,
    message: '审核中，密钥将于审核完成后发送',
  });
});

// ── 错误处理 ──
app.use((err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ ok: false, error: '文件超过 5MB 限制' });
  }
  res.status(400).json({ ok: false, error: err?.message || '上传失败' });
});

app.listen(PORT, () => {
  console.log(`女装接收服务器已启动：http://0.0.0.0:${PORT}`);
  console.log(`上传目录：${UPLOAD_DIR}`);
});
