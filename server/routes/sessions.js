import { customAlphabet } from "nanoid";
import { getSession, createSession } from "../lib/redis.js";

// 10 字符 base62, 冲突概率忽略
const newId = customAlphabet("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 10);

export default async function sessionsRoutes(fastify) {
  // 创建 session
  fastify.post("/sessions", async (req, reply) => {
    const id = newId();
    await createSession(id);
    return { id, code: "", seq: 0 };
  });

  // 拉取 session 当前状态 (轮询入口)
  fastify.get("/s/:id", async (req, reply) => {
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
