import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

redis.on("error", (e) => console.error("[redis]", e.message));
redis.on("connect", () => console.log("[redis] connected", REDIS_URL));

export const TTL = parseInt(process.env.SESSION_TTL_SECONDS || "300", 10);

const KEY = (id) => `session:${id}`;
const COST_KEY = () => {
  const d = new Date();
  return `cost:${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const RL_GLOBAL = "ratelimit:global";
const RL_IP = (ip) => `ratelimit:ip:${ip}`;

// === session 操作 ===

export async function getSession(id) {
  const raw = await redis.get(KEY(id));
  if (!raw) return null;
  // 续命
  await redis.expire(KEY(id), TTL);
  try { return JSON.parse(raw); } catch { return null; }
}

export async function setSession(id, data) {
  await redis.set(KEY(id), JSON.stringify(data), "EX", TTL);
}

export async function createSession(id, opts = {}) {
  const data = {
    code: "",
    seq: 0,
    lastBy: null,
    lastAt: Date.now(),
    explanation: null,
    sourceTag: null,    // "own" | "cloud"
    // 创建时可锁定的会话级配置, AI 生成时一定遵守
    bpmLock: Number.isFinite(opts.bpm) && opts.bpm >= 40 && opts.bpm <= 240 ? Math.round(opts.bpm) : null,
    styleHint: typeof opts.style === "string" && opts.style.length <= 40 ? opts.style.trim() : null,
    customHint: typeof opts.custom === "string" && opts.custom.trim().length > 0
      ? opts.custom.trim().slice(0, 500) : null,
  };
  await setSession(id, data);
  return data;
}

export async function updateSession(id, patch) {
  const cur = await getSession(id);
  if (!cur) return null;
  const next = { ...cur, ...patch, seq: cur.seq + 1, lastAt: Date.now() };
  await setSession(id, next);
  return next;
}

// === 计费 ===

export async function addCost(usd) {
  return await redis.incrbyfloat(COST_KEY(), usd);
}

export async function getMonthCost() {
  const v = await redis.get(COST_KEY());
  return parseFloat(v || "0");
}

// === 限流 ===
// 用 Redis SET NX EX 实现 token bucket: 设置一个 key 带 TTL, 存在表示冷却中

export async function checkRateLimit(ip, { globalSec, perIpSec }) {
  const [globalExists, ipExists, globalTtl, ipTtl] = await Promise.all([
    redis.exists(RL_GLOBAL),
    redis.exists(RL_IP(ip)),
    redis.ttl(RL_GLOBAL),
    redis.ttl(RL_IP(ip)),
  ]);
  if (globalExists) return { ok: false, reason: "global", remainingSec: Math.max(1, globalTtl) };
  if (ipExists)     return { ok: false, reason: "per_ip", remainingSec: Math.max(1, ipTtl) };
  return { ok: true };
}

export async function consumeRateLimit(ip, { globalSec, perIpSec }) {
  await Promise.all([
    redis.set(RL_GLOBAL, "1", "EX", globalSec),
    redis.set(RL_IP(ip), "1", "EX", perIpSec),
  ]);
}

// 自带 LLM 路径: 仅 per-IP 防刷, 不计全局
export async function checkSelfRateLimit(ip, perIpSec) {
  const exists = await redis.exists(RL_IP(ip));
  if (exists) {
    const ttl = await redis.ttl(RL_IP(ip));
    return { ok: false, remainingSec: Math.max(1, ttl) };
  }
  return { ok: true };
}

export async function consumeSelfRateLimit(ip, perIpSec) {
  await redis.set(RL_IP(ip), "1", "EX", perIpSec);
}

// === 多轮对话历史 (per-session) ===
// 用 Redis List (RPUSH/LTRIM) 原子操作 — 多客户端并发 append 不丢失 (旧 JSON read-modify-write 有竞态)
const HIST_KEY = (id) => `history:${id}`;
const HIST_MAX_TURNS = 24;   // 12 个 user + 12 个 model
const HIST_RECENT_FULL = 12; // 最近 N 轮保留 model 完整 code, 更早只读时按需压缩

export async function getHistory(id) {
  const items = await redis.lrange(HIST_KEY(id), 0, -1);
  await redis.expire(HIST_KEY(id), TTL);
  const parsed = items.map(s => {
    try { return JSON.parse(s); } catch { return null; }
  }).filter(Boolean);
  // 读时按需压缩老 model 回复 (省 LLM token), 存储不变
  const recentStart = Math.max(0, parsed.length - HIST_RECENT_FULL);
  for (let i = 0; i < recentStart; i++) {
    const e = parsed[i];
    if (e.role === "model" && e.text && e.text.length > 200) {
      try {
        const p = JSON.parse(e.text);
        e.text = JSON.stringify({
          code: "// (omitted — earlier turn)",
          explanation: p.explanation || "",
          visual: "",
        });
      } catch(_){}
    }
  }
  return parsed;
}

export async function appendHistory(id, role, text) {
  // RPUSH + LTRIM 原子, 多 client 并发 append 全保留 (旧版 get→push→set 是 last-write-wins)
  const entry = JSON.stringify({ role, text });
  await redis.rpush(HIST_KEY(id), entry);
  await redis.ltrim(HIST_KEY(id), -HIST_MAX_TURNS, -1);
  await redis.expire(HIST_KEY(id), TTL);
}

export async function clearHistory(id) {
  await redis.del(HIST_KEY(id));
}

// === Session 锁 — 防多用户并发 LLM 写 race (last-writer-wins 历史/code 丢失) ===
// 锁是 per-session 的, 不同 session 之间不阻塞
const LOCK_KEY = (id) => `lock:session:${id}`;

export async function tryAcquireSessionLock(id, ttlMs = 12000) {
  // SET NX PX — 只在 key 不存在时设, ttl ms (自动过期防止进程崩溃留死锁)
  // ioredis 写法: redis.set(key, value, "PX", ttlMs, "NX")
  const result = await redis.set(LOCK_KEY(id), "1", "PX", ttlMs, "NX");
  return result === "OK";
}

export async function releaseSessionLock(id) {
  await redis.del(LOCK_KEY(id));
}

// 返回锁剩余 ms (-2 = 不存在, -1 = 无 ttl)
export async function getSessionLockTtl(id) {
  return await redis.pttl(LOCK_KEY(id));
}

// === stats ===

export async function statsSnapshot() {
  const sessionKeys = await redis.keys("session:*");
  return {
    activeSessions: sessionKeys.length,
    monthlySpentUSD: await getMonthCost(),
  };
}
