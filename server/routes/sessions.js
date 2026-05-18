import { customAlphabet } from "nanoid";
import { getSession, createSession } from "../lib/redis.js";

// 10 字符 base62, 冲突概率忽略
const newId = customAlphabet("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 10);

export default async function sessionsRoutes(fastify) {
  // 创建 session — body 可选 { bpm: 40..240, style: "techno"/..., custom: 自由文本 (<500字, 创建者意图: 调式/和弦/编制等) }
  fastify.post("/sessions", async (req, reply) => {
    const id = newId();
    const { bpm, style, custom } = req.body || {};
    const session = await createSession(id, { bpm, style, custom });
    return { id, code: "", seq: 0, bpmLock: session.bpmLock, styleHint: session.styleHint, customHint: session.customHint };
  });

  // GET /s/:id/code — 拉取 session 当前状态(轮询入口)
  fastify.get("/s/:id/code", async (req, reply) => {
    const { id } = req.params;
    if (!/^[a-zA-Z0-9_-]{6,20}$/.test(id)) {
      return reply.code(400).send({ error: "invalid_id" });
    }

    const data = await getSession(id);
    if (!data) {
      return reply.code(404).send({ error: "session_expired" });
    }

    // ETag = seq, 客户端通过 If-None-Match 节省带宽
    const etag = `"${data.seq}"`;
    if (req.headers["if-none-match"] === etag) {
      reply.header("Cache-Control", "no-store");
      reply.header("ETag", etag);
      return reply.code(304).send();
    }

    reply.header("ETag", etag);
    reply.header("Cache-Control", "no-store");
    return data;
  });
}
