FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# First copy the config file to avoid fumadocs-mdx postinstall error
COPY source.config.ts ./
COPY content ./content

# Install dependencies with --ignore-scripts to skip postinstall
RUN pnpm install --ignore-scripts

# Now run the postinstall script manually
RUN pnpm fumadocs-mdx

# Copy source code
COPY . .

# Build app for production (like manual installation)
RUN pnpm build

EXPOSE 3000

# Start Next.js in production mode (like manual installation)
CMD ["pnpm", "start"] 