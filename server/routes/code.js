import { getSession, updateSession, checkSelfRateLimit, consumeSelfRateLimit } from "../lib/redis.js";
import { validate } from "../lib/validate.js";

const SELF_RATE_SEC = parseInt(process.env.SELF_RATE_SECONDS || "5", 10);

export default async function codeRoutes(fastify, opts) {
  const validNames = opts.validNames || { validBanks: new Set(), validSounds: new Set() };

  fastify.post("/s/:id/code", async (req, reply) => {
    const { id } = req.params;
    if (!/^[a-zA-Z0-9_-]{6,20}$/.test(id)) {
      return reply.code(400).send({ error: "invalid_id" });
    }
    const cur = await getSession(id);
    if (!cur) return reply.code(404).send({ error: "session_expired" });

    const ip = (req.headers["x-forwarded-for"] || req.ip || "?").split(",")[0].trim();

    // per-IP 限流 (自带 LLM 也要防刷, 5s)
    const rl = await checkSelfRateLimit(ip, SELF_RATE_SEC);
    if (!rl.ok) {
      return reply.code(429).send({ reason: "per_ip", remainingSec: rl.remainingSec });
    }

    const { code, explanation = "", by = "anon" } = req.body || {};
    if (typeof code !== "string" || code.length === 0 || code.length > 8000) {
      return reply.code(400).send({ error: "code_invalid", details: "length out of range" });
    }

    // 服务端校验
    const v = validate(code, validNames);
    if (!v.ok) {
      return reply.code(400).send({ error: "code_invalid", details: v.errors.join("; ") });
    }

    await consumeSelfRateLimit(ip, SELF_RATE_SEC);
    const next = await updateSession(id, {
      code,
      explanation,
      lastBy: sanitizeBy(by),
      sourceTag: "own",
    });

    return { seq: next.seq, validated: true };
  });
}

function sanitizeBy(by) {
  if (typeof by !== "string") return "anon";
  return by.replace(/[^a-zA-Z0-9_一-鿿-]/g, "").slice(0, 20) || "anon";
}
