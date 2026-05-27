// FX bank — Phase 2 (MiniMax 音乐切片 pad) + Phase 3 placeholder (freesound SFX)
//
// POST /s/:id/fx-bank/music  { prompt }   → 调 MiniMax 生成 ~60s 音乐, ffmpeg 切 16 片
// GET  /s/:id/fx-bank                     → 列已有 pad 库
// 生成产物存盘 /app/data/pads/{sid}/{music|sfx}/{0..15}.mp3
// 客户端从 /pads/{sid}/music/N.mp3 静态拉, 通过 Phase 1 fx broadcast 触发播放

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { addCost, getMonthCost, getSession } from "../lib/redis.js";
import { callGemini, estimateCost } from "../lib/llm.js";

const PADS_DIR = process.env.PADS_DIR || "/app/data/pads";
const LIBRARY_DIR = process.env.LIBRARY_DIR || "/app/data/library";
const BUDGET_CAP = parseFloat(process.env.MONTHLY_CAP_USD || "30");

// 全局音乐库 — 每次 gen 写一个 {id}.mp3 + {id}.json
function newAssetId() {
  // timestamp (~9 base36 chars) + 5 random hex — 排序天然按时间 + 唯一
  return Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

// 用 LLM 提 3-5 个 tag (英文 lowercase short). 失败 → 空 tags 不阻塞
async function extractTagsFromGen({ apiKey, baseUrl, prompt, bpm, style }) {
  const sys = `You output ONLY a JSON array of 3-5 short English lowercase tags describing this generated music.
Tags cover: genre, mood, instrument hint, energy, era. Examples: ["techno","dark","industrial","138bpm","minimal"].
NO sentences. NO explanations. JUST the array.`;
  const userText = [
    `Prompt: ${prompt}`,
    bpm ? `BPM: ${bpm}` : null,
    style ? `Style: ${style}` : null,
  ].filter(Boolean).join("\n");
  const body = {
    model: process.env.GEMINI_MODEL || "vibe-music",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: userText },
    ],
    temperature: 0.3,
    max_tokens: 2000,   // Gemini thought_signature 吃几百, JSON 输出小, 给够
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "tags",
        strict: true,
        schema: {
          type: "object",
          properties: { tags: { type: "array", items: { type: "string" } } },
          required: ["tags"],
          additionalProperties: false,
        },
      },
    },
  };
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`tag LLM ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    const m = text.match(/\{[\s\S]*?\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
  }
  const arr = parsed?.tags;
  if (!Array.isArray(arr)) return [];
  return arr.filter(t => typeof t === "string")
    .slice(0, 6)
    .map(t => t.toLowerCase().trim().slice(0, 24))
    .filter(t => t.length > 0);
}

// MiniMax 音乐生成: ~30-60s, ~2MB 输出. cooldown 防滥用
const _genLastAt = new Map();   // sid -> ts
const GEN_COOLDOWN_MS = 60 * 1000;   // 1 min per session
const MINIMAX_COST_USD = 0.11;       // 估算 (~¥0.8/次)

// 通过网关调 MiniMax music_generation (wait=true 同步等待)
async function callMiniMaxMusic({ apiKey, baseUrl, prompt }) {
  // 网关根 = https://agentllm.linkyun.co/v1, MiniMax 端点在 /v1beta/minimax/...
  // 从 LLM 的 BASE_URL (.../v1) 推出 root, 拼 /v1beta/minimax/...
  const root = baseUrl.replace(/\/v1\/?$/, "");
  const url = `${root}/v1beta/minimax/music_generation?wait=true`;
  const body = {
    model: "music-1.5",
    prompt,
    // 全器乐: MiniMax 要求 lyrics 字段, 用 "##\n[inst]\n##" 标记纯器乐
    lyrics: "##\n[inst]\n##",
  };
  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),   // MiniMax 通常 30-60s, 留余量
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`MiniMax ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data.base_resp?.status_code && data.base_resp.status_code !== 0) {
    throw new Error(`MiniMax: ${data.base_resp.status_msg || "unknown"}`);
  }
  const audioHex = data?.data?.audio;
  if (!audioHex) throw new Error("MiniMax: no audio in response");
  return {
    bytes: Buffer.from(audioHex, "hex"),
    durationMs: data?.extra_info?.music_duration || 60000,
    sampleRate: data?.extra_info?.music_sample_rate || 44100,
    elapsedMs: Date.now() - t0,
  };
}

