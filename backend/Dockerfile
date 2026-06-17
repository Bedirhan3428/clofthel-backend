# Use official Node.js Alpine image for a super lightweight build
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy remaining files
COPY . .

# Expose default Hugging Face port
EXPOSE 7860

# Set environment variable defaults
ENV PORT=7860
ENV NODE_ENV=production

# Start the application
CMD ["npm", "start"]
