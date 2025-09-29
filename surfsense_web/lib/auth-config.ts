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
    let response: Response | null = null;
    const attempts = 6;
    const baseDelayMs = 500;
    for (let i = 0; i < attempts; i++) {
      try {
        response = await fetch("/api/proxy/api/v1/auth/config", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });
        if (response.ok) break;
      } catch (_) {}
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, i)));
      }
    }
    if (!response || !response.ok) throw new Error("auth config fetch failed");

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
  } catch (_) {
    // Do not cache fallback so subsequent calls can succeed once backend is ready
    return {
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
