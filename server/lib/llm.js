// LLM 调用 (OpenAI 兼容协议) + token 计费
// 默认走 agentllm.linkyun.co 网关 — 后端可能路由到 Gemini/Claude/etc, 对调用方透明
//
// 历史环境变量名 (GEMINI_*) 保留是为了不动现成的 .env / docker-compose 配置, 不代表底层一定是 Gemini.

const PRICING = {
  // 网关后端通常仍是 Gemini Flash 类, 沿用旧定价做兜底估算
  inputPer1M: 0.075,
  outputPer1M: 0.30,
};

const MODEL = process.env.GEMINI_MODEL || "vibe-music";
const BASE_URL = (process.env.GEMINI_BASE_URL || "https://agentllm.linkyun.co/v1").replace(/\/+$/, "");

// max_tokens 要给 thinking budget 留余地 — Gemini 后端会在内部塞 thought_signature, 占几百到几千 token
// 实测 13k prompt + 5 行 Strudel + 1 句解释 ≈ 总 15k token, 其中 thought ~1700, output ~450
const MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS || "8000", 10);

export async function callGemini({ apiKey, systemPrompt, userText, history = [], retryWith = null }) {
  if (!apiKey) throw new Error("Missing LLM API key (set GEMINI_API_KEY)");

  // retryWith: { prevCode, errorMsg } — 重试时把上次错误反馈给模型
  const userMsg = retryWith
    ? `${userText}\n\n上次生成的代码有错误:\n\`\`\`\n${retryWith.prevCode}\n\`\`\`\n错误: ${retryWith.errorMsg}\n请修复后重新生成完整代码。`
    : userText;

  // OpenAI messages: system → user/assistant 交替
  // 旧 Gemini 的 role="model" → OpenAI 的 role="assistant"
  const messages = [
    { role: "system", content: systemPrompt },
  ];
  for (const h of history) {
    if (h.role === "user") {
      messages.push({ role: "user", content: h.text });
    } else if (h.role === "model" || h.role === "assistant") {
      // 历史里 model 的 text 是 JSON.stringify({code, explanation, visual})
      // 直接喂回去会让模型嵌套 JSON (在 code 字段里又塞一份 JSON)
      // → 拆成自然文本: 解释 + code block + visual block
      let content = h.text;
      try {
        const obj = JSON.parse(h.text);
        if (obj && typeof obj === "object" && obj.code) {
          const parts = [];
          if (obj.explanation) parts.push(obj.explanation);
          parts.push("```js\n" + obj.code + "\n```");
          if (obj.visual) parts.push("Hydra:\n```js\n" + obj.visual + "\n```");
          content = parts.join("\n\n");
        }
      } catch { /* 不是 JSON, 原样用 */ }
      messages.push({ role: "assistant", content });
    }
  }
  messages.push({ role: "user", content: userMsg });

  // OpenAI Structured Outputs (json_schema + strict) — agentllm 网关支持, 直接转给后端 (Gemini responseSchema 等价物)
  // 好处: 输出永远是干净 JSON, 不裹 ```json``` fence, 多轮不嵌套, thought_signature 开销也 ~0
  // 注意: 不要用 json_object 模式 — 实测多轮会把整个回复嵌套到 code 字段里
  const body = {
    model: MODEL,
    messages,
    temperature: 0.85,
    max_tokens: MAX_TOKENS,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "vibe_response",
        strict: true,
        schema: {
          type: "object",
          properties: {
            code:        { type: "string" },
            explanation: { type: "string" },
            visual:      { type: "string" },
          },
          required: ["code", "explanation", "visual"],
          additionalProperties: false,
        },
      },
    },
  };

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`LLM ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const choice = data?.choices?.[0];
  const finish = choice?.finish_reason;
  const text = choice?.message?.content || "";

  if (finish === "length" || finish === "content_filter") {
    throw new Error(`LLM truncated (finish=${finish}); raise LLM_MAX_TOKENS or shorten prompt`);
  }

  let parsed = tryParseLLMJson(text);
  if (!parsed) parsed = { code: text.trim(), explanation: "" };

  // 防御: 模型可能在 code/visual 字段里又裹一层 ```js/``` fence — 全部剥掉
  parsed.code   = stripCodeFence(parsed.code);
  parsed.visual = stripCodeFence(parsed.visual);

  const usage = data?.usage || {};
  return {
    code: parsed.code || "",
    explanation: parsed.explanation || "",
    visual: parsed.visual || "",       // optional Hydra code
    tokensIn:  usage.prompt_tokens     || 0,
    tokensOut: usage.completion_tokens || 0,
  };
}

// 通用网关调用 — 不绑定 {code,explanation} schema, 给 TERMINAL 聊天/作曲这类自由格式用.
// messages: 完整 OpenAI messages (含 system). responseFormat: 传则走 structured output, 不传则纯文本.
// 复用同一个云 key / BASE_URL / MODEL. 返回 { text, tokensIn, tokensOut }.
export async function callGatewayRaw({ messages, temperature = 0.9, maxTokens = MAX_TOKENS, responseFormat = null, timeoutMs = 30_000 }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing LLM API key (set GEMINI_API_KEY)");
  const body = { model: MODEL, messages, temperature, max_tokens: maxTokens };
  if (responseFormat) body.response_format = responseFormat;

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`LLM ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const choice = data?.choices?.[0];
  const finish = choice?.finish_reason;
  const text = choice?.message?.content || "";
  if (finish === "length" || finish === "content_filter") {
    throw new Error(`LLM truncated (finish=${finish}); raise max_tokens or shorten input`);
  }
  const usage = data?.usage || {};
  return { text, tokensIn: usage.prompt_tokens || 0, tokensOut: usage.completion_tokens || 0 };
}

