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
// 存最近 N 轮 [user, model] 让 LLM 看得到前面在聊什么 — 用户能说"再暗一点"了
const HIST_KEY = (id) => `history:${id}`;
const HIST_MAX_TURNS = 24;   // 12 个 user + 12 个 model = 12 个 exchange
const HIST_RECENT_FULL = 12; // 最近 6 轮保留完整 code, 更早只留 user 文字+简短摘要

export async function getHistory(id) {
  const raw = await redis.get(HIST_KEY(id));
  if (!raw) return [];
  await redis.expire(HIST_KEY(id), TTL);
  try { return JSON.parse(raw); } catch { return []; }
}

export async function appendHistory(id, role, text) {
  const cur = await getHistory(id);
  cur.push({ role, text });
  // 超过最近窗口的 model 回复, 压缩成只保留 explanation, 省 token
  if (cur.length > HIST_RECENT_FULL) {
    for (let i = 0; i < cur.length - HIST_RECENT_FULL; i++) {
      const entry = cur[i];
      if (entry.role === "model" && entry.text && entry.text.length > 200) {
        try {
          const parsed = JSON.parse(entry.text);
          // 旧的 model 回复只留 explanation, code 用占位
          entry.text = JSON.stringify({
            code: "// (omitted — earlier turn)",
            explanation: parsed.explanation || "",
          });
        } catch(_){}
      }
    }
  }
  while (cur.length > HIST_MAX_TURNS) cur.shift();
  await redis.set(HIST_KEY(id), JSON.stringify(cur), "EX", TTL);
}

export async function clearHistory(id) {
  await redis.del(HIST_KEY(id));
}

// === stats ===

export async function statsSnapshot() {
  const sessionKeys = await redis.keys("session:*");
  return {
    activeSessions: sessionKeys.length,
    monthlySpentUSD: await getMonthCost(),
  };
}
