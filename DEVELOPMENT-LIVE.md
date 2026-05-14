# VibeStrudel Live · 开发文档 v2

> **可分享的多 session Strudel 协作同步服务**
> 任何人创建一个 session,得到一个短 URL `live.linkyun.co/s/aB3xY7Kp`,
> 把 URL 发给朋友(微信、Twitter、Discord),
> 大家进来后听到的代码完全一致,任何人 vibe 都广播给所有人。

---

## 1. 目标 / 非目标

### ✅ 范围内
- 多 session,UUID 路径,**社交分享友好**
- HTTP 轮询同步(无 WebSocket)
- Redis 唯一存储,无磁盘 IO
- 每个 session 独立的 Strudel 代码状态
- 5 分钟空闲 TTL 自动清理
- 服务端做代码合法性校验(JS syntax + Strudel 函数白名单)
- 两条 LLM 路径:
  - **自带 key**:客户端调 LLM,只把生成的代码 POST 上来
  - **云端 LLM**:客户端 POST 文字,服务器调 LLM,自动重试一次
- 单机模式(`/`)继续工作不受影响

### ❌ 暂不做(Phase 2+)
- 用户身份 / 登录
- session 公开列表 / 发现
- 投票 / 聊天 / 反应
- 强同步 / NTP 时钟对齐
- 历史回放 / 录制
- 移动端优化

---

## 2. 关键决策(已对齐)

| 维度 | 决定 |
|------|------|
| 同步协议 | **HTTP 轮询**(活跃 5s / 空闲 30s),`If-None-Match` 304 优化 |
| Session 存储 | **Redis 内存**,无磁盘落盘 |
| TTL | 5 分钟(每次 GET/POST 续命) |
| URL 形态 | `live.linkyun.co/s/<10字符 nanoid>` |
| ID 生成 | 服务端 |
| 并发写 | 后到者赢(简单覆盖) |
| 根路径 | splash 页 + "创建新 session" 按钮 |
| 自带 LLM 路径 | 客户端调 → POST 代码 → 服务端校验 → 入 Redis |
| 云端 LLM 路径 | POST 文字 → 服务端调 LLM → 校验 → 失败重试一次 → 入 Redis |
| 服务端 LLM 模型 | Gemini 3.1 Flash |
| 月度费用上限 | $30(超限 → 云端 LLM 路径返回 429 / readonly) |
| 全局限流 | 全站 15s/次 + per-IP 60s 冷却(仅云端 LLM 路径) |
| 自带 LLM 限流 | 仅 per-IP 防刷:每个 IP 5s/次 |
| 域名 | `live.linkyun.co`(待申请) |
| 部署 | Docker Compose:app + redis + caddy |

---

## 3. 架构总览

```
                   live.linkyun.co
                  (Caddy 443 + auto SSL)
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
   GET /              POST /sessions   GET /s/:id?seq=N
   (splash html)      → 创建 session    → 304 if not changed
                                        → 200 { code, seq, ... }
                                        每次刷 TTL=300s
        ▼                 ▼                 ▼
   ┌──────────────────────────────────────────┐
   │  Node.js HTTP server (Express/Fastify)   │
   │  ├─ /sessions       create               │
   │  ├─ /s/:id          GET (poll)           │
   │  ├─ /s/:id/code     POST (own LLM 路径)   │
   │  ├─ /s/:id/vibe     POST (cloud LLM 路径) │
   │  ├─ /healthz                             │
   │  └─ /stats                               │
   └────┬───────────────────────────┬─────────┘
        │ Redis client              │ HTTPS
        ▼                           ▼
   ┌──────────┐            Gemini 3.1 Flash
   │  Redis   │            (生成 + 重试)
   │ 内存唯一  │
   └──────────┘
```

---

## 4. HTTP API

### 4.1 创建 session

```
POST /sessions
→ 200 { id: "aB3xY7Kp", code: "// 等待第一条指令", seq: 0 }
```
- 服务端 nanoid 生成 10 字符 ID
- Redis: `SET session:aB3xY7Kp <json> EX 300`

### 4.2 拉取 session 状态(轮询)