// ffmpeg segment muxer 把 src 切 N 等份 → outDir/{0..N-1}.mp3
async function sliceMp3IntoN(srcPath, outDir, totalDurationMs, n = 16) {
  await fs.mkdir(outDir, { recursive: true });
  const sliceSec = (totalDurationMs / n / 1000).toFixed(3);
  return new Promise((resolve, reject) => {
    const args = [
      "-y", "-loglevel", "error",
      "-i", srcPath,
      "-f", "segment",
      "-segment_time", sliceSec,
      "-c:a", "libmp3lame", "-b:a", "192k",
      "-reset_timestamps", "1",
      path.join(outDir, "%d.mp3"),
    ];
    const p = spawn("ffmpeg", args);
    let stderr = "";
    p.stderr.on("data", (d) => stderr += d);
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(0, 300)}`));
      resolve();
    });
  });
}

// === Phase 3: freesound CC0 SFX 检索 ===

// 用 LLM 把 mood 短语展开成 16 个 freesound 搜索关键词
// 不走 callGemini (max_tokens 8000 让 thinking phase 拖死), 直接小请求 + json_schema strict
async function expandMoodToKeywords({ apiKey, baseUrl, mood, count = 16 }) {
  const sys = `You expand a mood/vibe into ${count} concrete sound-effect search keywords for freesound.org.
Output strictly JSON {"keywords":[ "...", ... ]} with exactly ${count} entries.
Each keyword: 1-3 English words, no duplicates, a concrete SFX (e.g. "metallic clang", "vinyl scratch", "deep impact", "static hiss", "synth riser", "wind whoosh").
Mix categories: hits/impacts, textures/atmospheres, transitions/risers, glitches/digital, organic/foley.
NO musical instruments (no piano/guitar). NO vocal phrases. ONLY one-shot SFX / textures.
Pick keywords that fit the mood; if mood is vague, default to versatile electronic-performance staples.`;
  const body = {
    model: process.env.GEMINI_MODEL || "vibe-music",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: `Mood: ${mood || "rave performance"}` },
    ],
    temperature: 0.7,
    max_tokens: 1500,  // 小 — 防止 Gemini thinking phase 烧太多 token / 拖时
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "sfx_keywords",
        strict: true,
        schema: {
          type: "object",
          properties: { keywords: { type: "array", items: { type: "string" } } },
          required: ["keywords"],
          additionalProperties: false,
        },
      },
    },
  };
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),  // 20s — 网关慢就 fallback, 总响应 <60s 防 CF 切链
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`LLM keywords ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
  }
  const kws = Array.isArray(parsed?.keywords) ? parsed.keywords.filter(k => typeof k === "string") : [];
  // Fallback fillers — 防 LLM 返回不足 16 个
  if (kws.length < count) {
    const fillers = ["sweep riser", "deep impact", "glitch noise", "metallic clang", "white noise wash",
                     "low boom", "tape hiss", "synth zap", "wood click", "ambient pad",
                     "wind whoosh", "vinyl scratch", "siren rise", "static crackle", "subbass drop", "click pop"];
    for (const f of fillers) {
      if (kws.length >= count) break;
      if (!kws.includes(f)) kws.push(f);
    }
  }
  // 估算 token 给 cost tracker
  const usage = data?.usage || {};
  return {
    keywords: kws.slice(0, count),
    tokensIn: usage.prompt_tokens || 0,
    tokensOut: usage.completion_tokens || 0,
  };
}

