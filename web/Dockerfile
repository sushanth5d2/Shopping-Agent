FROM node:20-alpine
WORKDIR /app

# Cache package manifests
COPY package.json package-lock.json* ./
RUN npm install --prefer-offline --no-audit

# Copy source and build
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