```
GET /s/:id
Headers: If-None-Match: "<seq>"
→ 304 Not Modified                    (seq 没变,几乎零开销)
→ 200 { code, seq, lastBy, lastAt, explanation, sourceTag }
   ETag: "<seq>"
→ 404 (session 已过期或不存在)
```
- 每次 GET 续 TTL: `EXPIRE session:id 300`
- 客户端按 5s/30s 间隔轮询

### 4.3 上传代码(自带 LLM 路径)

```
POST /s/:id/code
Body: { code: "...", explanation?: "...", by?: "anon" }
→ 200 { seq: <new>, validated: true }
→ 400 { error: "code_invalid", details: "scope is not defined" }
→ 404 (session expired)
→ 429 (per-IP rate limit, 5s)
```
- 服务端校验流程见 §5
- 通过则 `SET session:id` + bump seq + EXPIRE 300

### 4.4 上传 vibe 文字(云端 LLM 路径)

```
POST /s/:id/vibe
Body: { text: "让 bass 撕裂", by?: "anon" }
→ 200 { seq: <new>, code: "...", explanation: "...", retried: 0 }
→ 429 { reason: "global"|"per_ip"|"budget_exceeded", remainingSec: N }
→ 400 { error: "code_invalid_after_retry" }
→ 404
```
- 命中限流:全局 15s + per-IP 60s + 月度 $30
- 服务端调 Gemini → 校验 → 失败带错误反馈给 LLM 再调一次 → 仍失败返回 400
- 通过则同 4.3 入库 + 增 seq

### 4.5 stats(可选,用于监控)

```
GET /stats
→ { totalSessions, monthlySpentUSD, budgetCapUSD, readOnly }
```

### 4.6 health

```
GET /healthz → "ok"
```

---

## 5. 服务端代码校验(关键差异化)

校验只能挡明显错误,**老实承认**:挡不住所有运行时问题。

### 5.1 校验流程

```
1. JS 语法解析 (acorn)              → 语法错误 直接返回 code_invalid
2. AST 遍历提取所有 CallExpression
3. 对所有顶级函数调用 (s, note, stack...) 检查白名单
   - 白名单: stack, cat, seq, s, n, note, sound, setcpm, cpm, silence, hush, samples, arrange, timeCat
4. 对所有 method call (.foo()) 检查白名单
   - Pattern method 白名单: ~80 个,详见 vendor/strudel/ 暴露的 prototype
5. 检查 .s("xxx") / .bank("xxx") 字符串参数
   - .s 必须是 17 个 dirt-samples 名 / 17 个 2 字母 drum / 任一 VCSL 名 / 任一 piano 名
   - .bank 必须是 72 个 tidal-drum-machines 名之一
6. 检查 .pan() 参数
   - 数字常量必须 ∈ [-1, 1]
   - 表达式调用 sine.range / rand.range 时,range 参数必须 ∈ [-1, 1]
7. 检查 .scale() 字符串
   - 必须 root:mode 格式,无空格
```

### 5.2 实现

```js
import { Parser } from "acorn";

const SAFE_TOPLEVEL = new Set(["stack","cat","seq","s","n","note","sound","setcpm","cpm","silence","hush","samples","arrange","timeCat"]);
const SAFE_METHODS = new Set([/* ~80 个,从 vendor/strudel/index.mjs 自动生成 */]);
const VALID_BANKS = new Set([/* 72 个 */]);
const VALID_DRUMS_BARE = new Set(["bd","sd","hh","cp","cb","lt","mt","ht"]);
const VALID_DRUMS_BANKED = new Set(["bd","sd","hh","oh","cp","rim","cb","lt","mt","ht","cr","rd","sh","tb","perc","misc","fx"]);

export function validate(code) {
  let ast;
  try {
    ast = Parser.parse(code, { ecmaVersion: 2022, sourceType: "module" });
  } catch (e) {
    return { ok: false, error: `JS syntax: ${e.message}` };
  }
  // 遍历 AST,逐项检查...
  return { ok: true };
}
```

校验**白名单清单**应当从 `vendor/strudel/index.mjs` 自动提取(grep `prototype.X = `),build 时生成 `server/whitelist.json`,而不是手维护。

### 5.3 老实声明:挡不住的问题