// 搜 freesound + 下载第一个 CC0 短 sample 到 outPath
const FREESOUND_SEARCH = "https://freesound.org/apiv2/search/text/";
async function searchAndDownloadFreesound({ keyword, freesoundKey, outPath, maxDurationSec = 5 }) {
  const params = new URLSearchParams({
    query: keyword,
    filter: `license:"Creative Commons 0" duration:[0 TO ${maxDurationSec}]`,
    fields: "id,name,duration,previews",
    page_size: "5",
    token: freesoundKey,
  });
  const res = await fetch(`${FREESOUND_SEARCH}?${params}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`freesound ${res.status} for "${keyword}"`);
  const data = await res.json();
  const hit = data?.results?.[0];
  if (!hit) throw new Error(`no CC0 result for "${keyword}"`);
  const mp3Url = hit.previews?.["preview-hq-mp3"];
  if (!mp3Url) throw new Error(`no mp3 preview for "${keyword}" id=${hit.id}`);
  // Download to outPath
  const audioRes = await fetch(mp3Url, { signal: AbortSignal.timeout(15_000) });
  if (!audioRes.ok) throw new Error(`download ${audioRes.status} for ${mp3Url}`);
  const buf = Buffer.from(await audioRes.arrayBuffer());
  await fs.writeFile(outPath, buf);
  return { id: hit.id, name: hit.name, duration: hit.duration, bytes: buf.length };
}

// 列 /app/data/pads/{sid}/{type} 下已经切好的 pad 文件
async function listPadType(sid, type) {
  const dir = path.join(PADS_DIR, sid, type);
  try {
    const files = (await fs.readdir(dir))
      .filter(f => /^\d+\.mp3$/.test(f))
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    return files.slice(0, 16).map((f, i) => ({
      index: i,
      sample: `${type}_${i}`,
      url: `/pads/${sid}/${type}/${f}`,
    }));
  } catch (e) {
    if (e.code === "ENOENT") return [];
    console.warn(`[fx-bank] list ${type}:`, e.message);
    return [];
  }
}

export default async function fxBankRoutes(fastify) {
  // === POST /s/:id/fx-bank/music — 生成音乐 pad 库 ===
  fastify.post("/s/:id/fx-bank/music", async (req, reply) => {
    const { id } = req.params;
    if (!/^[a-zA-Z0-9_-]{6,20}$/.test(id)) {
      return reply.code(400).send({ error: "invalid_id" });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    const baseUrl = (process.env.GEMINI_BASE_URL || "https://agentllm.linkyun.co/v1").replace(/\/+$/, "");
    if (!apiKey) return reply.code(500).send({ error: "server_no_llm_key" });

    // 预算 cap
    const spent = await getMonthCost();
    if (spent >= BUDGET_CAP) {
      return reply.code(429).send({ reason: "budget_exceeded" });
    }

    const { prompt, bpm } = req.body || {};
    const safePrompt = (typeof prompt === "string" && prompt.length > 0 && prompt.length <= 400)
      ? prompt.trim() : null;
    if (!safePrompt) {
      return reply.code(400).send({ error: "invalid_prompt", details: "prompt: string 1-400 chars" });
    }
    // BPM 注入到 prompt — MiniMax 不保证严格同步, 但通常会偏靠近
    const safeBpm = (Number.isFinite(bpm) && bpm >= 40 && bpm <= 240) ? Math.round(bpm) : null;
    const promptWithBpm = safeBpm
      ? (/\b(\d{2,3})\s*(?:bpm|cpm|拍)\b/i.test(safePrompt)
          ? safePrompt   // user 已自带 BPM 词, 不重复
          : `${safePrompt}, at ${safeBpm} BPM`)
      : safePrompt;

    const lastAt = _genLastAt.get(id) || 0;
    const cooldownLeftMs = GEN_COOLDOWN_MS - (Date.now() - lastAt);
    if (cooldownLeftMs > 0) {
      return reply.code(429).send({
        error: "fx_bank_cooldown",
        remainingSec: Math.ceil(cooldownLeftMs / 1000),
      });
    }
    _genLastAt.set(id, Date.now());
    const cur = await getSession(id);   // 可能为 null (session 过期), 不致命 — 只影响 styleHint 默认值

    try {
      console.log(`[fx-bank] sid=${id} music gen: "${promptWithBpm.slice(0, 80)}"${safeBpm ? ` (bpm hint=${safeBpm})` : ""}`);
      const t0 = Date.now();
      const { bytes, durationMs, elapsedMs } = await callMiniMaxMusic({ apiKey, baseUrl, prompt: promptWithBpm });
      console.log(`[fx-bank] sid=${id} MiniMax returned ${(bytes.length/1024).toFixed(0)}KB ${durationMs}ms music in ${elapsedMs}ms`);

      // 全局库: 每次写 unique id, 不再覆盖. 也不再 16 切片 (granular 用 full)
      await fs.mkdir(LIBRARY_DIR, { recursive: true });
      const assetId = newAssetId();
      const mp3Path = path.join(LIBRARY_DIR, `${assetId}.mp3`);
      const jsonPath = path.join(LIBRARY_DIR, `${assetId}.json`);
      await fs.writeFile(mp3Path, bytes);

      // tags 提取 (失败不阻塞主流程)
      let tags = [];
      try {
        tags = await extractTagsFromGen({
          apiKey, baseUrl,
          prompt: promptWithBpm,
          bpm: safeBpm,
          style: cur?.styleHint,
        });
        if (tags.length) console.log(`[fx-bank] sid=${id} tags:`, tags.join(", "));
      } catch (e) {
        console.warn(`[fx-bank] sid=${id} tags extract fail:`, e.message);
      }

      const asset = {
        id: assetId,
        createdAt: Date.now(),
        sid: id,                       // 谁生成的 (审计 + 可能用于"我的库")
        prompt: promptWithBpm,
        bpm: safeBpm,
        style: cur?.styleHint || null,
        tags,
        durationMs,
        bytes: bytes.length,
        url: `/library/${assetId}.mp3`,
      };
      await fs.writeFile(jsonPath, JSON.stringify(asset, null, 2));

      await addCost(MINIMAX_COST_USD);

      console.log(`[fx-bank] sid=${id} library asset ${assetId} created in ${((Date.now()-t0)/1000).toFixed(1)}s`);
      return { ok: true, asset };
    } catch (e) {
      console.error(`[fx-bank] sid=${id} error:`, e.message);
      _genLastAt.delete(id);   // 失败释放 cooldown
      return reply.code(502).send({ error: "fx_bank_generation_failed", details: e.message });
    }
  });

  // === POST /s/:id/fx-bank/sfx — freesound CC0 SFX 16 pad 库 ===
  fastify.post("/s/:id/fx-bank/sfx", async (req, reply) => {
    const { id } = req.params;
    if (!/^[a-zA-Z0-9_-]{6,20}$/.test(id)) {
      return reply.code(400).send({ error: "invalid_id" });
    }
    const freesoundKey = process.env.FREESOUND_API_KEY;
    if (!freesoundKey) return reply.code(500).send({ error: "server_no_freesound_key" });
    const apiKey = process.env.GEMINI_API_KEY;
    const baseUrl = (process.env.GEMINI_BASE_URL || "https://agentllm.linkyun.co/v1").replace(/\/+$/, "");

    const { mood, keywords } = req.body || {};
    const safeMood = (typeof mood === "string" && mood.length <= 200) ? mood.trim() : "";
    let kwList = Array.isArray(keywords)
      ? keywords.filter(k => typeof k === "string" && k.length <= 60).slice(0, 16)
      : null;

    // 用专门的 sfx cooldown — 跟 music 解耦, 各自冷却
    const cooldownKey = `sfx:${id}`;
    const lastAt = _genLastAt.get(cooldownKey) || 0;
    const cooldownLeftMs = GEN_COOLDOWN_MS - (Date.now() - lastAt);
    if (cooldownLeftMs > 0) {
      return reply.code(429).send({
        error: "fx_bank_cooldown",
        remainingSec: Math.ceil(cooldownLeftMs / 1000),
      });
    }
    _genLastAt.set(cooldownKey, Date.now());

    try {
      console.log(`[fx-bank] sid=${id} sfx gen: mood="${safeMood.slice(0,60)}", kw_provided=${!!kwList}`);
      const t0 = Date.now();
      if (!kwList || kwList.length < 16) {
        if (apiKey) {
          try {
            const r = await expandMoodToKeywords({ apiKey, baseUrl, mood: safeMood, count: 16 });
            kwList = r.keywords;
            await addCost(estimateCost({ tokensIn: r.tokensIn, tokensOut: r.tokensOut }));
          } catch (e) {
            console.warn(`[fx-bank] sid=${id} LLM keyword expansion failed (${e.message}), using fallback fillers`);
            kwList = null;  // fall through to filler-only path
          }
        }
        if (!kwList || kwList.length < 16) {
          // Fallback: 用 mood 文本切 token + 内置通用 sfx fillers 凑 16 个
          const moodTokens = safeMood ? safeMood.toLowerCase().split(/[\s,\/、，]+/).filter(t => t.length > 1 && t.length < 20) : [];
          const fillers = [
            "sweep riser", "deep impact", "glitch noise", "metallic clang", "white noise wash",
            "low boom", "tape hiss", "synth zap", "wood click", "ambient pad",
            "wind whoosh", "vinyl scratch", "siren rise", "static crackle", "subbass drop", "click pop",
          ];
          // mood token 优先(若有), 不足用 fillers 补
          const merged = [...new Set([...moodTokens, ...fillers])];
          kwList = merged.slice(0, 16);
        }
      }
      console.log(`[fx-bank] sid=${id} sfx keywords:`, kwList.join(", "));

      const sessionDir = path.join(PADS_DIR, id, "sfx");
      await fs.rm(sessionDir, { recursive: true, force: true });
      await fs.mkdir(sessionDir, { recursive: true });

      // 16 个并行搜索+下载
      const settles = await Promise.allSettled(kwList.map((kw, i) =>
        searchAndDownloadFreesound({
          keyword: kw, freesoundKey,
          outPath: path.join(sessionDir, `${i}.mp3`),
        })
      ));
      const okCount = settles.filter(s => s.status === "fulfilled").length;
      const failCount = settles.length - okCount;
      settles.forEach((s, i) => {
        if (s.status === "rejected") console.warn(`[fx-bank] sid=${id} sfx[${i}] "${kwList[i]}" fail:`, s.reason?.message || s.reason);
      });

      const pads = await listPadType(id, "sfx");
      console.log(`[fx-bank] sid=${id} sfx done: ${okCount}/${kwList.length} pads in ${((Date.now()-t0)/1000).toFixed(1)}s`);
      return {
        ok: true,
        pads,
        keywords: kwList,
        succeeded: okCount,
        failed: failCount,
        mood: safeMood,
      };
    } catch (e) {
      console.error(`[fx-bank] sid=${id} sfx error:`, e.message);
      _genLastAt.delete(cooldownKey);
      return reply.code(502).send({ error: "fx_bank_sfx_failed", details: e.message });
    }
  });

  // === GET /s/:id/fx-bank — 列 per-session sfx (music 已迁全局库, 见 /fx-bank/library) ===
  fastify.get("/s/:id/fx-bank", async (req, reply) => {
    const { id } = req.params;
    if (!/^[a-zA-Z0-9_-]{6,20}$/.test(id)) {
      return reply.code(400).send({ error: "invalid_id" });
    }
    const sfx = await listPadType(id, "sfx");
    return { sfx };
  });

  // === GET /fx-bank/library — 全局音乐库列表 (所有 session 共享) ===
  fastify.get("/fx-bank/library", async (req, reply) => {
    const limit = Math.min(100, parseInt(req.query.limit || "30", 10));
    const q = ((req.query.q || "") + "").toLowerCase().trim();
    try {
      const files = await fs.readdir(LIBRARY_DIR);
      // ID 前缀是 Date.now().toString(36), lexicographic 排序后倒序 = 最新先
      const jsons = files.filter(f => f.endsWith(".json")).sort().reverse();
      const items = [];
      for (const f of jsons) {
        if (items.length >= limit) break;
        try {
          const txt = await fs.readFile(path.join(LIBRARY_DIR, f), "utf8");
          const m = JSON.parse(txt);
          if (q) {
            const hay = `${m.prompt || ""} ${(m.tags || []).join(" ")} ${m.style || ""}`.toLowerCase();
            if (!hay.includes(q)) continue;
          }
          items.push(m);
        } catch(_){}
      }
      return { items, total: jsons.length };
    } catch (e) {
      if (e.code === "ENOENT") return { items: [], total: 0 };
      return reply.code(500).send({ error: e.message });
    }
  });
}
