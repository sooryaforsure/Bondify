# Multi-stage Dockerfile for FRND High-Performance Realtime Backend
FROM denoland/deno:2.0.0

WORKDIR /app

# Cache dependencies
COPY deno.json ./
COPY src/ ./src/
COPY web-app/ ./web-app/

EXPOSE 3000

USER deno
CMD ["run", "--allow-net", "--allow-read", "--allow-env", "src/server.ts"]
