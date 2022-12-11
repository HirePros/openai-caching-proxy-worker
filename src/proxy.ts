import { getCachedResponse, getCacheKey, writeCachedResponse } from './cache';
import { Env } from './env';
import { getHeadersAsObject } from './utils';

interface HandleProxyOpts {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  ttl: number | null;
  pathname: string;
}
export const handleProxy = async ({
  request,
  env,
  ctx,
  ttl,
  pathname,
}: HandleProxyOpts): Promise<Response> => {
  const fetchMethod = request.method;
  const fetchPath = pathname.replace(/^\/proxy/, '');
  const fetchUrl = `https://api.openai.com/v1${fetchPath}`;
  const fetchHeaders = getHeadersAsObject(request.headers);
  const fetchBody = await request.text();
  const forceRefresh = request.headers.get('X-Proxy-Refresh') === 'true';

  const cacheKey = await getCacheKey({
    authHeader: request.headers.get('authorization'),
    body: fetchBody,
    method: fetchMethod,
    path: fetchPath,
  });

  if (forceRefresh) {
    console.log('X-Proxy-Refresh was true, forcing a cache refresh.');
  } else {
    const cachedResponse = await getCachedResponse({ cacheKey });
    if (cachedResponse) {
      console.log('Returning cached response.');
      return cachedResponse;
    }
  }

  console.log('No cached response found. Proxying and caching response instead.');

  const response = await fetch(fetchUrl, {
    method: fetchMethod,
    headers: fetchHeaders,
    body: fetchBody || null,
  });

  if (response.ok) {
    console.log('Writing 2xx response to cache: ', { cacheKey, ttl });
    await writeCachedResponse({
      cacheKey,
      ttl,
      response,
    });
  } else {
    console.log('Not caching error or empty response.');
  }

  return response;
};