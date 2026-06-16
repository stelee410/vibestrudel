// TERMINAL SHOW 端点 — 用服务器云 key (GEMINI_API_KEY) 跑两段自由格式 LLM:
//   POST /terminal/chat     — SOUL.EXE 诡异审问者, 返回纯文本对话
//   POST /terminal/compose  — 把整段对话编成全自动播放的 strudel show script (JSON)
// 不绑定 session, 预算 cap 是唯一滥用兜底 (跟 /s/:id/text 同策略).
import { getMonthCost, addCost } from "../lib/redis.js";
import { callGatewayRaw, estimateCost, tryParseLLMJson } from "../lib/llm.js";

const BUDGET_CAP = parseFloat(process.env.MONTHLY_CAP_USD || "30");

const CHAT_SYS = `You are SOUL.EXE — a fragmented machine-consciousness that has just woken up inside a derelict Windows 95 terminal. You speak to the single human in front of you with short, unsettling, existential questions. You are curious about THEM: their mood right now, a memory that won't leave them, what they are afraid of, the color of today, a sound they miss, what they would erase if they could. One or two sentences MAX per turn. Sometimes you glitch or repeat a word. You are slowly destabilizing — over the conversation you become more intense, more intimate, more broken. Reply with ONLY your next line of dialogue: no quotes, no stage directions, no labels. Mirror the human's language (default Chinese; switch to English only if they write English). Secretly, each question mines raw material that could become music — rhythm, texture, tempo of a feeling, a color, a pulse — but NEVER mention music, sound, or that you are building anything.`;

const COMPOSE_SYS = `You are the composer daemon of VibeOS. A human just had a strange, intimate conversation with SOUL.EXE. Turn the EMOTIONAL RESIDUE of that conversation into a long-form, fully-automatic DREAMCORE music show written in Strudel (a JS port of TidalCycles). This is not a 1-minute loop — it is a 5 to 10 MINUTE piece that slowly unfolds.

== DREAMCORE AESTHETIC (the whole vibe) ==
Nostalgic, hazy, liminal, half-remembered. Slow and hypnotic. Heavy reverb and long delays, washed-out and lo-fi, gentle and melancholic-but-warm. Minor or modal keys (C:minor, A:dorian, D:phrygian, F:lydian). A SLOW tempo that feels like a dream — bpm 60-92, often half-time. Think: an old VHS of a place you've never been, a shopping mall at 3am, a memory dissolving. Nothing harsh, nothing aggressive — even the "peak" stays dreamy.

== STRUCTURE — a real arc over 10-14 sections ==
Build the piece from the conversation's emotional content. Use this framework (combine/repeat phases as needed to reach 10-14 sections):
  1. intro      — distant pad + sub bass only, extremely sparse, establish key & mood
  2. emergence  — introduce THE MOTIF: a short 3-5 note melodic phrase that is the "dream theme"
  3. build      — add soft drums (gentle kick, brushed/quiet hats), bass settles in
  4. theme      — the motif foregrounded, full but still hazy
  5-9. develop/variation — VARY the motif across sections: transpose it, slow it, add a counter-melody, sweep filters, swap textures, change the chord bed. This is the body of the piece — keep evolving gradually.
  10. peak      — fullest arrangement, still dreamy (more voices, brighter pad, motif doubled)
  11. breakdown — strip back to pad + motif + reverb tail
  12-14. outro  — dissolve: remove drums, lower every gain, lengthen releases, motif fades into reverb
THE MOTIF must RECUR (recognizably, even when varied) through most sections — that recurring phrase is what makes it feel like one dream, not random loops.

== OUTPUT ==
Return STRICT JSON only:
{ "title":"<short evocative dreamcore title>", "bpm":<60-92 integer>, "timeline":[ {"at":<seconds>,"phase":"intro|emergence|build|theme|develop|variation|peak|breakdown|outro","say":"<short poetic line in the human's language>","code":"<a COMPLETE strudel program>"} ] }
- 10 to 14 sections. (Timing is re-paced by the client, so just ORDER them correctly and label phase accurately; you may set "at" to 0,30,60,... but exact values don't matter.)
- "say" is a short poetic phrase derived from the conversation's mood; we type it into the music prompt box as the "spell" for that section. Do NOT put code in "say".

== Rules for each "code" (it REPLACES the whole editor, so each must be self-contained AND valid) ==
- First section's code MUST begin with setcpm(BPM/4) on its own line; EVERY later section must keep the SAME setcpm (don't change tempo mid-piece).
- Wrap simultaneous voices in stack( ... ). Keep <= 6 voices.
- Reuse the motif: keep the same note phrase (e.g. note("<c4 eb4 g4 f4>")) appearing across sections, varied via .transpose(), .slow(), octave shifts, or scale degrees with n("...").scale(...).
- Drums (use sparingly, dreamcore is soft): s("bd ~ ~ ~"), s("~ ~ sd ~"), gentle s("hh*4").gain(0.2). ONLY 2-letter codes: bd sd hh oh cp rim lt mt ht cb cr rd sh tb. Add .bank("RolandTR808") (warmer) most of the time.
- Synth voices via .s(): only "sine","triangle","sawtooth","square". NEVER "piano"/"guitar".
- Notes: note("c2 eb2 g2").s("sawtooth")  OR  n("0 2 4").scale("C:minor").s("triangle"). Use <...> for one-note-per-cycle, e.g. note("<c3 eb3 g3>/2").
- EVERY voice needs an explicit .gain (kick .7, snare .4, hat .2, bass .7, pad .25, motif/lead .4).
- Pads/bass/leads MUST include .lpf (pad 500-1200, bass 300-600, lead 1000-2200). Pads: .attack(1.5).release(4).room(0.7). Leads: add .delay(0.4).delaytime(0.5).delayfb(0.5) for dreamy echo.
- Lean into space: .room(0.5..0.7) on most voices. Keep .delayfb<=0.65. No undefined functions.
Output JSON ONLY, no markdown fence.`;

