#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Install dependencies
pnpm install

# Build the project
pnpm run build

# Start the development server with the host option
pnpm run dev