- ❌ `n("0 2 4").scale("C:minor").root("c4")` — `.root()` 是合法标识符,白名单内若加进了就会过(其实不在 80 个里,所以会挡住,但类似 typo 会漏)
- ❌ 运行时 binding 错(`s("nonexistent")` 真在 manifest 里查不到时,服务端能查;但若我们 manifest 跟实际 vendor/samples/ 不同步,会漏)
- ❌ 音乐性问题(代码合法但乐感差)
- ❌ 故意爆耳膜(`.gain(10)` 服务端可挡 gain > 1.5,但隐蔽方式也能炸)

→ Phase 2 可加客户端 master limiter 兜底。

---

## 6. 服务端项目结构

```
server/
├── package.json
├── Dockerfile
├── server.js              # 主入口 (Fastify)
├── routes/
│   ├── sessions.js        # POST /sessions, GET /s/:id
│   ├── code.js            # POST /s/:id/code (自带 LLM 路径)
│   ├── vibe.js            # POST /s/:id/vibe (云端 LLM 路径)
│   └── meta.js            # /healthz, /stats
├── lib/
│   ├── redis.js           # ioredis 客户端 + helpers
│   ├── ratelimit.js       # 全局 + per-IP token bucket
│   ├── llm.js             # Gemini 调用 + token 计费
│   ├── validate.js        # AST 校验
│   ├── whitelist.json     # 白名单(build 时生成)
│   └── prompt.js          # SYSTEM_PROMPT (与客户端共享)
└── README.md
```

### 关键依赖
- `fastify`(轻量高性能)
- `ioredis`(Redis 客户端)
- `nanoid`(短 ID)
- `acorn`(JS 解析)
- 不需要 `ws`(无 WebSocket)
- 不需要 文件系统操作

### 性能目标(单机)
- GET /s/:id: P99 < 5ms (Redis GET + ETag 比对)
- POST /s/:id/code: P99 < 50ms (校验主要耗时)
- POST /s/:id/vibe: P99 < 10s(LLM 调用是大头)
- 单机 1000 并发轮询无压力

---

## 7. 客户端改造

### 7.1 模式判断

```js
const PATH = location.pathname;
const SESSION_MATCH = PATH.match(/^\/s\/([a-zA-Z0-9_-]{6,20})$/);

if (SESSION_MATCH) {
  // Live mode: 进入 session
  state.sessionId = SESSION_MATCH[1];
  startLiveMode();
} else if (PATH === "/" || PATH === "/index.html") {
  // Splash mode: 显示创建按钮
  showSplash();
} else {
  // 单机模式
}
```

### 7.2 Splash 页(根 URL 显示)

简洁的 overlay,挡住主 UI:
```
┌────────────────────────────────────────┐
│         VIBE//STRUDEL · LIVE           │
│                                        │
│   一起做 24 小时电子乐工厂               │
│                                        │
│   [ 创建新 session ]                   │
│   [ 直接进单机模式 ]                   │
└────────────────────────────────────────┘
```
点 "创建" → `POST /sessions` → 跳转 `/s/<id>`

### 7.3 Live 模式 polling

```js
let lastSeq = 0, pollTimer, lastInteraction = Date.now();

async function pollLoop() {
  const interval = (Date.now() - lastInteraction < 60_000) ? 5000 : 30_000;
  try {
    const res = await fetch(`/s/${state.sessionId}`, {
      headers: lastSeq ? { "If-None-Match": `"${lastSeq}"` } : {}
    });
    if (res.status === 404) {
      log("err", "Session 已过期");
      stopPolling();
      return;
    }
    if (res.status === 200) {
      const data = await res.json();
      if (data.seq > lastSeq) {
        lastSeq = data.seq;
        log("ai", `[${data.lastBy}] ${data.explanation}`);
        setCode(data.code);
        evaluatePattern(data.code);
      }
    }
    // 304: 无变化,什么都不做
  } catch (e) {
    log("err", "拉取失败: " + e.message);
  }
  pollTimer = setTimeout(pollLoop, interval);
}
```

### 7.4 上传代码 / 上传 vibe

```js
async function pushCode(code, explanation) {
  // 自带 LLM 后调用,或手动编辑后按钮触发
  const res = await fetch(`/s/${state.sessionId}/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, explanation, by: state.nickname })
  });
  if (!res.ok) {
    const err = await res.json();
    log("err", `上传失败: ${err.error} - ${err.details||""}`);
    if (err.details) {
      // 如果有行号,标红行
      const m = err.details.match(/\((\d+):\d+\)/);
      if (m) markErrorLine(+m[1], err.details);
    }
    return;
  }
  // 成功:服务器会广播给所有 poller 包括自己
  log("sys","✓ 已推送到 session");
}

