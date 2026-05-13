# VibeStrudel Live · 开发文档

> 把现有 VibeStrudel 单机版扩展为 **全球同步 24/7 电子乐工厂** 的实施计划。
> 目标:任何访客打开 `https://live.linkyun.co` 就能听见全球同一首正在演化的 Strudel jam,并可输入 vibe 影响走向。

---

## 1. 目标 / 非目标

### ✅ 范围内
- 所有访客**收到同一份当前 Strudel 代码**,自动在下个 cycle 接入
- 任何人可输入 vibe → AI 翻译 → 服务器广播给全员
- 严格全局限流避免 LLM 烧钱
- 服务器持有 LLM key,客户端不可见
- 用户可自带 key 跳过全局队列
- 服务器重启不丢"当前播放的代码"
- 单机模式(不带 `?live`)继续工作,不受影响

### ❌ 暂不做(留 Phase 2+)
- 强同步(bar-aligned 时钟)
- 投票 / 队列可视化
- 聊天 / 反应
- 历史回放 UI
- 用户身份 / 登录
- 移动端优化

---

## 2. 设计决策(已对齐)

| 维度 | 选择 | 备注 |
|------|------|------|
| 同步精度 | 弱同步 | Strudel `evaluate()` 在下个 cycle 自动切换,天然实现 |
| LLM 付费 | 服务器持 key | 环境变量 `GEMINI_API_KEY` |
| 月度封顶 | **$30** | 累计 spend ≥ $30 → 进入只读模式直到下月 |
| 全局频率 | 每 15s 一条 vibe | 全站共用一个 token bucket |
| per-IP 冷却 | 60s | 防同一人连续刷屏 |
| 控制模型 | 先到先得 | 没排队,谁先到锁住下个 15s 窗口 |
| 自带 key 旁路 | ✅ | 用户填 key → 跳全局队列,走自己额度,但代码仍广播 |
| 后端 | 自己 VPS + Docker Compose | Caddy 反代 + 自动 SSL |
| 持久化 | JSON 文件挂卷 | `./data/state.json` |
| LLM 模型 | **Gemini 3.1 Flash** | 服务器端固定,客户端不可改服务器端模型 |
| 域名 | `live.linkyun.co` | 待申请 |

---

## 3. 架构总览

```
                  ┌────────────────────────────────────┐
                  │           live.linkyun.co          │
                  │    (Cloudflare → VPS Caddy 443)    │
                  └──────────────────┬─────────────────┘
                                     │
       ┌─────────────────────────────┴─────────────────────────┐
       │                                                       │
       ▼                                                       ▼
  GET /  → Caddy serve static files                       WSS /live
  (index.html, themes/, vendor/strudel, vendor/samples)         │
       ▲                                                       ▼
       │                                              ┌────────────────────┐
       │                                              │   Node.js server   │
       │                                              │   (server.js)      │
   browser ◀────────── WS messages ─────────▶         │  ▸ state.code      │
       │  type:state / type:vibe / type:cooldown       │  ▸ state.seq       │
       │                                              │  ▸ rate limiter    │
       │                                              │  ▸ cost tracker    │
       │                                              │  ▸ LLM proxy       │
       │                                              └──────────┬─────────┘
       │                                                         │
       │                                                         ▼
       │                                           POST generativelanguage.googleapis.com
       │                                                  Gemini 3.1 Flash
       │
       └─── 收到 type:state → setCode(code) → evaluatePattern(code) → 下个 cycle 起效
```

---

## 4. WebSocket 协议

### 4.1 端点
`wss://live.linkyun.co/live`

### 4.2 服务器 → 客户端 消息

