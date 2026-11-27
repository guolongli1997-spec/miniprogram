# FlyTripVisa — Cloudflare Workers local dev image
FROM node:22-alpine

WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json* ./
RUN npm install

# Copy project files
COPY . .

EXPOSE 8787

# Start wrangler dev server
CMD ["npx", "wrangler", "dev", "--ip", "0.0.0.0", "--port", "8787"]
