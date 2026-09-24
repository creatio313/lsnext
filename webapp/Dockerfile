FROM node:26 AS deps
WORKDIR /app

COPY nextjsapp/package.json nextjsapp/package-lock.json ./
RUN npm ci

FROM node:26 AS build
WORKDIR /app

ARG APP_URL
ENV APP_URL=$APP_URL

COPY --from=deps /app/node_modules ./node_modules
COPY nextjsapp/ ./
RUN npm run build

FROM gcr.io/distroless/nodejs26-debian13:nonroot-amd64
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=8080

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 8080
CMD ["server.js"]