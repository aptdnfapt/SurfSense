import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	typescript: {
		ignoreBuildErrors: true,
	},
	eslint: {
		ignoreDuringBuilds: true,
	},
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "**",
			},
		],
	},
	// Enable standalone output for Docker production builds
	// Always use standalone in production Dockerfile
	output: 'standalone',
};

// Wrap the config with createMDX
const withMDX = createMDX({});

export default withMDX(nextConfig);
