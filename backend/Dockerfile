FROM node:18-alpine

# Install Docker CLI to manage containers
RUN apk add --no-cache docker-cli

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create repos directory
RUN mkdir -p /app/repos

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
