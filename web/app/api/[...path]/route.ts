import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getDynamicBackendCandidates(req: NextRequest): string[] {
  const list: string[] = [];

  // 1. Explicit internal overrides take highest priority (e.g. Docker network alias)
  if (process.env.BACKEND_INTERNAL_URL) list.push(process.env.BACKEND_INTERNAL_URL);

  // 2. Direct local loopback / localhost (fastest & most reliable inside Codespaces and bare-metal)
  list.push('http://127.0.0.1:8000');
  list.push('http://localhost:8000');

  // 3. Container network aliases (Docker Compose / Kubernetes)
  list.push('http://backend:8000');
  list.push('http://shopagent-backend:8000');

  // 4. Custom public API URL environment variable if provided
  if (process.env.NEXT_PUBLIC_API_URL) list.push(process.env.NEXT_PUBLIC_API_URL);

  // 5. GitHub Codespaces / reverse-proxy forwarded domains
  const codespaceName = process.env.CODESPACE_NAME;
  const forwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev';
  if (codespaceName) {
    list.push(`https://${codespaceName}-8000.${forwardingDomain}`);
    list.push(`http://${codespaceName}-8000.${forwardingDomain}`);
  }

  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  if (host.includes('-3000.')) {
    list.push(`${proto}://${host.replace('-3000.', '-8000.')}`);
    list.push(`http://${host.replace('-3000.', '-8000.')}`);
  }

  // Deduplicate candidates while preserving priority order
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const url of list) {
    if (url && !seen.has(url)) {
      seen.add(url);
      deduped.push(url);
    }
  }
  return deduped;
}

async function handler(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  const pathStr = (params?.path || []).join('/');
  const candidateUrls = getDynamicBackendCandidates(request);

  const urlObj = new URL(request.url);
  const search = urlObj.search;

  // Deep analytical endpoints (live web scraping, batch processing, decision lab, URL adding) need up to 90s
  const isLongRunning = ['url-analyze', 'process', 'decision-lab', 'analyze', 'sync', 'items', 'intent'].some(p => pathStr.includes(p));
  const proxyTimeoutMs = isLongRunning ? 90000 : 30000;

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

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), proxyTimeoutMs);

      const response = await fetch(targetUrl, {
        method: request.method,
        headers,
        body,
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

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
    { detail: `Could not connect to backend server: ${lastError?.message || 'Connection refused. Ensure backend is running on port 8000.'}` },
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
