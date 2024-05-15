import { Env } from './env';
import { handleProxy } from './proxy';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    const ttlString = request.headers.get('X-Proxy-TTL') || '86400';

    // Currently API usage only incurs costs for POST requests, and these also
    // tend to be the slowest. It may not be desirable to cache GET requests.
    const isProxyRequest =
      request.method === 'POST' &&
      (request.headers.get('content-type')?.includes('application/json') ||
       request.headers.get('content-type')?.includes('multipart/form-data')) &&
      ttlString !== '0';

    if (isProxyRequest) {
      return await handleProxy({
        request,
        env,
        ctx,
        ttl: ttlString ? Number(ttlString) : null,
        pathname,
      });
    }

    // Fallback response when not proxying (healthcheck)
    console.log('Not a proxy request, falling back to healthcheck.');
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        'content-type': 'application/json;charset=UTF-8',
      },
    });
  },
};
