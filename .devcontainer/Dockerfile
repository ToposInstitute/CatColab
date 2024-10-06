# Use a Debian base image
FROM debian:bullseye-slim AS base

# Install necessary packages
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    && :

# Install Node.js 18.x
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Verify Node.js version
#RUN node -v

# Install Rust
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y \
    && . "$HOME/.cargo/env" \
    && rustup update

# Ensure the Rust environment is available
ENV PATH="/root/.cargo/bin:${PATH}"

# Install pnpm globally
RUN npm install -g pnpm

# Copy project files so that we can install dependencies into the container image.
WORKDIR /app
COPY package.json pnpm-lock.yaml ./

# Install project dependencies
RUN pnpm install

# Pre-build the project (optional)
# RUN pnpm run build

# # Clean up
# RUN apt-get clean && rm -rf /var/lib/apt/lists/*

# Debug stage
FROM base AS debug
ARG START_SHELL_ON_FAIL
RUN [ "$START_SHELL_ON_FAIL" = "true" ] && bash || echo "Build continues"