async function sendVibeCloud(text) {
  const res = await fetch(`/s/${state.sessionId}/vibe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, by: state.nickname })
  });
  if (res.status === 429) {
    const e = await res.json();
    log("err", `限流: ${e.reason}, 还需 ${e.remainingSec}s`);
    return;
  }
  if (!res.ok) {
    log("err", "云端生成失败");
    return;
  }
  // 成功:同上,等下次 poll 拿到
}
```

### 7.5 sendInstruction 路由

```js
async function sendInstruction(text) {
  if (!state.sessionId) {
    // 单机模式 → 原逻辑
    return originalSendInstruction(text);
  }
  // Live 模式
  if (llmCurrentKey()) {
    // 自带 LLM:本地调 LLM,生成代码,上传
    const { code, explanation } = await callLLM(text);
    await pushCode(code, explanation);
  } else {
    // 用云端 LLM
    await sendVibeCloud(text);
  }
}
```

### 7.6 UI 变化

- 顶栏 LIVE 徽章:`◉ LIVE · /s/aB3xY7Kp` (点击复制 URL)
- 设置面板增加:
  - 昵称(可选,默认 anon)
  - "用云端 LLM"开关(无自己 key 时强制开)
- console 看到他人 vibe:`[anon-3a2b] 起一段 ...`
- 拉取失败 / 过期:全局错误 toast
- TTL 提示:页面 idle 4 分钟后弹"再无操作 1 分钟后 session 过期"

---

## 8. 部署

### 8.1 docker-compose.yml

```yaml
services:
  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
    restart: unless-stopped
    # 不挂卷 - 内存唯一,重启丢数据是预期的
  
  app:
    build: .
    environment:
      - REDIS_URL=redis://redis:6379
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - MONTHLY_CAP_USD=30
      - PORT=8080
      - SESSION_TTL_SECONDS=300
      - GLOBAL_RATE_SECONDS=15
      - PER_IP_RATE_SECONDS=60
    depends_on:
      - redis
    restart: unless-stopped
  
  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - ./public:/srv/public:ro
      - caddy_data:/data
      - caddy_config:/config
    restart: unless-stopped

volumes:
  caddy_data:
  caddy_config:
```

### 8.2 Caddyfile

```
live.linkyun.co {
    # API 转 app
    handle /sessions* {
        reverse_proxy app:8080
    }
    handle /s/*/code {
        reverse_proxy app:8080
    }
    handle /s/*/vibe {
        reverse_proxy app:8080
    }
    handle /s/*  {                 # GET poll
        reverse_proxy app:8080
    }
    handle /healthz {
        reverse_proxy app:8080
    }
    handle /stats {
        reverse_proxy app:8080
    }
    
    # 静态站点
    handle {
        root * /srv/public
        file_server
        @assets path /vendor/* /themes/*
        header @assets Cache-Control "public, max-age=31536000, immutable"
    }
    
    encode gzip zstd
}
```

### 8.3 部署流程

```bash
# 一次性
ssh user@vps
cd /opt
git clone https://github.com/stelee410/vibestrudel
cd vibestrudel

# 静态文件
mkdir -p public
cp -r index.html themes vendor public/
bash vendor/samples/fetch-samples.sh    # ~3GB,可后台

# 服务端代码
cp -r server/ ./                          # 假设 repo 里已有

# 配置
echo "GEMINI_API_KEY=AIza..." > .env

# 起
docker compose up -d --build
docker compose logs -f
```

### 8.4 更新

```bash
git pull && docker compose up -d --build
```

---

## 9. 反滥用 / 安全

| 威胁 | 对策 |
|------|------|
| 同 IP 刷 vibe | per-IP 60s 冷却(云 LLM 路径)/ 5s(自带 LLM 路径) |
| 全站刷 LLM 烧钱 | 全局 15s + 月度 $30 封顶 |
| Prompt injection | 服务端 AST 校验拒绝非 Strudel 代码 |
| 极长 prompt | text ≤ 500 字 |
| 极响代码 | 校验阶段 reject `.gain(>1.5)` |
| Session UUID 暴力枚举 | 10 字符 nanoid → 62^10 ≈ 8×10^17,基本不可能 |
| 客户端伪造 ID 创建 | 服务端拒绝客户端指定 ID,只接受 POST /sessions 流程 |
| 同一 session 被两人写覆盖战 | 后到者赢 + 客户端提示 "代码刚被 anon-X 改了" |
| Redis 内存爆 | maxmemory 256MB + LRU 淘汰 |
| DDoS | Cloudflare 前置 + Caddy rate_limit 插件(可选) |

---

## 10. 监控

### 必备
- `docker compose logs -f app` 看实时
- `redis-cli INFO memory` 看内存
- `curl https://live.linkyun.co/stats` JSON 看大盘

### 关键指标
- **活跃 session 数** (`KEYS session:*` 的数量)
- **当月 LLM 花费** (`GET cost:YYYY-MM`)
- **每分钟 poll 数** / 每分钟 vibe 数
- **校验失败率** (`code_invalid` 错误占比)
- **平均重试次数**(云端 LLM 路径)

---

## 11. 上线 checklist

- [ ] 申请 `live.linkyun.co` → Cloudflare → A 记录到 VPS
- [ ] VPS Docker + Compose 已装
- [ ] AI Studio 创建 Gemini key,设置 $30/月警报
- [ ] git clone repo
- [ ] `bash vendor/samples/fetch-samples.sh`(~3GB 后台跑)
- [ ] 写 `.env` 设置 `GEMINI_API_KEY`
- [ ] `docker compose up -d --build`
- [ ] 测试根 URL → splash 页正常
- [ ] 测试创建 session → URL 跳转、Redis 里有 key
- [ ] 测试 polling:开两个 tab 同 session,一边改代码,另一边 5s 内看到
- [ ] 测试限流:60s 内 vibe 两次 → 第二次返回 429
- [ ] 测试 TTL:开一个 session 不用,5 分钟后访问 → 404
- [ ] 测试自带 key 路径 vs 云端 LLM 路径
- [ ] 测试代码校验:故意提交 `scope()` 这种 → 400
- [ ] 测试预算上限:临时改 cap=$0.01 → 触发 readonly

---

## 12. 风险 / 未解决

1. **Gemini 3.1 Flash 实际端点名**:`gemini-3.1-flash` 是占位,上线时按 Google AI Studio 实际可用名称改
2. **校验白名单维护**:Strudel 升级后函数集变化,白名单要重新生成。建议:`build-whitelist.js` 自动从 `vendor/strudel/index.mjs` 提取
3. **Redis 单点**:挂了所有 session 丢。MVP 可接受(本来就是 ephemeral 模型);Phase 2 可考虑 Redis sentinel
4. **同一 session 多人轮询**:100 人 × 5s 轮询 = 1200 reqs/分钟,Redis GET 单机轻松扛,但要确认 Caddy 不限速
5. **404 处理 UX**:session 过期后用户在做什么?他自动跳到 splash?还是停留显示提示?推荐:**停留显示"已过期 [创建新 session]"**
6. **冷启动**:第一次进 session 时 code 是空字符串。客户端要做兜底:显示"等待第一条 vibe"
7. **客户端伪造 by 字段**:任何人可填 nickname。Phase 2 加 cookie-based 一致性

---

## 13. 工作量分解

| 步骤 | 估时 |
|------|------|
| 1. 申请域名 + DNS 解析 | 15min |
| 2. 服务端 server/ 脚手架(Fastify + Redis) | 60min |
| 3. routes/sessions.js + GET 轮询 + ETag | 45min |
| 4. routes/code.js + 校验白名单生成 + 校验逻辑 | 90min |
| 5. routes/vibe.js + LLM 调用 + 重试逻辑 | 60min |
| 6. ratelimit.js (token bucket + per-IP) | 30min |
| 7. 客户端 splash 页 + 路由判断 | 30min |
| 8. 客户端 polling 循环 + sendInstruction 分发 | 60min |
| 9. 客户端 UI 改动(LIVE 徽章、设置项) | 30min |
| 10. docker-compose + Caddyfile | 30min |
| 11. VPS 首次部署 + 调通 SSL | 45min |
| 12. 端到端测试 + 边界 case | 60min |
| **合计** | **~9h** |

明天可一天搞完。
