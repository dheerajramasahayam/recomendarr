FROM node:20.18-alpine3.21 AS builder

# Upgrade Alpine packages to fix busybox and zlib vulnerabilities
# Install python and build tools needed to rebuild SQLite from source for the target platform architecture
RUN apk update && apk upgrade --no-cache && \
    apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Force rebuild better-sqlite3 for the target architecture BEFORE Next.js bundles it
RUN npm rebuild better-sqlite3 --build-from-source

RUN npm run build

FROM node:20.18-alpine3.21 AS runner
WORKDIR /app

# Upgrade Alpine packages to fix busybox and zlib vulnerabilities
RUN apk update && apk upgrade --no-cache

# Remove npm and yarn completely from the runner stage to fix their vulnerabilities
RUN rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /opt/yarn* \
    /usr/local/bin/yarn*

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