// 剥掉字符串前后的 markdown code fence (```js / ```javascript / ```), 防止 Strudel 拿到带 fence 的代码崩
function stripCodeFence(s) {
  if (typeof s !== "string") return "";
  let t = s.trim();
  // 头部: ```js / ```javascript / ```hydra / ``` (可带语言名)
  t = t.replace(/^```[a-zA-Z]*\s*\n?/, "");
  // 尾部: ```
  t = t.replace(/\n?```\s*$/, "");
  return t.trim();
}

// 修复 LLM 常吐的非法 JSON: 字符串值里夹了真正的 \n / \t / \r (JSON 规范要求 \\n 转义)
// 扫一遍, 在双引号 string 范围内把裸 control char 转义掉
function repairJsonString(s) {
  let out = "";
  let inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) { out += c; esc = false; continue; }
      if (c === "\\") { out += c; esc = true; continue; }
      if (c === '"') { out += c; inStr = false; continue; }
      if (c === "\n") { out += "\\n"; continue; }
      if (c === "\r") { out += "\\r"; continue; }
      if (c === "\t") { out += "\\t"; continue; }
      out += c;
    } else {
      out += c;
      if (c === '"') inStr = true;
    }
  }
  return out;
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch {}
  try { return JSON.parse(repairJsonString(s)); } catch {}
  return null;
}

// 模型可能输出: 裸 JSON / ```json ...``` block / ``` ...``` block / 前后带闲聊文字的 JSON
// 用括号匹配找第一个完整的 {...}, 再 JSON.parse. 代码里的 } 不会干扰因为我们计数 {/}.
export function tryParseLLMJson(text) {
  if (!text) return null;
  // 1) 直接 parse (最常见)
  let r = safeJsonParse(text);
  if (r) return r;
  // 2) ```json ... ``` 或 ``` ... ``` 包裹
  const fence = text.match(/```(?:json|js|javascript)?\s*([\s\S]*?)```/);
  if (fence) {
    r = safeJsonParse(fence[1].trim());
    if (r) return r;
  }
  // 3) 文本里第一个完整 {...} (用 brace 计数, 跳过字符串里的 {/})
  const i = text.indexOf("{");
  if (i < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        return safeJsonParse(text.slice(i, j + 1));
      }
    }
  }
  return null;
}

export function estimateCost({ tokensIn, tokensOut }) {
  return (tokensIn / 1e6) * PRICING.inputPer1M + (tokensOut / 1e6) * PRICING.outputPer1M;
}
