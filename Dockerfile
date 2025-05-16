# Use Node.js LTS version for Ubuntu server
FROM --platform=linux/amd64 node:20-slim

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    python-is-python3 \
    libsqlite3-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Set environment variables for SQLite3
ENV npm_config_build_from_source=true
ENV npm_config_sqlite=/usr
ENV npm_config_sqlite_libname=sqlite3
ENV npm_config_sqlite_libpath=/usr/lib
ENV npm_config_sqlite_include=/usr/include

# Install dependencies with SQLite3 build flags
RUN npm install --build-from-source

# Copy app source
COPY . .

# Create data directory for SQLite database 
RUN mkdir -p /usr/src/app/data

# Create data directory owned by node user to ensure correct permissions
RUN chown -R node:node /usr/src/app

# Switch to non-root user
USER node

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["npm", "start"] 