```jsonc
// 初次连接 + 任何代码更新都发这个
{
  "type": "state",
  "code": "setcpm(128/4)\nstack(...)",
  "seq": 142,                          // monotonic 计数,客户端可用来判断是否新
  "lastBy": "anon-3a2b",               // 改动人(IP 哈希前 4 字符)
  "lastAt": 1736208000000,
  "explanation": "起一段 128 BPM 的 techno jam",
  "viewersOnline": 23
}

// 频率/冷却提醒
{
  "type": "cooldown",
  "remainingSec": 12,                  // 还要等多少秒能再 vibe
  "reason": "global" | "per_ip" | "budget_exceeded"
}

// 错误(LLM 失败 / 代码校验失败)
{
  "type": "error",
  "message": "Gemini 429: rate limited"
}

// 周期 stats(每 30s 广播一次)
{
  "type": "stats",
  "viewersOnline": 23,
  "todayVibes": 145,
  "monthlySpentUSD": 4.32,
  "budgetCapUSD": 30,
  "readOnly": false
}

// 服务器关闭通知
{ "type": "bye", "reason": "server-restart" }
```

### 4.3 客户端 → 服务器 消息

```jsonc
// 提交 vibe
{
  "type": "vibe",
  "text": "让 bass 撕裂",
  "userKey": "AIza..."                 // 可选: 填了走自己额度,跳全局队列
}

// 心跳(每 25s 一次)
{ "type": "ping" }
```

### 4.4 错误码 / 状态

| reason | 含义 | 客户端 UX |
|--------|------|-----------|
| `global` | 全局 15s 窗口未到 | 显示 `WAIT Ns` 倒计时 |
| `per_ip` | 你刚改过 60s 内 | 显示 `CDN Ns 你本次` |
| `budget_exceeded` | 月度 $30 用完 | 显示 `本月预算用尽,只读直到下月` |
| `code_invalid` | LLM 返回不像 Strudel 代码 | 显示 `代码校验未过,稍后再试` |
| `prompt_too_long` | text > 500 字 | 显示 `指令过长(≤500 字)` |

---

## 5. 服务器实现

### 5.1 文件结构

```
server/
├── package.json
├── Dockerfile
├── server.js              # 主入口
├── llm.js                 # Gemini 调用 + cost 估算
├── state.js               # 状态机 + 持久化
├── ratelimit.js           # token bucket + per-IP map
├── prompt.js              # 与客户端共用的 system prompt
└── README.md
```

### 5.2 `server.js` 主要逻辑

```js
import { WebSocketServer } from "ws";
import http from "http";
import { State } from "./state.js";
import { RateLimiter } from "./ratelimit.js";
import { callGemini, estimateCost } from "./llm.js";

const state = await State.load("./data/state.json");
const limiter = new RateLimiter({ globalSeconds: 15, perIpSeconds: 60 });
const BUDGET_CAP = +(process.env.MONTHLY_CAP_USD || 30);

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") return res.writeHead(200).end("ok");
  if (req.url === "/stats")   return res.end(JSON.stringify(state.stats()));
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server, path: "/live" });

wss.on("connection", (ws, req) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
  ws.ip = ip;
  
  // 1. 连接即发当前状态
  ws.send(JSON.stringify({ type:"state", ...state.snapshot(), viewersOnline: wss.clients.size }));
  
  ws.on("message", async (msg) => {
    let m;
    try { m = JSON.parse(msg); } catch { return; }
    
    if (m.type === "ping") { ws.send(JSON.stringify({ type:"pong" })); return; }
    
    if (m.type === "vibe") {
      // 校验
      if (!m.text || m.text.length > 500) {
        return ws.send(JSON.stringify({ type:"error", message:"prompt_too_long" }));
      }
      
      const useOwnKey = m.userKey && m.userKey.length > 10;
      
      // 限流(仅服务器 key 路径)
      if (!useOwnKey) {
        if (state.monthlySpent >= BUDGET_CAP) {
          return ws.send(JSON.stringify({ type:"cooldown", remainingSec: -1, reason:"budget_exceeded" }));
        }
        const wait = limiter.check(ip);
        if (wait > 0) {
          return ws.send(JSON.stringify({ 
            type:"cooldown", 
            remainingSec: wait,
            reason: wait < 60 ? "global" : "per_ip"
          }));
        }
        limiter.consume(ip);
      }
      
      // 调 LLM
      try {
        const key = useOwnKey ? m.userKey : process.env.GEMINI_API_KEY;
        const { code, explanation, usedTokens } = await callGemini({
          key,
          currentCode: state.code,
          bpm: state.bpm,
          userText: m.text,
        });
        
        // 校验代码格式
        if (!/(stack|s|note|cat)\s*\(/.test(code)) {
          return ws.send(JSON.stringify({ type:"error", message:"code_invalid" }));
        }
        
        // 计费(只算服务器 key)
        if (!useOwnKey) state.addCost(estimateCost(usedTokens));
        
        // 更新 state + 广播
        state.update({ code, explanation, by: hashIp(ip) });
        await state.save();
        broadcastState();
      } catch (e) {
        ws.send(JSON.stringify({ type:"error", message: e.message }));
      }
    }
  });
});

function broadcastState() {
  const msg = JSON.stringify({ type:"state", ...state.snapshot(), viewersOnline: wss.clients.size });
  wss.clients.forEach(c => c.readyState === 1 && c.send(msg));
}

// 周期 stats 广播
setInterval(() => {
  const msg = JSON.stringify({
    type:"stats",
    viewersOnline: wss.clients.size,
    todayVibes: state.todayVibes,
    monthlySpentUSD: state.monthlySpent,
    budgetCapUSD: BUDGET_CAP,
    readOnly: state.monthlySpent >= BUDGET_CAP,
  });
  wss.clients.forEach(c => c.readyState === 1 && c.send(msg));
}, 30_000);

server.listen(process.env.PORT || 8080);
```

