# VibeStrudel Live · Server

Multi-session sync hub. HTTP polling + Redis only.

## API

| Method | Path | Purpose |
|--------|------|---------|
| POST   | /sessions     | 创建 session, 返回 `{ id, code, seq }` |
| GET    | /s/:id        | 拉取 session 状态. 支持 `If-None-Match: "<seq>"` → 304 |
| POST   | /s/:id/code   | 上传代码(自带 LLM 路径). 服务端校验后入库 |
| POST   | /s/:id/vibe   | 上传文字(云端 LLM 路径). 服务端调 Gemini → 校验 → 入库 |
| GET    | /healthz      | "ok" |
| GET    | /stats        | `{ activeSessions, monthlySpentUSD, budgetCapUSD, readOnly }` |

## 本地开发

```bash
# 启 Redis
docker run -d --name vibe-redis -p 6379:6379 redis:7-alpine

# 装依赖
cd server
npm install

# 配置
cp ../.env.example .env
# 编辑 .env, 至少填 GEMINI_API_KEY (cloud 路径要)

# 起服务 (要先把样本 manifest 挂到 ./manifests/)
mkdir -p manifests
cp ../vendor/samples/dirt-samples/strudel.json manifests/dirt-samples.strudel.json
cp ../vendor/samples/tidal-drum-machines.json manifests/
cp ../vendor/samples/piano.json manifests/
cp ../vendor/samples/vcsl.json manifests/

# 跑
MANIFEST_DIR=./manifests REDIS_URL=redis://localhost:6379 \
  GEMINI_API_KEY=AIza... \
  npm start
```

测试:
```bash
# 创建 session
curl -X POST http://localhost:8080/sessions
# → { "id": "aB3xY7Kp", "code": "", "seq": 0 }

# 拉
curl http://localhost:8080/s/aB3xY7Kp

# 推代码 (自带 LLM 路径)
curl -X POST http://localhost:8080/s/aB3xY7Kp/code \
  -H "Content-Type: application/json" \
  -d '{"code":"setcpm(128/4)\nstack(s(\"bd*4\"))","explanation":"test"}'

# 推 vibe (云端 LLM 路径, 需要 GEMINI_API_KEY)
curl -X POST http://localhost:8080/s/aB3xY7Kp/vibe \
  -H "Content-Type: application/json" \
  -d '{"text":"加一个低音"}'

# stats
curl http://localhost:8080/stats
```

## Docker 部署

整套(app + redis + caddy)用 repo 根目录的 `docker-compose.yml` 起.

## 校验老实说明

`lib/validate.js` 只能挡:
- ✓ JS syntax 错
- ✓ 不在白名单的顶级函数 / 方法
- ✓ `.gain(N)` 超过 [0, 1.5]
- ✓ `.pan(N)` 超过 [-1, 1]
- ✓ `.bank("xxx")` 不在 manifest 列表
- ✓ `.scale("xxx")` 格式错(无冒号)

**挡不住**:
- ❌ `.scale("C:minor").root("c4")` 这种 chained 不存在的方法(只能查方法名是否在白名单, 但 root 不在白名单时会拦, OK)
- ❌ `s("nonexistent")` 真的不在 sample 包里(校验时只在常见集查)
- ❌ 音乐性问题(代码合法但乐感差)
- ❌ 故意刺耳但参数都合法的代码

→ 客户端要做最后兜底(master limiter 等).
