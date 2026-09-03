import { Redis } from '@upstash/redis';

const KEY = 'pokequiz:attempts';

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Missing Redis env');
  return new Redis({ url, token });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed, use GET' });
  }

  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 100);
    const redis = getRedis();
    const raw = await redis.lrange(KEY, 0, limit - 1);
    const attempts = (raw || []).map((s) => {
      try {
        return typeof s === 'string' ? JSON.parse(s) : s;
      } catch {
        return null;
      }
    }).filter(Boolean);

    // Orden: mejor % primero, luego menor tiempo
    attempts.sort((a, b) => (b.percent - a.percent) || String(a.time).localeCompare(String(b.time)));

    return res.status(200).json({ ok: true, count: attempts.length, attempts });
  } catch (e) {
    console.error('GET /api/scores', e);
    return res.status(500).json({ ok: false, attempts: [], error: 'Redis no configurado.' });
  }
}
