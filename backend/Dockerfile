FROM node:16-alpine

# Install Docker CLI
RUN apk add --no-cache docker-cli

# Create app directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy app source
COPY . .

# Create temp directory for code execution
RUN mkdir -p temp

# Expose port
EXPOSE 3001

# Start the server
CMD ["npm", "start"]
