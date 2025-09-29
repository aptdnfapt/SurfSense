export type AuthMode = "LOCAL" | "GOOGLE";

let cachedAuthMode: AuthMode | null = null;

export async function fetchAuthMode(): Promise<AuthMode> {
  if (cachedAuthMode) {
    return cachedAuthMode;
  }

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL}/api/v1/auth/config`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch auth config: ${response.status}`);
    }

    const data = (await response.json()) as { authType?: string };
    const mode = (data.authType || "GOOGLE").toUpperCase();
    cachedAuthMode = mode === "LOCAL" ? "LOCAL" : "GOOGLE";
  } catch (error) {
    console.error("Unable to load auth config, defaulting to GOOGLE.", error);
    cachedAuthMode = "GOOGLE";
  }

  return cachedAuthMode;
}
