import {
  getSession, updateSession,
  addCost, getMonthCost,
  getHistory, appendHistory,
} from "../lib/redis.js";
import { validate } from "../lib/validate.js";
import { callGemini, estimateCost } from "../lib/llm.js";
import { SYSTEM_PROMPT } from "../lib/prompt.js";

const BUDGET_CAP = parseFloat(process.env.MONTHLY_CAP_USD || "30");
const MAX_RETRY = parseInt(process.env.LLM_MAX_RETRY || "1", 10); // 校验失败后最多再调 1 次

export default async function textRoutes(fastify, opts) {
  const validNames = opts.validNames || { validBanks: new Set(), validSounds: new Set() };

  fastify.put("/s/:id/text", async (req, reply) => {
    const { id } = req.params;
    if (!/^[a-zA-Z0-9_-]{6,20}$/.test(id)) {
      return reply.code(400).send({ error: "invalid_id" });
    }
    const cur = await getSession(id);
    if (!cur) return reply.code(404).send({ error: "session_expired" });

    const { text, by = "anon" } = req.body || {};
    if (typeof text !== "string" || text.length === 0 || text.length > 500) {
      return reply.code(400).send({ error: "prompt_too_long_or_empty" });
    }

    // 预算 cap 是唯一的滥用兜底
    const spent = await getMonthCost();
    if (spent >= BUDGET_CAP) {
      return reply.code(429).send({ reason: "budget_exceeded", remainingSec: -1 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return reply.code(500).send({ error: "server_no_llm_key" });
    }

    const bpm = extractBpm(cur.code) || 120;
    const systemPrompt = SYSTEM_PROMPT
      .replace("__BPM__", String(bpm))
      .replace("__CODE__", cur.code || "// (empty)");

    // 拉最近 5 轮对话历史 — 让 LLM 听得懂 "再暗一点" / "贝斯换成模拟" 这种增量请求
    const history = await getHistory(id);

    let lastError = null;
    let lastCode = null;
    let retried = 0;

    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      try {
        const { code, explanation, tokensIn, tokensOut } = await callGemini({
          apiKey,
          systemPrompt,
          userText: text,
          history,
          retryWith: attempt > 0 ? { prevCode: lastCode, errorMsg: lastError } : null,
        });

        // 计费
        const usd = estimateCost({ tokensIn, tokensOut });
        await addCost(usd);

        // 校验
        const v = validate(code, validNames);
        if (!v.ok) {
          lastError = v.errors.join("; ");
          lastCode = code;
          retried = attempt + 1;
          if (attempt >= MAX_RETRY) {
            return reply.code(400).send({
              error: "code_invalid_after_retry",
              details: lastError,
              retried,
            });
          }
          continue;  // 重试
        }

        // 成功 — 把这一轮 user/model 追加到 history 给下次用
        // model 端存返回的 JSON 字符串 (跟 LLM 当时输出的格式一致, 模型下次能"读懂自己的话")
        await appendHistory(id, "user", text);
        await appendHistory(id, "model", JSON.stringify({ code, explanation }));

        const next = await updateSession(id, {
          code,
          explanation,
          lastBy: sanitizeBy(by),
          sourceTag: "cloud",
        });

        return {
          seq: next.seq,
          code,
          explanation,
          retried,
        };
      } catch (e) {
        if (attempt >= MAX_RETRY) {
          return reply.code(502).send({ error: "llm_error", details: e.message });
        }
        lastError = e.message;
      }
    }
  });
}

function extractBpm(code) {
  const m = code?.match(/setcpm\(\s*(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?\s*\)/);
  if (!m) return null;
  const n = parseFloat(m[1]), d = m[2] ? parseFloat(m[2]) : 1;
  return Math.round((n / d) * 4);
}

function sanitizeBy(by) {
  if (typeof by !== "string") return "anon";
  return by.replace(/[^a-zA-Z0-9_一-鿿-]/g, "").slice(0, 20) || "anon";
}