### 5.3 `state.js`

负责:
- 持久化 `state.json` 到挂卷 `/data`
- 当前 code / seq / lastBy / lastAt
- 当日 / 当月计费(滚动重置)
- 历史 50 条 vibes(简单 ring buffer,用于 debug)

```js
export class State {
  static async load(path) {...}
  async save() {...}              // 防抖写盘
  snapshot()                       // { code, seq, lastBy, lastAt, explanation }
  update({ code, explanation, by }) // seq++, 写入
  addCost(usd)                     // 计 today / month
  stats()                          // 统计信息
  monthlySpent  // getter
  todayVibes   // getter  
}
```

### 5.4 `ratelimit.js`

- 全局 token bucket: capacity 1, refill 1 / 15s
- per-IP Map: `{ ip -> lastVibeAt }`
- `check(ip)` 返回剩余等待秒数(0 = 可发)
- `consume(ip)` 记录这次发送

### 5.5 `llm.js`

```js
const PRICING = {
  // Gemini 3.1 Flash 按 token 算,具体单价上线时查官方
  inputPer1M: 0.075,
  outputPer1M: 0.30,
};

export async function callGemini({ key, currentCode, bpm, userText }) {
  const sys = SYSTEM_PROMPT
    .replace("__BPM__", String(bpm))
    .replace("__CODE__", currentCode || "// empty");
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash:generateContent?key=${key}`;
  const res = await fetch(url, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      systemInstruction:{ parts:[{ text: sys }] },
      contents: [{ role:"user", parts:[{ text: userText }] }],
      generationConfig: {
        temperature: 0.85,
        responseMimeType: "application/json",
        responseSchema: {
          type:"object",
          properties:{ code:{type:"string"}, explanation:{type:"string"} },
          required:["code","explanation"]
        }
      }
    })
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsed = JSON.parse(text);
  const usage = data?.usageMetadata || {};
  return {
    code: parsed.code,
    explanation: parsed.explanation,
    usedTokens: { in: usage.promptTokenCount || 0, out: usage.candidatesTokenCount || 0 }
  };
}

export function estimateCost({ in: i, out: o }) {
  return (i / 1e6) * PRICING.inputPer1M + (o / 1e6) * PRICING.outputPer1M;
}
```

### 5.6 `prompt.js`

把现有 `index.html` 里的 `SYSTEM_PROMPT` 字符串原样搬过来。**开发时**:抽成两份相同文件,一份在 `server/prompt.js`,一份在 client 用(或者通过构建步骤共享)。

---

## 6. 客户端改造

### 6.1 检测 live 模式

```js
const LIVE_MODE = new URLSearchParams(location.search).has("live") 
                  || location.hostname === "live.linkyun.co";
