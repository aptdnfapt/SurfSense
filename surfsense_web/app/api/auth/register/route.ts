import { NextResponse } from "next/server";

const backendUrl =
  process.env.FASTAPI_BACKEND_URL ||
  process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL;

export async function POST(req: Request) {
  if (!backendUrl) {
    return NextResponse.json(
      { detail: "FASTAPI_BACKEND_URL is not configured" },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const resp = await fetch(`${backendUrl}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await resp.json().catch(() => null);
    return NextResponse.json(data ?? {}, { status: resp.status });
  } catch (err) {
    return NextResponse.json({ detail: "Proxy error" }, { status: 502 });
  }
}
