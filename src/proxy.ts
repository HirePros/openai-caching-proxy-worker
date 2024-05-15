import { getCacheKey, ResponseCache } from './cache';
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
  const forceRefresh = request.headers.get('X-Proxy-Refresh') === 'true';
  const contentType = request.headers.get('content-type') || '';
  const fileNameHeader = request.headers.get('X-File-Name') || '';

  let fetchBody: any;
  if (contentType.includes('multipart/form-data')) {
    fetchBody = await request.formData();
  } else {
    fetchBody = await request.text();
  }

  const cacheKey = await getCacheKey({
    authHeader: request.headers.get('authorization'),
    contentType: contentType,
    body: fetchBody,
    method: fetchMethod,
    path: fetchPath,
    fileNameHeader: fileNameHeader
  });
  const responseCache = new ResponseCache({ env });

  if (forceRefresh) {
    console.log('X-Proxy-Refresh was true, forcing a cache refresh.');
  } else {
    const cachedResponse = await responseCache.read({ cacheKey });
    if (cachedResponse) {
      console.log('Returning cached response.');
      return cachedResponse;
    }
  }

  console.log('No cached response found. Proxying and caching response instead.');

  let response: Response;
  if (contentType.includes('multipart/form-data')) {
    // Remove 'content-type' header from fetchHeaders if it exists
    if (fetchHeaders['content-type']) {
      delete fetchHeaders['content-type'];
    }
    response = await fetch(fetchUrl, {
      method: fetchMethod,
      headers: fetchHeaders,
      body: fetchBody,
    });
  } else {
    response = await fetch(fetchUrl, {
      method: fetchMethod,
      headers: fetchHeaders,
      body: fetchBody || null,
    });
  }

  if (response.ok) {
    console.log('Writing 2xx response to cache: ', { cacheKey, ttl });
    const writeCachePromise = responseCache.write({
      cacheKey,
      ttl,
      response,
    });
    // https://developers.cloudflare.com/workers/runtime-apis/fetch-event/#waituntil
    ctx.waitUntil(writeCachePromise);
  } else {
    console.log('Not caching error or empty response.');
  }

  return response;
};