const WS_URL = location.protocol === "https:" 
              ? `wss://${location.host}/live` 
              : `ws://${location.host}/live`;
```

### 6.2 WS 客户端

```js
let ws, wsReconnectTimer;
function connectLive(){
  ws = new WebSocket(WS_URL);
  ws.onopen = () => log("sys", "✓ 已连接 live session");
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === "state")     handleState(m);
    if (m.type === "cooldown")  handleCooldown(m);
    if (m.type === "error")     log("err", m.message);
    if (m.type === "stats")     handleStats(m);
  };
  ws.onclose = () => {
    log("sys", "live 连接断开,5s 重连");
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = setTimeout(connectLive, 5000);
  };
  // 心跳
  setInterval(()=> ws?.readyState === 1 && ws.send(JSON.stringify({type:"ping"})), 25000);
}

function handleState(m){
  if (m.seq <= (state.lastSeq||0)) return;   // 旧消息
  state.lastSeq = m.seq;
  log("ai", `[${m.lastBy}] ${m.explanation}`);
  setCode(m.code);
  evaluatePattern(m.code);                    // 下个 cycle 接入
  updateOnlineCount(m.viewersOnline);
}

// 改 sendInstruction:live 模式走 WS,否则走原来直连 LLM
async function sendInstruction(text){
  if (LIVE_MODE){
    if (!ws || ws.readyState !== 1){ log("err","未连接 live"); return; }
    const userKey = $("send-with-own-key").checked ? llmCurrentKey() : null;
    ws.send(JSON.stringify({ type:"vibe", text, userKey }));
    log("usr", text + (userKey ? " (用自己 key)" : ""));
    promptEl.value = "";
    return;
  }
  // ... 原本单机逻辑
}
```

### 6.3 UI 变化

- 顶栏加 **`◉ LIVE · 23 online`** 状态徽章(LIVE 模式时显示)
- API KEY 设置框增加一项 **"使用自己 key 旁路队列"** 复选框
- SEND 按钮在冷却期间显示 `WAIT 12s`(动态倒数)
- console 显示 stats 行:`本月已用 $4.32 / $30 · 全站今日 145 vibes`
- 收到他人 vibe 时:`ai` tag 标注 `[anon-3a2b]` 表示作者

---

## 7. 部署

### 7.1 `Dockerfile`

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ .
EXPOSE 8080
CMD ["node", "server.js"]
```

### 7.2 `docker-compose.yml`

```yaml
services:
  app:
    build: .
    environment:
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - MONTHLY_CAP_USD=30
      - PORT=8080
    volumes:
      - ./data:/app/data
    restart: unless-stopped
  
  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - ./public:/srv/public:ro          # 静态文件(index.html + vendor)
      - caddy_data:/data
      - caddy_config:/config
    restart: unless-stopped

volumes:
  caddy_data:
  caddy_config:
```

### 7.3 `Caddyfile`

```
live.linkyun.co {
    # 静态资源
    root * /srv/public
    
    # WS 转发
    handle /live {
        reverse_proxy app:8080
    }
    handle /healthz {
        reverse_proxy app:8080
    }
    handle /stats {
        reverse_proxy app:8080
    }
    
    # 其它当静态
    handle {
        file_server
        # 长缓存
        @assets path /vendor/* /themes/*
        header @assets Cache-Control "public, max-age=31536000, immutable"
    }
    
    encode gzip zstd
}
```

### 7.4 部署流程(VPS 上)

```bash
# 一次性初始化
cd /opt
git clone https://github.com/stelee410/vibestrudel
cd vibestrudel

# 把静态站文件软链或复制到 ./public/
mkdir -p public
cp index.html public/
cp -r themes public/
cp -r vendor public/                # ⚠ 包括 strudel + samples
bash vendor/samples/fetch-samples.sh # 拉 ~3GB 样本

# 配置 secret
echo "GEMINI_API_KEY=AIza..." > .env

# 起服务
docker compose up -d --build

# 看日志
docker compose logs -f
```

