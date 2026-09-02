import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function handler(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  const pathStr = (params?.path || []).join('/');

  const candidateUrls = [
    process.env.BACKEND_INTERNAL_URL,
    'http://backend:8000',
    'http://shopagent-backend:8000',
    process.env.NEXT_PUBLIC_API_URL,
    'http://127.0.0.1:8000',
    'http://localhost:8000'
  ].filter(Boolean) as string[];

  const urlObj = new URL(request.url);
  const search = urlObj.search;

  let lastError: any = null;

  for (const baseUrl of candidateUrls) {
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const targetUrl = `${cleanBase}/api/${pathStr}${search}`;
    try {
      const headers = new Headers();
      request.headers.forEach((value, key) => {
        const k = key.toLowerCase();
        if (k !== 'host' && k !== 'connection' && k !== 'content-length') {
          headers.set(key, value);
        }
      });

      const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();

      const response = await fetch(targetUrl, {
        method: request.method,
        headers,
        body,
        cache: 'no-store',
      });

      const resHeaders = new Headers();
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'transfer-encoding') {
          resHeaders.set(key, value);
        }
      });

      const resBody = await response.arrayBuffer();
      return new NextResponse(resBody, {
        status: response.status,
        headers: resHeaders,
      });
    } catch (err: any) {
      lastError = err;
    }
  }

  return NextResponse.json(
    { detail: `Could not connect to backend server: ${lastError?.message || 'Connection refused'}` },
    { status: 502 }
  );
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;
