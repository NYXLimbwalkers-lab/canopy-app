FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --production
COPY server.js .
EXPOSE 3000
CMD ["node", "server.js"]
