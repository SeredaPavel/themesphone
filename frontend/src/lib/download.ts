import { ORIGINAL_MAX_BYTES, validFileId } from './download-links.ts';
import { safeCatalogReturn } from './catalog-query.ts';

function failure(request: Request, code: string, status: number) {
  if (request.method === 'HEAD') return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
  if (request.headers.get('accept')?.includes('text/html')) {
    const input = new URL(request.url).searchParams;
    const query = new URLSearchParams({ reason: code });
    if (validFileId(input.get('wallpaper'))) query.set('wallpaper', input.get('wallpaper')!);
    const from = safeCatalogReturn(input.get('from'));
    if (from) query.set('from', from);
    return new Response(null, { status: 303, headers: { Location: '/download/error?' + query, 'Cache-Control': 'no-store' } });
  }
  return Response.json({ error: code }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function download(request: Request) {
  const query = new URL(request.url).searchParams;
  const id = query.get('file');
  if (!validFileId(id) || Array.from(query.keys()).some(key => !['file', 'wallpaper', 'from'].includes(key) || query.getAll(key).length !== 1)) return failure(request, 'invalid_file', 400);

  let origin: URL;
  try {
    origin = new URL(process.env.STRAPI_API_URL || '');
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw Error();
  } catch { return failure(request, 'service_unavailable', 503); }

  const abort = new AbortController();
  let timeout = setTimeout(() => abort.abort(), 15000);
  const onAbort = () => abort.abort();
  request.signal.addEventListener('abort', onAbort, { once: true });
  const cleanup = () => { clearTimeout(timeout); request.signal.removeEventListener('abort', onAbort); };
  let upstream: Response | undefined;
  try {
    if (request.signal.aborted) throw Error();
    upstream = await fetch(`${origin.origin}/api/wallpaper-files/${encodeURIComponent(id)}/download`, {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET', cache: 'no-store', redirect: 'manual',
      headers: { 'Accept-Encoding': 'identity' }, signal: abort.signal,
    });
    if (upstream.status === 302 && request.method !== 'HEAD') {
      const bucket = process.env.S3_ORIGINALS_BUCKET;
      const target = new URL(upstream.headers.get('location') || '');
      const params = target.searchParams;
      // A redirect from the trusted backend is accepted only to our private bucket.
      // Never fetch the object on the VPS or expose a client-supplied URL.
      if (!bucket || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ||
          target.origin !== 'https://storage.yandexcloud.net' || target.username || target.password || target.hash ||
          !new RegExp('^/' + bucket + '/originals/[a-f0-9]{32}\\.(jpg|png|webp)$').test(target.pathname) ||
          params.get('X-Amz-Algorithm') !== 'AWS4-HMAC-SHA256' ||
          !/^[a-f0-9]{64}$/.test(params.get('X-Amz-Signature') || '') ||
          !/^\d+$/.test(params.get('X-Amz-Expires') || '') || Number(params.get('X-Amz-Expires')) > 300 || Number(params.get('X-Amz-Expires')) < 30 ||
          !params.get('response-content-disposition')?.startsWith('attachment;')) throw Error();
      await upstream.body?.cancel(); cleanup();
      return new Response(null, { status: 302, headers: { Location: target.href,
        'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (upstream.status !== 200) {
      await upstream.body?.cancel(); cleanup();
      const status = [403, 404, 429].includes(upstream.status) ? upstream.status : 503;
      return failure(request, status === 403 ? 'payment_required' : status === 404 ? 'file_unavailable' : 'service_unavailable', status);
    }
    const mime = upstream.headers.get('content-type')?.split(';')[0].trim();
    const length = upstream.headers.get('content-length');
    const size = Number(length);
    const attachment = upstream.headers.get('content-disposition') || '';
    if (!mime || !['image/jpeg', 'image/png', 'image/webp'].includes(mime) || !length || !/^\d+$/.test(length) ||
        !Number.isSafeInteger(size) || size <= 0 || size > ORIGINAL_MAX_BYTES ||
        !/^attachment; filename="themesphone-[a-zA-Z0-9]{1,64}\.(jpg|png|webp)"; filename\*=UTF-8''(?:[a-zA-Z0-9._~-]|%[0-9A-Fa-f]{2})+$/.test(attachment) ||
        ![null, 'identity'].includes(upstream.headers.get('content-encoding'))) throw Error();

    const headers = { 'Content-Type': mime, 'Content-Length': String(size), 'Content-Disposition': attachment,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
    if (request.method === 'HEAD') { await upstream.body?.cancel(); cleanup(); return new Response(null, { headers }); }
    if (!upstream.body) throw Error();
    clearTimeout(timeout);
    timeout = setTimeout(() => abort.abort(), 180000);
    const reader = upstream.body.getReader();
    let received = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const chunk = await reader.read();
          if (chunk.done) {
            if (received !== size) throw Error();
            cleanup(); controller.close(); return;
          }
          received += chunk.value.byteLength;
          if (received > size || received > ORIGINAL_MAX_BYTES) throw Error();
          controller.enqueue(chunk.value);
        } catch {
          cleanup(); abort.abort(); await reader.cancel().catch(() => {});
          controller.error(new Error('Download interrupted'));
        }
      },
      async cancel() { cleanup(); abort.abort(); await reader.cancel().catch(() => {}); },
    });
    return new Response(body, { headers });
  } catch {
    cleanup(); abort.abort(); await upstream?.body?.cancel().catch(() => {});
    return failure(request, 'service_unavailable', 503);
  }
}
