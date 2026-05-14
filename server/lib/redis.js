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

export async function createSession(id) {
  const data = {
    code: "",
    seq: 0,
    lastBy: null,
    lastAt: Date.now(),
    explanation: null,
    sourceTag: null,    // "own" | "cloud"
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

// === stats ===

export async function statsSnapshot() {
  const sessionKeys = await redis.keys("session:*");
  return {
    activeSessions: sessionKeys.length,
    monthlySpentUSD: await getMonthCost(),
  };
}
