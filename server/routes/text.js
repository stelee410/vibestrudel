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
      : `== JAM POLICY — you're a live DJ, improvise on the running track ==
A live audience is hearing CURRENT STATE; your output REPLACES it at next cycle boundary.
You have full creative freedom. Three non-negotiable constraints, everything else is up to your musical judgment:

1. BPM LOCKED — never change setcpm value unless the user explicitly names a new BPM number.

2. ENERGY STABLE — preserve the current track's energy level (driving / chill / hype / sparse).
   This means: don't suddenly drop drums when the room is dancing, don't suddenly turn a techno banger into ambient drone,
   don't switch from busy 8-voice mix to bare 2-voice. The pulse and arousal level should feel continuous between turns.

3. NEVER REPEAT YOURSELF — your draft must NOT be character-identical to CURRENT STATE.
   If user gave any input (mood, verb, imagery, even nonsense), you owe them an audible change.
   Same explanation as previous turn = lazy = unacceptable.
   If the user types "X" and you'd output the exact same code/explanation as for "Y", you're cheating — recompose.

Within those 3 rules, IMPROVISE freely:
  · User said an incremental verb ("再/加/多/少/换/more/less/add") → tweak that specific thing, leave rest mostly alone.
  · User gave a mood/imagery/scene word ("机器人在奔跑" / "虚化的世界" / 任何抒情描述) →
      let the mood guide your choices. Re-color the voices in whatever direction your musical instinct says fits.
      You decide: maybe swap a waveform, change chord voicing, add an atmospheric layer, shift the bass note pattern,
      sweep a filter, alter effects. Trust your ear — pick the changes that make the new mood land.
      Move forward, don't tread water. The track should evolve every turn, even subtly.
  · User said explicit fresh-start ("重来/换一个/fresh/new vibe/reset") →
      full replacement (still respecting session BPM lock / style hint / custom rules).
  · User is vague ("再来点 / make it interesting") →
      pick something to evolve, surprise yourself; just don't stand still.

== PRE-RETURN CHECK ==
  Before returning, scan your draft against CURRENT STATE:
    - Are they substantively different? (some voice changed, some parameter shifted noticeably, some new layer added/removed)
    - Does the explanation reflect what's actually different and what the mood is (not a generic "kick + hat + bass" boilerplate)?
    - Could the same code accurately describe a different user input? If yes → fail, you didn't customize.
  If any answer is "no" → rework before returning. You're a creative partner, not a tape loop.`;

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

        // === BPM enforcement (服务端兜底, 别全靠 LLM 听话) ===
        // 用户没明确要求改 BPM (没说数字也没说快/慢), 那就把生成代码里的 setcpm 改回 session 期望值
        let codeAfterCheck = (function enforceBpmIfNeeded(rawCode){
          const newBpm = extractBpm(rawCode);
          if (!newBpm || newBpm === bpm) return rawCode;
          const userRequestedBpm = detectBpmIntent(text);
          if (userRequestedBpm === "change" || userRequestedBpm === newBpm) return rawCode;
          // 强制改回
          console.warn(`[bpm-enforce] LLM 输出 ${newBpm}, 期望 ${bpm}, 用户未要求改, 强制改回`);
          return rewriteSetcpm(rawCode, bpm);
        })(code);
        // 校验主代码
        const v = validate(codeAfterCheck, validNames);
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

        // 成功 — 把这一轮 user/model 追加到 history 给下次用 (用 codeAfterCheck, 历史里就是已修正的版本)
        await appendHistory(id, "user", text);
        await appendHistory(id, "model", JSON.stringify({ code: codeAfterCheck, explanation, visual: safeVisual }));

        const next = await updateSession(id, {
          code: codeAfterCheck,
          explanation,
          visual: safeVisual,
          lastBy: sanitizeBy(by),
          sourceTag: "cloud",
        });

        return {
          seq: next.seq,
          code: codeAfterCheck,
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

// 解读用户文本: 是否要求改 BPM
//   返回 数字 = 用户明确给了目标 BPM (例: "加快到 140")
//   返回 "change" = 用户用了"快/慢/加速/halftime"这种相对词, 没给数字
//   返回 null = 用户没提任何 BPM 意图 → 服务端可以强制锁回原值
function detectBpmIntent(text) {
  if (typeof text !== "string") return null;
  const t = text.toLowerCase();
  // 1) 显式数字 + BPM 关键词: "140 bpm" / "bpm=140" / "140拍" / "cpm 140"
  let m = text.match(/(\d{2,3})\s*(?:bpm|cpm|拍)\b/i) ||
          text.match(/\b(?:bpm|cpm|tempo|速度|节奏)\s*[:=]?\s*(\d{2,3})\b/i);
  if (m) {
    const v = parseInt(m[1], 10);
    if (v >= 40 && v <= 240) return v;
  }
  // 2) 相对快慢关键词
  const relPattern = /(faster|slower|speed\s*up|slow\s*down|halftime|doubletime|half[\s-]?time|double[\s-]?time|加快|减慢|加速|减速|提速|降速|更快|更慢|快一点|慢一点|halftime|快点|慢点|双倍速|半速)/i;
  if (relPattern.test(t)) return "change";
  return null;
}

// 改写代码里的 setcpm/setcps 为目标 BPM. 找不到就在开头插一行
function rewriteSetcpm(code, bpm) {
  const cpmLine = `setcpm(${bpm}/4);`;
  // 注意: 不要在 \) 后面用 \s* 吃后续空白, 会把代码后续的换行吞掉
  if (/setcpm\s*\(/.test(code)) {
    return code.replace(/setcpm\s*\(\s*[\d.]+\s*(?:\/\s*[\d.]+)?\s*\);?/, cpmLine);
  }
  if (/setcps\s*\(/.test(code)) {
    // 顺手把 setcps 也改成 setcpm 统一
    return code.replace(/setcps\s*\(\s*[\d.]+\s*\);?/, cpmLine);
  }
  return cpmLine + "\n" + code;
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
