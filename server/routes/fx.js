// FX broadcast — Phase 1 minimum viable
//
// POST /s/:id/fx       — trigger a sample (publish to Redis channel fx:{sid})
// GET  /s/:id/fx/stream — SSE; each connected client receives the fire events
//
// 客户端拿到事件后自行 quantize 到本地 cycle 边界播放 (见 index.html).
// 跨客户端不严格 sample-accurate (各自 Strudel 时钟独立), 但都 snap 到拍上, 听感够用.

import { EventEmitter } from "node:events";
import { redis } from "../lib/redis.js";

// === 单一全局 Redis 订阅连接 + 进程内事件总线 ===
// 多个 SSE 客户端共享: psubscribe("fx:*") 一次, 按 sid 路由
const fxBus = new EventEmitter();
fxBus.setMaxListeners(500);  // 一个 session 可能有多个观众标签页同时连
let _subscriberReady = null;

async function ensureSubscriber() {
  if (_subscriberReady) return _subscriberReady;
  _subscriberReady = (async () => {
    const sub = redis.duplicate();
    sub.on("error", (e) => console.error("[fx-sub]", e.message));
    await sub.psubscribe("fx:*");
    sub.on("pmessage", (_pattern, channel, message) => {
      // channel = "fx:{sid}"
      fxBus.emit(channel, message);
    });
    console.log("[fx] subscriber ready, listening on fx:*");
  })();
  return _subscriberReady;
}

// === per-session 速率限制 (in-memory token bucket) ===
// 防止单 session 被刷成洪水. 跨进程不严, 防滥用足够.
// XY pad 30Hz throttle 客户端已限, 这里给 60/s burst 100 留余地
const FX_RATE_PER_SEC = 60;
const FX_BURST = 100;
const _buckets = new Map();   // sid -> { tokens, lastRefill }

function tryConsumeFxToken(sid) {
  const now = Date.now();
  let b = _buckets.get(sid);
  if (!b) {
    b = { tokens: FX_BURST, lastRefill: now };
    _buckets.set(sid, b);
  }
  const elapsedSec = (now - b.lastRefill) / 1000;
  b.tokens = Math.min(FX_BURST, b.tokens + elapsedSec * FX_RATE_PER_SEC);
  b.lastRefill = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

// 偶尔清理过期 bucket (超过 5 分钟没活动)
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [sid, b] of _buckets) {
    if (b.lastRefill < cutoff) _buckets.delete(sid);
  }
}, 60_000).unref();

// === 校验 ===
const SAMPLE_NAME_RE = /^[a-zA-Z0-9_:.-]{1,60}$/;
const ALLOWED_QUANTIZE = new Set(["now", "next_8th", "next_quarter", "next_half", "next_bar"]);

function sanitizeBy(by) {
  if (typeof by !== "string") return "anon";
  return by.replace(/[^a-zA-Z0-9_一-鿿-]/g, "").slice(0, 20) || "anon";
}

// === 路由 ===
export default async function fxRoutes(fastify) {
  await ensureSubscriber();

  fastify.post("/s/:id/fx", async (req, reply) => {
    const { id } = req.params;
    if (!/^[a-zA-Z0-9_-]{6,20}$/.test(id)) {
      return reply.code(400).send({ error: "invalid_id" });
    }
    const { sample, quantize = "next_8th", by = "anon", gain, payload } = req.body || {};
    if (typeof sample !== "string" || !SAMPLE_NAME_RE.test(sample)) {
      return reply.code(400).send({ error: "invalid_sample", details: "sample name must match [a-zA-Z0-9_:.-]{1,60}" });
    }
    if (!ALLOWED_QUANTIZE.has(quantize)) {
      return reply.code(400).send({ error: "invalid_quantize", details: `must be one of: ${[...ALLOWED_QUANTIZE].join(", ")}` });
    }
    const safeGain = (typeof gain === "number" && gain >= 0 && gain <= 1.5) ? gain : null;
    // payload: 小 JSON object (granular XY/params 等), cap ~500 字符
    let safePayload = null;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const s = JSON.stringify(payload);
      if (s.length <= 500) safePayload = payload;
    }
    if (!tryConsumeFxToken(id)) {
      return reply.code(429).send({ error: "fx_rate_limited", details: `max ${FX_RATE_PER_SEC}/sec per session` });
    }
    const event = {
      sample,
      quantize,
      by: sanitizeBy(by),
      sentAt: Date.now(),
      ...(safeGain !== null ? { gain: safeGain } : {}),
      ...(safePayload ? { payload: safePayload } : {}),
    };
    await redis.publish(`fx:${id}`, JSON.stringify(event));
    return { ok: true, event };
  });

  fastify.get("/s/:id/fx/stream", (req, reply) => {
    const { id } = req.params;
    if (!/^[a-zA-Z0-9_-]{6,20}$/.test(id)) {
      reply.code(400).send({ error: "invalid_id" });
      return;
    }

    // 把 raw response 拿过来自己管 — Fastify 不再 send
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",          // nginx / nginx-proxy 不缓冲
    });
    res.write(`: connected sid=${id}\n\n`);

    const channel = `fx:${id}`;
    const listener = (msg) => {
      // SSE: 一行 `data: ...` + 空行结尾
      res.write(`data: ${msg}\n\n`);
    };
    fxBus.on(channel, listener);

    // 25s 心跳 — 防止中间任何 proxy idle 断连 (Cloudflare 100s, 远裕余度)
    const ping = setInterval(() => {
      try { res.write(`: ping\n\n`); } catch(_){}
    }, 25_000);

    const cleanup = () => {
      clearInterval(ping);
      fxBus.removeListener(channel, listener);
      try { res.end(); } catch(_){}
    };
    req.raw.on("close", cleanup);
    req.raw.on("error", cleanup);
  });
}