### 7.5 后续更新

```bash
cd /opt/vibestrudel
git pull
docker compose up -d --build       # 滚动重启,WS 客户端会自动重连
```

---

## 8. 反滥用 / 安全

| 威胁 | 对策 |
|------|------|
| 单 IP 刷 vibe | 60s per-IP 冷却 |
| 全站刷成本 | 全局 15s 限流 + $30 月封顶 |
| Prompt injection 让 AI 输出非 Strudel | 服务端 regex 校验 `(stack|s|note|cat)\(` |
| 极长 prompt 烧 token | text ≤ 500 字 |
| 极响代码爆耳膜 | 客户端 audio output 加 master limiter(可选,Phase 2) |
| WS 连接洪水 | Caddy `rate_limit` + Cloudflare 前置 |
| 服务器宕机丢状态 | 每次 `update()` 后 debounce 1s 写盘 `state.json` |
| 用户自带 key 被滥用 | 用户自己的 key 自己负责,服务器只代调,不存 |

---

## 9. 监控 / 运维

### 必备
- `docker compose logs -f app` 看实时日志
- `curl https://live.linkyun.co/stats` 查 stats JSON
- `curl https://live.linkyun.co/healthz` 健康检查

### 可选(后续做)
- Prometheus exporter:暴露 viewersOnline / vibesPerHour / costToday
- Grafana dashboard
- Sentry 错误上报

---

## 10. 上线 checklist

- [ ] 申请 `live.linkyun.co` 域名,Cloudflare 解析到 VPS
- [ ] VPS 装 Docker + Compose
- [ ] 在 https://aistudio.google.com 创建生产 Gemini API key,设 quota $30/月警报
- [ ] 克隆仓库 + 拉样本(3GB)
- [ ] `.env` 写 `GEMINI_API_KEY`
- [ ] `docker compose up -d --build` 起服务
- [ ] 浏览器测试:无参数访问(单机模式)+ `?live`(连服务器)
- [ ] 多端测试:手机 + 电脑同时连,vibe 后看是否广播
- [ ] 限流测试:1 分钟内连发 5 个 vibe,看 cooldown 提示
- [ ] 月封顶测试:临时把 cap 改成 $0.01,验证只读模式生效
- [ ] 客户端兜底:服务器停了,客户端是否优雅降级到单机模式

---

## 11. 风险 / 未解决

1. **Gemini 3.1 Flash 实际端点名**:文档写的是 `gemini-3.1-flash`,上线时按 Google AI Studio 实际可用名称改
2. **样本包 3GB 体积**:VPS 磁盘需 ≥ 5GB free;若不够,可只装 dirt-samples + tidal-drum-machines (~450MB) 放弃 VCSL/piano
3. **冷启动**:新连接立刻收到 `state` 后,会跳到下个 cycle 接入,可能听感"突然有声音"。考虑用 `.gain(0)` → 渐入做平滑(Phase 2)
4. **服务器 NAT/防火墙**:443/80 必须开
5. **数据所有权**:用户输入的 vibe text 会被服务器看到(无用户自带 key 时)。是否需要在 UI 提示?
6. **CORS / WSS upgrade**:Caddy 自动处理,但代码部署前要验证 upgrade header

---

## 12. 工作量分解(明天)

| 步骤 | 估时 |
|------|------|
| 1. 申请域名 + Cloudflare 解析 | 15min |
| 2. server/ 目录脚手架(package.json / Dockerfile / 4 个 js 文件) | 60min |
| 3. server.js 完整实现 | 60min |
| 4. 客户端 WS 接入 + UI 改动 | 60min |
| 5. docker-compose + Caddyfile | 30min |
| 6. VPS 首次部署 + 调通 | 45min |
| 7. 端到端测试(限流 / 自带 key / 多端同步) | 45min |
| **合计** | **~5h** |

完成后可邀朋友连进来试。
