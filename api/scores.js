import { Redis } from '@upstash/redis';

const KEY = 'pokequiz:attempts';

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Missing Redis env');
  return new Redis({ url, token });
}

function normName(n) {
  return String(n || '').trim().toLowerCase();
}

function timeToSeconds(t) {
  const parts = String(t || '').split(':').map(Number);
  if (parts.some(isNaN)) return Infinity;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Infinity;
}

// a es mejor que b si tiene mas aciertos, o igualando, menor tiempo
function isBetter(a, b) {
  if (a.correct !== b.correct) return a.correct > b.correct;
  const ta = timeToSeconds(a.time);
  const tb = timeToSeconds(b.time);
  if (ta !== tb) return ta < tb;
  return new Date(a.date) > new Date(b.date);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed, use GET' });
  }

  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 100);
    const redis = getRedis();
    // Leer todo lo guardado (max 200) para calcular el mejor por jugador
    const raw = await redis.lrange(KEY, 0, 199);
    const attempts = (raw || []).map((s) => {
      try {
        return typeof s === 'string' ? JSON.parse(s) : s;
      } catch {
        return null;
      }
    }).filter(Boolean);

    // Solo el mejor intento por jugador (nombre insensible a mayusculas/espacios)
    const bestByPlayer = new Map();
    for (const a of attempts) {
      const key = normName(a.name);
      if (!key) continue;
      const cur = bestByPlayer.get(key);
      if (!cur || isBetter(a, cur)) bestByPlayer.set(key, a);
    }
    const best = [...bestByPlayer.values()];

    // Orden: mas aciertos primero, empate -> menor tiempo
    best.sort((a, b) => (b.correct - a.correct) || (timeToSeconds(a.time) - timeToSeconds(b.time)));

    return res.status(200).json({ ok: true, count: best.length, attempts: best.slice(0, limit) });
  } catch (e) {
    console.error('GET /api/scores', e);
    return res.status(500).json({ ok: false, attempts: [], error: 'Redis no configurado.' });
  }
}
