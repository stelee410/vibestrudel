import Fastify from "fastify";
import cors from "@fastify/cors";

import sessionsRoutes from "./routes/sessions.js";
import codeRoutes from "./routes/code.js";
import textRoutes from "./routes/text.js";
import metaRoutes from "./routes/meta.js";

import { loadValidNames } from "./lib/samples.js";
import { redis } from "./lib/redis.js";

const PORT = parseInt(process.env.PORT || "8080", 10);

const fastify = Fastify({
  logger: { level: process.env.LOG_LEVEL || "info" },
  trustProxy: true,
  bodyLimit: 32 * 1024,  // 32KB JSON body 上限
});

// CORS — 生产环境锁到自己域名
await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "If-None-Match"],
  exposedHeaders: ["ETag"],
});

// 启动时载入合法 sample/bank 名
const validNames = await loadValidNames();

// 路由
await fastify.register(sessionsRoutes);
await fastify.register(codeRoutes, { validNames });
await fastify.register(textRoutes, { validNames });
await fastify.register(metaRoutes);

// 优雅退出
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
async function shutdown() {
  fastify.log.info("shutting down...");
  await fastify.close();
  await redis.quit().catch(() => {});
  process.exit(0);
}

try {
  await fastify.listen({ port: PORT, host: "0.0.0.0" });
} catch (e) {
  fastify.log.error(e);
  process.exit(1);
}
