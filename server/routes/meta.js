import { statsSnapshot } from "../lib/redis.js";

const BUDGET_CAP = parseFloat(process.env.MONTHLY_CAP_USD || "30");

export default async function metaRoutes(fastify) {
  fastify.get("/healthz", async () => "ok");

  fastify.get("/stats", async () => {
    const s = await statsSnapshot();
    return {
      ...s,
      budgetCapUSD: BUDGET_CAP,
      readOnly: s.monthlySpentUSD >= BUDGET_CAP,
    };
  });
}
