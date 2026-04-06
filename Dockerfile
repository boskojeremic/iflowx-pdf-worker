FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./

RUN corepack enable && pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

ENV NODE_ENV=production

CMD ["pnpm", "start"]