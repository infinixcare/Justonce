const express = require('express');
const { createClient } = require('redis');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── REDIS ───
const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redis.on('error', (err) => console.error('Redis error:', err));
redis.connect().then(() => console.log('Redis connected'));

// ─── MIDDLEWARE ───
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST'],
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.static('public'));

// Rate limiting
const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  message: { error: 'Too many secrets created. Try again in 15 minutes.' }
});

const viewLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Slow down.' }
});

// ─── ENCRYPTION ───
const ALGO = 'aes-256-gcm';
const ENCRYPTION_KEY = Buffer.from(
  process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'),
  'hex'
);

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    content: encrypted.toString('hex'),
    tag: tag.toString('hex')
  };
}

function decrypt(encrypted) {
  const decipher = crypto.createDecipheriv(
    ALGO,
    ENCRYPTION_KEY,
    Buffer.from(encrypted.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted.content, 'hex')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
}

function hashPassword(pass) {
  return crypto.createHash('sha256').update(pass + process.env.PASS_SALT || 'justonce-salt').digest('hex');
}

function genId() {
  return crypto.randomBytes(16).toString('base64url');
}

// ─── ROUTES ───

// POST /api/secrets — create a new secret
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
      encrypted,
      mode,
      passwordHash: password ? hashPassword(password) : null,
      createdAt: Date.now(),
    };

    // Store in Redis
    if (mode === 'time' || mode === 'both') {
      await redis.set(`secret:${id}`, JSON.stringify(payload), { EX: ttlSeconds });
    } else {
      // view-only: keep for 7 days max as a safety net
      await redis.set(`secret:${id}`, JSON.stringify(payload), { EX: 604800 });
    }

    console.log(`[CREATE] id=${id} mode=${mode}`);
    return res.status(201).json({ id });

  } catch (err) {
    console.error('[CREATE ERROR]', err.message);
    return res.status(500).json({ error: 'Failed to create secret.' });
  }
});

// GET /api/secrets/:id/meta — check if secret exists + if password protected (no content)
app.get('/api/secrets/:id/meta', viewLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[A-Za-z0-9_-]{20,30}$/.test(id)) {
      return res.status(404).json({ error: 'Not found.' });
    }

    const raw = await redis.get(`secret:${id}`);
    if (!raw) return res.status(404).json({ error: 'Secret not found or already destroyed.' });

    const payload = JSON.parse(raw);
    const ttl = await redis.ttl(`secret:${id}`);

    return res.json({
      exists: true,
      passwordProtected: !!payload.passwordHash,
      mode: payload.mode,
      ttl: ttl > 0 ? ttl : null,
    });

  } catch (err) {
    console.error('[META ERROR]', err.message);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/secrets/:id/reveal — reveal and destroy the secret
app.post('/api/secrets/:id/reveal', viewLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!/^[A-Za-z0-9_-]{20,30}$/.test(id)) {
      return res.status(404).json({ error: 'Not found.' });
    }

    const raw = await redis.get(`secret:${id}`);
    if (!raw) return res.status(404).json({ error: 'Secret not found or already destroyed.' });

    const payload = JSON.parse(raw);

    // Password check
    if (payload.passwordHash) {
      if (!password) return res.status(401).json({ error: 'Password required.', passwordRequired: true });
      if (hashPassword(password) !== payload.passwordHash) {
        return res.status(401).json({ error: 'Incorrect password.' });
      }
    }

    // Decrypt
    const text = decrypt(payload.encrypted);

    // DESTROY — delete immediately after reading (for view/both modes)
    if (payload.mode === 'view' || payload.mode === 'both') {
      await redis.del(`secret:${id}`);
    }

    console.log(`[REVEAL] id=${id} mode=${payload.mode}`);
    return res.json({ text, mode: payload.mode });

  } catch (err) {
    console.error('[REVEAL ERROR]', err.message);
    return res.status(500).json({ error: 'Failed to reveal secret.' });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`JustOnce running on port ${PORT}`));