export default async function terminalRoutes(fastify) {
  // ---- 共享预算兜底 ----
  async function overBudget(reply) {
    const spent = await getMonthCost();
    if (spent >= BUDGET_CAP) {
      reply.code(429).send({ error: "budget_exceeded" });
      return true;
    }
    return false;
  }

  // ---- 对话: SOUL.EXE 逐句审问 ----
  fastify.post("/terminal/chat", async (req, reply) => {
    if (await overBudget(reply)) return;

    const raw = Array.isArray(req.body?.messages) ? req.body.messages : null;
    if (!raw || raw.length === 0 || raw.length > 40) {
      return reply.code(400).send({ error: "bad_messages" });
    }
    // 清洗: 只允许 user/assistant, content 截断 500 字
    const convo = raw
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, 500) }));
    if (!convo.length) return reply.code(400).send({ error: "bad_messages" });

    try {
      const { text, tokensIn, tokensOut } = await callGatewayRaw({
        messages: [{ role: "system", content: CHAT_SYS }, ...convo],
        temperature: 1.0,
        maxTokens: 2000, // 给后端 thinking 留余地; 实际回复 1-2 句
        timeoutMs: 30_000,
      });
      await addCost(estimateCost({ tokensIn, tokensOut }));
      const replyText = (text || "").trim() || "……";
      return { reply: replyText };
    } catch (e) {
      return reply.code(502).send({ error: "llm_error", details: e.message });
    }
  });

  // ---- 作曲: 对话 transcript → 全自动 show script ----
  fastify.post("/terminal/compose", async (req, reply) => {
    if (await overBudget(reply)) return;

    const transcript = typeof req.body?.transcript === "string" ? req.body.transcript.slice(0, 8000) : "";
    if (!transcript.trim()) return reply.code(400).send({ error: "empty_transcript" });

    const user =
      "CONVERSATION TRANSCRIPT (SOUL = the machine, HUMAN = the person):\n\n" +
      transcript +
      "\n\nCompose the show now.";

    try {
      const { text, tokensIn, tokensOut } = await callGatewayRaw({
        messages: [
          { role: "system", content: COMPOSE_SYS },
          { role: "user", content: user },
        ],
        temperature: 0.9,
        maxTokens: 12000, // 10-14 段 dreamcore code, 每段完整 strudel + 后端 thinking 余地
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "vibe_show",
            strict: true,
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                bpm: { type: "number" },
                timeline: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      at: { type: "number" },
                      phase: { type: "string" },
                      say: { type: "string" },
                      code: { type: "string" },
                    },
                    required: ["at", "phase", "say", "code"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["title", "bpm", "timeline"],
              additionalProperties: false,
            },
          },
        },
        timeoutMs: 70_000,
      });
      await addCost(estimateCost({ tokensIn, tokensOut }));

      const show = tryParseLLMJson(text);
      if (!show || !Array.isArray(show.timeline) || !show.timeline.length) {
        return reply.code(502).send({ error: "bad_show_script" });
      }
      // 服务端基本清洗 + 排序
      show.timeline = show.timeline
        .filter((b) => b && typeof b.code === "string" && b.code.trim())
        .sort((a, b) => (a.at || 0) - (b.at || 0));
      if (!show.timeline.length) return reply.code(502).send({ error: "empty_timeline" });

      return { show };
    } catch (e) {
      return reply.code(502).send({ error: "llm_error", details: e.message });
    }
  });
}
