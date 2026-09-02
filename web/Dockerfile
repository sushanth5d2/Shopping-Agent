FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline --no-audit || npm install --prefer-offline --no-audit

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
