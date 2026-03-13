FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

# Copy package files and install
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and tests
COPY src/ src/
COPY test/ test/

# Run integration tests
CMD ["node", "--test", "test/integration.test.js"]
