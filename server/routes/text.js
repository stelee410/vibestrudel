import {
  getSession, updateSession,
  addCost, getMonthCost,
  getHistory, appendHistory,
  tryAcquireSessionLock, releaseSessionLock, getSessionLockTtl,
} from "../lib/redis.js";
import { validate, validateHydra } from "../lib/validate.js";
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

    // === Per-session 串行化锁 — 防止多用户并发 LLM 调用导致 last-writer-wins 历史/code 丢失 ===
    const lockAcquired = await tryAcquireSessionLock(id, 15000);  // 15s ttl 兜底 (LLM 通常 3-8s)
    if (!lockAcquired) {
      const ttlMs = await getSessionLockTtl(id);
      return reply.code(429).send({
        reason: "session_busy",
        error: "session_busy",
        details: "another user is generating in this session",
        retry_after_ms: Math.max(500, ttlMs > 0 ? ttlMs : 2000),
      });
    }

    // 之后无论何种 return / throw 都必须释放锁; 用闭包包一层
    try {
      return await processGeneration();
    } finally {
      await releaseSessionLock(id);
    }

    async function processGeneration() {
    // BPM 优先级: session.bpmLock (创建时锁死) > 当前 code 解析出来的 > 120
    const bpm = cur.bpmLock || extractBpm(cur.code) || 120;
    const curState = extractCurrentState(cur.code);

    // Continuity policy — 让 AI 知道现在有听众在听, 默认是"变奏"不是"重做"
    const continuityPolicy = curState.isEmpty
      ? `== CONTINUITY ==
This is the FIRST pattern of the session. No music is playing yet. Compose from scratch to fulfill the user's intent.`
      : `== CONTINUITY POLICY — read this carefully ==
A live audience is hearing the pattern shown in CURRENT STATE below. Your new code REPLACES it at the next cycle boundary.
If the new code wildly differs (different BPM, different scale, totally different voices), listeners hear an abrupt cut — bad for jam quality.

DEFAULT MODE: VARIATION (not full replacement)
  ✓ Keep BPM identical (unless user explicitly asks for tempo change)
  ✓ Keep the same scale/key (or close — modal interchange/relative is OK)
  ✓ Keep at least ONE anchor voice from current code (the kick, the bass, the pad, etc.)
  ✓ Maintain similar voice count (don't drop from 6 to 2 unless asked for "sparser/simpler")
  ✓ Add / remove / modify other voices to fulfill the user intent
  ✓ Visual stays the same (same .pianoroll/.scope etc.) unless user changes visual

EXCEPT explicit fresh-start signals — then you may freely diverge:
  "重来 / 重新开始 / 全新一段 / 换一种风格 / start over / fresh / new vibe / change genre"
  (but session BPM lock and STYLE HINT below still override if set)

When user is vague ("再来点 / 再变一变 / make it interesting"), TREAT IT AS VARIATION.`;

    // Session-level 硬约束 (创建时锁的)
    const sessionConstraints = [];
    if (cur.bpmLock) {
      sessionConstraints.push(
        `== HARD SESSION CONSTRAINT — BPM is LOCKED at ${cur.bpmLock} ==
The session creator chose BPM=${cur.bpmLock}. NEVER change it. Always emit setcpm(${cur.bpmLock}/4) — no matter what the user requests.`
      );
    }
    if (cur.styleHint) {
      sessionConstraints.push(
        `== SESSION STYLE HINT — "${cur.styleHint}" ==
This session has a stylistic theme: ${cur.styleHint}. Anchor every generation in this aesthetic. The user can still ask for variations, but stay within the family.`
      );
    }
    if (cur.customHint) {
      sessionConstraints.push(
        `== SESSION CUSTOM RULES (set by the room creator, applies to ALL generations) ==
${cur.customHint}

Treat this as a strict creative brief — every subsequent generation must respect these rules.
If the user request conflicts with these rules, the session creator's rules win.`
      );
    }

    // 把 SYSTEM_PROMPT 模板的 __CODE__ 替换成 (current state 摘要 + 原始代码), 让 AI 既看结构也看 raw
    const currentStateBlock = renderCurrentStateBlock(curState, bpm);
    const codeBlock = curState.isEmpty
      ? "(empty)"
      : "```\n" + cur.code + "\n```";
    const systemPrompt = SYSTEM_PROMPT
      .replace("__BPM__", String(bpm))
      .replace("__CODE__", `${currentStateBlock}\n\nFull source:\n${codeBlock}\n\n${continuityPolicy}`)
      + (sessionConstraints.length ? "\n\n" + sessionConstraints.join("\n\n") : "");

    // 拉最近 5 轮对话历史 — 让 LLM 听得懂 "再暗一点" / "贝斯换成模拟" 这种增量请求
    const history = await getHistory(id);

    let lastError = null;
    let lastCode = null;
    let retried = 0;

    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      try {
        const { code, explanation, visual, tokensIn, tokensOut } = await callGemini({
          apiKey,
          systemPrompt,
          userText: text,
          history,
          retryWith: attempt > 0 ? { prevCode: lastCode, errorMsg: lastError } : null,
        });

        // 计费
        const usd = estimateCost({ tokensIn, tokensOut });
        await addCost(usd);

        // 校验主代码
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

        // 校验 visual (Hydra) — 失败不重试, 直接丢弃 visual 但保留 code (音频比视觉重要)
        let safeVisual = "";
        if (visual && typeof visual === "string" && visual.trim()) {
          const v2 = visual.trim();
          // 拒 trivial "什么都不画" 的 hydra — 这种会全屏覆盖黑色
          const TRIVIAL = /^\s*(solid\s*\(\s*0\s*,\s*0\s*,\s*0[^)]*\)\.out\(\)|hush\s*\(\s*\)|render\s*\(\s*\))\s*;?\s*$/i;
          if (TRIVIAL.test(v2)) {
            console.warn("[validate] hydra trivial (solid/hush/render no-op), dropping");
          } else {
            const vv = validateHydra(v2);
            if (vv.ok) {
              safeVisual = v2;
            } else {
              console.warn(`[validate] hydra rejected: ${vv.errors.join("; ")}`);
            }
          }
        }

        // 成功 — 把这一轮 user/model 追加到 history 给下次用
        await appendHistory(id, "user", text);
        await appendHistory(id, "model", JSON.stringify({ code, explanation, visual: safeVisual }));

        const next = await updateSession(id, {
          code,
          explanation,
          visual: safeVisual,
          lastBy: sanitizeBy(by),
          sourceTag: "cloud",
        });

        return {
          seq: next.seq,
          code,
          explanation,
          visual: safeVisual,
          retried,
        };
      } catch (e) {
        if (attempt >= MAX_RETRY) {
          return reply.code(502).send({ error: "llm_error", details: e.message });
        }
        lastError = e.message;
      }
    }
    }   // 关闭 processGeneration
  });
}

