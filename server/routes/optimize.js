// POST /optimize-rules — 把 landing 页用户填的 CUSTOM RULES 草稿优化成清晰可执行的约束
// Body: { bpm?, style?, custom? } - 都可选, custom 是草稿(可能为空)
// 返回: { optimized: "<重写后的规则>" }

import { addCost, getMonthCost } from "../lib/redis.js";
import { callGemini, estimateCost } from "../lib/llm.js";

const BUDGET_CAP = parseFloat(process.env.MONTHLY_CAP_USD || "30");

const OPTIMIZER_SYSTEM_PROMPT = `你是 VibeStrudel 的"创作约束顾问"。
用户正在创建一个 live-coding 房间, 已选了 BPM/风格, 写了一份草稿约束规则 (CUSTOM RULES), 这份规则会被注入到每次 AI 生成 Strudel 代码的 system prompt 里, 影响每一段音乐生成。

你的任务: 把草稿优化成一段清晰、可执行、具体到能让 AI 直接遵守的约束。

输出准则:
- 200 字以内, 越短越好
- 用名词短语 + 简短解释, 别写抒情口号
- 重点是"AI 该做什么 / 不该做什么", 而不是"听感如何"
- 涉及 BPM/风格的约束跟用户选的保持一致, 不冲突 (例如 BPM 138 就别再说"慢速")
- 删掉冗余、矛盾、无法执行的语句
- 如果草稿空, 根据 BPM + 风格生成一份合理的初始约束
- 输出语言跟随用户草稿语言 (中文输入→中文输出, 英文→英文; 草稿空→中文)

输出 JSON: {"code": "<优化后的规则文本, 纯文本不要 markdown>", "explanation": "<一句话说改了什么>", "visual": ""}
注意 code 字段在这个场景下放的是优化后的规则文本, 不是 Strudel 代码. visual 字段固定空字符串.`;

export default async function optimizeRoutes(fastify) {
  fastify.post("/optimize-rules", async (req, reply) => {
    const { bpm, style, custom } = req.body || {};

    // 预算 cap 兜底
    const spent = await getMonthCost();
    if (spent >= BUDGET_CAP) {
      return reply.code(429).send({ reason: "budget_exceeded" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return reply.code(500).send({ error: "server_no_llm_key" });

    // 输入校验
    const safeBpm = (Number.isFinite(bpm) && bpm >= 40 && bpm <= 240) ? Math.round(bpm) : null;
    const safeStyle = (typeof style === "string" && style.length <= 40) ? style.trim() : "";
    const safeCustom = (typeof custom === "string" && custom.length <= 500) ? custom.trim() : "";

    const userText = [
      safeBpm   ? `BPM: ${safeBpm}` : `BPM: (不限)`,
      safeStyle ? `风格: ${safeStyle}` : `风格: (不限)`,
      `当前草稿:`,
      safeCustom ? safeCustom : "(空 — 请基于 BPM/风格生成一份)",
    ].join("\n");

    try {
      const { code, tokensIn, tokensOut } = await callGemini({
        apiKey,
        systemPrompt: OPTIMIZER_SYSTEM_PROMPT,
        userText,
      });
      await addCost(estimateCost({ tokensIn, tokensOut }));

      const optimized = (code || "").trim();
      if (!optimized) return reply.code(502).send({ error: "empty_response" });
      // 防止 LLM 输出过长 (max 500 字符跟 CUSTOM RULES 字段对齐)
      const truncated = optimized.length > 500 ? optimized.slice(0, 500) : optimized;
      return { optimized: truncated };
    } catch (e) {
      return reply.code(502).send({ error: "llm_error", details: e.message });
    }
  });
}
