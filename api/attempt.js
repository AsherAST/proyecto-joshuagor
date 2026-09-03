import { Redis } from '@upstash/redis';

const KEY = 'pokequiz:attempts';
const MAX_STORED = 200;

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Missing Redis env: UPSTASH_REDIS_REST_URL/TOKEN o KV_REST_API_URL/TOKEN');
  return new Redis({ url, token });
}

function isValidMode(m) {
  return m === 'ordered' || m === 'random' || m === 'list';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed, use POST' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const name = String(body.name || '').trim().slice(0, 20);
    const mode = String(body.mode || '');
    const correct = Number(body.correct);
    const wrong = Number(body.wrong);
    const total = Number(body.total);
    const time = String(body.time || '').slice(0, 16);
    const percent = Number(body.percent);

    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Nombre requerido (min 2 caracteres)' });
    }
    if (!isValidMode(mode)) {
      return res.status(400).json({ error: 'Modo invalido' });
    }
    if (!Number.isFinite(correct) || !Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: 'Datos invalidos' });
    }

    const attempt = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      mode,
      correct,
      wrong: Number.isFinite(wrong) ? wrong : total - correct,
      total,
      percent: Number.isFinite(percent) ? percent : Math.round((correct / total) * 100),
      time: time || '00:00',
      date: new Date().toISOString()
    };

    const redis = getRedis();
    await redis.lpush(KEY, JSON.stringify(attempt));
    await redis.ltrim(KEY, 0, MAX_STORED - 1);

    return res.status(200).json({ ok: true, attempt });
  } catch (e) {
    console.error('POST /api/attempt', e);
    return res.status(500).json({ error: 'Redis no configurado. Conecta Upstash en Vercel y redeploya.' });
  }
}