function extractBpm(code) {
  const m = code?.match(/setcpm\(\s*(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?\s*\)/);
  if (!m) return null;
  const n = parseFloat(m[1]), d = m[2] ? parseFloat(m[2]) : 1;
  return Math.round((n / d) * 4);
}

// 从当前代码里抽取结构骨架, 提供给 LLM 做连续性参考
function extractCurrentState(code) {
  if (!code || !code.trim()) return { isEmpty: true };
  const f = { isEmpty: false };

  // scale/key
  const scaleM = code.match(/\.scale\(["']([^"']+)["']\)/);
  if (scaleM) f.scale = scaleM[1];

  // drum banks (去重)
  const banks = new Set();
  for (const m of code.matchAll(/\.bank\(["']([^"']+)["']\)/g)) banks.add(m[1]);
  if (banks.size) f.banks = [...banks];

  // voice 数量
  f.voiceCount = (code.match(/\bs\(/g) || []).length + (code.match(/\bnote\(/g) || []).length;

  // 元素
  f.hasDrums = /\bs\(["'][^"']*\b(bd|sd|hh|oh|cp|cr|rd|sh|tb|rim|lt|mt|ht)\b/.test(code);
  f.hasMelody = /\bnote\(/.test(code);
  f.hasBass = /note\(["'][^"']*[a-g]?[01]\b/i.test(code);   // 含 c1 / g0 / eb1 等低八度
  f.hasPad = /\.attack\(\s*(?:[2-9]|1\.[5-9])/.test(code);   // attack >= 1.5s 的通常是 pad

  // 视觉
  const visM = code.match(/\.(pianoroll|punchcard|scope|fscope|spectrum|spiral|pitchwheel|wordfall)\(/);
  if (visM) f.visual = visM[1];

  return f;
}

// 把抽取的 state 渲染成给 LLM 看的简短摘要
function renderCurrentStateBlock(state, bpm) {
  if (state.isEmpty) {
    return `== CURRENT STATE ==\nBPM: ${bpm}\n(no code yet — this is the first generation, free to compose anything that fits the user's intent)`;
  }
  const lines = [
    `== CURRENT STATE — playing right now, listeners are hearing this ==`,
    `BPM:        ${bpm}`,
    state.scale ? `Scale/key:  ${state.scale}` : `Scale/key:  (none specified, free-key)`,
    state.banks ? `Drum banks: ${state.banks.join(", ")}` : `Drum banks: (none — using default dirt-samples)`,
    `Voices:     ${state.voiceCount}  (drums:${state.hasDrums ? "yes" : "no"}, melody:${state.hasMelody ? "yes" : "no"}, bass:${state.hasBass ? "yes" : "no"}, pad:${state.hasPad ? "yes" : "no"})`,
    state.visual ? `Visual:     .${state.visual}() active` : `Visual:     none`,
  ];
  return lines.join("\n");
}

function sanitizeBy(by) {
  if (typeof by !== "string") return "anon";
  return by.replace(/[^a-zA-Z0-9_一-鿿-]/g, "").slice(0, 20) || "anon";
}
