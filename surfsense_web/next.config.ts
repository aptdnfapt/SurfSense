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
	// Enable standalone output for production Docker builds
	output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
};

// Wrap the config with createMDX
const withMDX = createMDX({});

export default withMDX(nextConfig);
