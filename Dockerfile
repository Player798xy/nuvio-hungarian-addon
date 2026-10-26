FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install production dependencies first (utilizes Docker layer caching)
COPY package*.json ./
RUN npm install --omit=dev

# Copy project source code
COPY . .

# Environment configuration
ENV NODE_ENV=production
ENV PORT=7000

# Expose default Stremio/Nuvio addon port
EXPOSE 7000

# Start server
CMD ["node", "server.js"]
