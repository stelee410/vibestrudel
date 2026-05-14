FROM node:22-alpine

WORKDIR /app

# 装依赖
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# 复制源代码
COPY server.js ./
COPY lib/ ./lib/
COPY routes/ ./routes/

# 复制样本 manifest (校验时需要查 sample 名)
# 这些文件路径在 build context 之外, 所以构建时要从仓库根目录构建
# 见 docker-compose.yml 的 context 设置

EXPOSE 8080

ENV NODE_ENV=production

CMD ["node", "server.js"]
