import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || "http://backend:8000";

export const dynamic = "force-dynamic";

async function proxyRequest(request: NextRequest, params: { path?: string[] }) {
  const segments = params.path ?? [];
  const pathname = Array.isArray(segments) ? segments.join("/") : segments;

  const targetUrl = new URL(pathname, BACKEND_BASE_URL);
  targetUrl.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  headers.set("host", targetUrl.host);

  const isBodyless = request.method === "GET" || request.method === "HEAD";

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: isBodyless ? undefined : request.body,
    redirect: "manual",
    cache: "no-store",
  });

  const responseHeaders = new Headers(response.headers);

  return new NextResponse(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxyRequest(request, context.params);
}

export async function POST(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxyRequest(request, context.params);
}

export async function PUT(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxyRequest(request, context.params);
}

export async function PATCH(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxyRequest(request, context.params);
}

export async function DELETE(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxyRequest(request, context.params);
}

export async function OPTIONS(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxyRequest(request, context.params);
}
