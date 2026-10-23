FROM mcr.microsoft.com/playwright:v1.62.1-noble
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production PORT=10000 DATA_DIR=/tmp/outcome-check
EXPOSE 10000
CMD ["node", "src/server.mjs"]
