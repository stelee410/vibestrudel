// Gemini 调用 + token 计费

const PRICING = {
  // Gemini 2.5/3.x Flash 当前定价 ($/M tokens)
  // 上线时按 https://ai.google.dev/pricing 实际值改
  inputPer1M: 0.075,
  outputPer1M: 0.30,
};

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";  // 占位; 上线改 gemini-3.1-flash
// 用反代域名覆盖默认 endpoint (HK/CN 服务器需要 Cloudflare Worker / 其它代理)
// 例: GEMINI_BASE_URL=https://gemini-proxy.your-worker.workers.dev
const BASE_URL = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");

export async function callGemini({ apiKey, systemPrompt, userText, history = [], retryWith = null }) {
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  // retryWith: { prevCode, errorMsg } — 重试时把上次错误反馈给模型
  const userMsg = retryWith
    ? `${userText}\n\n上次生成的代码有错误:\n\`\`\`\n${retryWith.prevCode}\n\`\`\`\n错误: ${retryWith.errorMsg}\n请修复后重新生成完整代码。`
    : userText;

  // 拼 multi-turn contents: 历史 + 当前 user 消息
  // history 是 [{role:"user"|"model", text}, ...] 由调用方从 redis 读出来
  const contents = [];
  for (const h of history) {
    if (h.role === "user" || h.role === "model") {
      contents.push({ role: h.role, parts: [{ text: h.text }] });
    }
  }
  contents.push({ role: "user", parts: [{ text: userMsg }] });

  const url = `${BASE_URL}/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.85,
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          code:        { type: "string" },
          explanation: { type: "string" },
        },
        required: ["code", "explanation"],
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // 30s 超时
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) {
    // 兜底: 找 code block
    const m = text.match(/```(?:js|javascript)?\s*([\s\S]*?)```/);
    parsed = { code: m ? m[1].trim() : text.trim(), explanation: "" };
  }
  const usage = data?.usageMetadata || {};
  return {
    code: parsed.code || "",
    explanation: parsed.explanation || "",
    tokensIn:  usage.promptTokenCount || 0,
    tokensOut: usage.candidatesTokenCount || 0,
  };
}

export function estimateCost({ tokensIn, tokensOut }) {
  return (tokensIn / 1e6) * PRICING.inputPer1M + (tokensOut / 1e6) * PRICING.outputPer1M;
}
