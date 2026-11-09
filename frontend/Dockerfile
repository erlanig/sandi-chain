FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# BACKEND_URL dibaca saat build (rewrites Next.js)
ARG BACKEND_URL=http://backend:4000
ENV BACKEND_URL=$BACKEND_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S sandi && adduser -S sandi -G sandi
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER sandi
EXPOSE 3000
CMD ["node", "server.js"]
