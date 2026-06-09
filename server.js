const express = require('express');
const { createClient } = require('redis');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Railway's proxy
app.set('trust proxy', 1);

// REDIS
const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redis.on('error', (err) => console.error('Redis error:', err));
redis.connect().then(() => console.log('Redis connected'));

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST'],
}));

app.use(express.json({ limit: '10kb' }));

// Multer - store files in memory, max 10MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'text/plain',
      'application/zip',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  }
});

// Serve static files first
app.use(express.static('public'));

// Serve index.html with security headers
app.get('/', (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rate limiting
const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many secrets created. Try again in 15 minutes.' }
});

const viewLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Slow down.' }
});

// ENCRYPTION
const ALGO = 'aes-256-gcm';
const ENCRYPTION_KEY = Buffer.from(
  process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'),
  'hex'
);

function encryptBuffer(buffer) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    content: encrypted.toString('hex'),
    tag: tag.toString('hex')
  };
}

function decryptBuffer(encrypted) {
  const decipher = crypto.createDecipheriv(
    ALGO,
    ENCRYPTION_KEY,
    Buffer.from(encrypted.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.content, 'hex')),
    decipher.final()
  ]);
}

function encrypt(text) {
  return encryptBuffer(Buffer.from(text, 'utf8'));
}

function decrypt(encrypted) {
  return decryptBuffer(encrypted).toString('utf8');
}

function hashPassword(pass) {
  return crypto.createHash('sha256').update(pass + (process.env.PASS_SALT || 'justonce-salt')).digest('hex');
}

function genId() {
  return crypto.randomBytes(16).toString('base64url');
}

// ROUTES

// POST /api/secrets - create text secret
app.post('/api/secrets', createLimiter, async (req, res) => {
  try {
    const { text, mode, ttlSeconds, password } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Secret text is required.' });
    }
    if (text.length > 10000) {
      return res.status(400).json({ error: 'Secret too long (max 10,000 characters).' });
    }
    if (!['view', 'time', 'both'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode.' });
    }
    if ((mode === 'time' || mode === 'both') && (!ttlSeconds || ttlSeconds < 60 || ttlSeconds > 604800)) {
      return res.status(400).json({ error: 'TTL must be between 60s and 7 days.' });
    }

    const id = genId();
    const encrypted = encrypt(text);

    const payload = {
      type: 'text',
      encrypted,
      mode,
      passwordHash: password ? hashPassword(password) : null,
      createdAt: Date.now(),
    };

    const ttl = (mode === 'time' || mode === 'both') ? ttlSeconds : 604800;
    await redis.set('secret:' + id, JSON.stringify(payload), { EX: ttl });

    console.log('[CREATE TEXT] id=' + id + ' mode=' + mode);
    return res.status(201).json({ id });

  } catch (err) {
    console.error('[CREATE ERROR]', err.message);
    return res.status(500).json({ error: 'Failed to create secret.' });
  }
});

// POST /api/files - upload a file secret
app.post('/api/files', createLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const { mode, ttlSeconds, password } = req.body;

    if (!['view', 'time', 'both'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode.' });
    }
    if ((mode === 'time' || mode === 'both') && (!ttlSeconds || ttlSeconds < 60 || ttlSeconds > 604800)) {
      return res.status(400).json({ error: 'TTL must be between 60s and 7 days.' });
    }

    const id = genId();
    const encrypted = encryptBuffer(req.file.buffer);

    const payload = {
      type: 'file',
      encrypted,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      mode,
      passwordHash: password ? hashPassword(password) : null,
      createdAt: Date.now(),
    };

    const ttl = (mode === 'time' || mode === 'both') ? parseInt(ttlSeconds) : 604800;
    await redis.set('secret:' + id, JSON.stringify(payload), { EX: ttl });

    console.log('[CREATE FILE] id=' + id + ' file=' + req.file.originalname);
    return res.status(201).json({ id });

  } catch (err) {
    console.error('[FILE ERROR]', err.message);
    return res.status(500).json({ error: 'Failed to upload file.' });
  }
});

// GET /api/secrets/:id/meta
app.get('/api/secrets/:id/meta', viewLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[A-Za-z0-9_-]{20,30}$/.test(id)) {
      return res.status(404).json({ error: 'Not found.' });
    }

    const raw = await redis.get('secret:' + id);
    if (!raw) return res.status(404).json({ error: 'Secret not found or already destroyed.' });

    const payload = JSON.parse(raw);
    const ttl = await redis.ttl('secret:' + id);

    return res.json({
      exists: true,
      type: payload.type || 'text',
      filename: payload.filename || null,
      size: payload.size || null,
      mimetype: payload.mimetype || null,
      passwordProtected: !!payload.passwordHash,
      mode: payload.mode,
      ttl: ttl > 0 ? ttl : null,
    });

  } catch (err) {
    console.error('[META ERROR]', err.message);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/secrets/:id/reveal
app.post('/api/secrets/:id/reveal', viewLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!/^[A-Za-z0-9_-]{20,30}$/.test(id)) {
      return res.status(404).json({ error: 'Not found.' });
    }

    const raw = await redis.get('secret:' + id);
    if (!raw) return res.status(404).json({ error: 'Secret not found or already destroyed.' });

    const payload = JSON.parse(raw);

    if (payload.passwordHash) {
      if (!password) return res.status(401).json({ error: 'Password required.', passwordRequired: true });
      if (hashPassword(password) !== payload.passwordHash) {
        return res.status(401).json({ error: 'Incorrect password.' });
      }
    }

    if (payload.mode === 'view' || payload.mode === 'both') {
      await redis.del('secret:' + id);
    }

    if (payload.type === 'file') {
      const fileBuffer = decryptBuffer(payload.encrypted);
      console.log('[REVEAL FILE] id=' + id);
      res.setHeader('Content-Disposition', 'attachment; filename="' + payload.filename + '"');
      res.setHeader('Content-Type', payload.mimetype);
      res.setHeader('X-Secret-Mode', payload.mode);
      return res.send(fileBuffer);
    } else {
      const text = decrypt(payload.encrypted);
      console.log('[REVEAL TEXT] id=' + id);
      return res.json({ text, mode: payload.mode });
    }

  } catch (err) {
    console.error('[REVEAL ERROR]', err.message);
    return res.status(500).json({ error: 'Failed to reveal secret.' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log('JustOnce running on port ' + PORT));
