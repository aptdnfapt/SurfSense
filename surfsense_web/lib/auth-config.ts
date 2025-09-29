export type AuthMode = "LOCAL" | "GOOGLE";

export type RuntimeConfig = {
  authType: AuthMode;
  etlService: string;
  backendBaseUrl: string;
};

let cachedConfig: RuntimeConfig | null = null;

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const response = await fetch("/api/proxy/api/v1/auth/config", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch auth config: ${response.status}`);
    }

    const data = (await response.json()) as {
      authType?: string;
      etlService?: string;
      backendBaseUrl?: string;
    };

    const authType = (data.authType || "GOOGLE").toUpperCase() === "LOCAL" ? "LOCAL" : "GOOGLE";
    const etlService = (data.etlService || "UNSTRUCTURED").toUpperCase();
    const backendBaseUrl = data.backendBaseUrl || "";

    cachedConfig = {
      authType,
      etlService,
      backendBaseUrl,
    };
  } catch (error) {
    console.error("Unable to load runtime config, defaulting to GOOGLE + UNSTRUCTURED.", error);
    cachedConfig = {
      authType: "GOOGLE",
      etlService: "UNSTRUCTURED",
      backendBaseUrl: "",
    };
  }

  return cachedConfig;
}

export function getCachedRuntimeConfig(): RuntimeConfig | null {
  return cachedConfig;
}

export function resetRuntimeConfigCache() {
  cachedConfig = null;
}
