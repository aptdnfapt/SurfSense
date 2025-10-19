/**
 * Simple runtime configuration manager
 * Fetches config from backend at runtime instead of using build-time NEXT_PUBLIC_* variables
 */

import React from 'react';

export interface AppConfig {
  authType: "GOOGLE" | "LOCAL";
  etlService: "UNSTRUCTURED" | "LLAMACLOUD" | "DOCLING";
  backendUrl: string;
  features: {
    googleAuthEnabled: boolean;
    localAuthEnabled: boolean;
  };
}

let cachedConfig: AppConfig | null = null;
let configPromise: Promise<AppConfig> | null = null;

/**
 * Fetch configuration from backend
 * Results are cached to avoid repeated API calls
 */
export async function fetchConfig(): Promise<AppConfig> {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }

  // If fetch is in progress, return existing promise
  if (configPromise) {
    return configPromise;
  }

  // Start new fetch
  configPromise = (async () => {
    try {
      // Determine backend URL based on environment
      // Server-side (SSR): use Docker service name
      // Client-side (browser): use env variable or localhost
      const isServer = typeof window === 'undefined';
      const backendUrl = isServer 
        ? (process.env.BACKEND_URL || 'http://backend:8000')  // Docker internal network
        : (process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL || 'http://localhost:8000');  // Browser accessible URL
      
      const response = await fetch(`${backendUrl}/api/v1/config`, {
        cache: 'no-store', // Always fetch fresh config
      });

      if (!response.ok) {
        throw new Error(`Config fetch failed: ${response.status}`);
      }

      const config = await response.json();
      
      // Override backendUrl with the one we used to fetch
      config.backendUrl = backendUrl;
      
      cachedConfig = config;
      return config;
    } catch (error) {
      console.error('Failed to fetch config, using defaults:', error);
      
      // Fallback to safe defaults
      const fallbackConfig: AppConfig = {
        authType: 'GOOGLE',
        etlService: 'UNSTRUCTURED',
        backendUrl: process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL || 'http://localhost:8000',
        features: {
          googleAuthEnabled: true,
          localAuthEnabled: false,
        },
      };
      
      cachedConfig = fallbackConfig;
      return fallbackConfig;
    }
  })();

  return configPromise;
}

/**
 * React hook for config
 * Use this in client components
 */
export function useConfig() {
  const [config, setConfig] = React.useState<AppConfig | null>(null);

  React.useEffect(() => {
    fetchConfig().then(setConfig);
  }, []);

  return config;
}

// For direct access (use sparingly)
export function getConfig(): AppConfig | null {
  return cachedConfig;
}
