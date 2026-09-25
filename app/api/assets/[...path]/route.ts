const ASSET_BASE = "https://warframe.market/static/assets/";
const REQUEST_INTERVAL_MS = 350;
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface CachedAsset {
  body: ArrayBuffer;
  contentType: string;
  expiresAt: number;
}

const assetCache = new Map<string, CachedAsset>();
const inFlight = new Map<string, Promise<Response>>();
let nextUpstreamRequestAt = 0;
let requestQueue = Promise.resolve();

function queueUpstreamRequest<T>(request: () => Promise<T>): Promise<T> {
  const queuedRequest = requestQueue.then(async () => {
    const waitMs = Math.max(0, nextUpstreamRequestAt - Date.now());
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    nextUpstreamRequestAt = Date.now() + REQUEST_INTERVAL_MS;
    return request();
  });

  requestQueue = queuedRequest.then(
    () => undefined,
    () => undefined,
  );
  return queuedRequest;
}

function responseFromCache(asset: CachedAsset): Response {
  return new Response(asset.body, {
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Content-Type": asset.contentType,
    },
  });
}

async function loadAsset(path: string): Promise<Response> {
  const cached = assetCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return responseFromCache(cached);
  if (cached) assetCache.delete(path);

  const existingRequest = inFlight.get(path);
  if (existingRequest) return existingRequest;

  const request = queueUpstreamRequest(async () => {
    const upstream = await fetch(`${ASSET_BASE}${path}`, {
      headers: { Accept: "image/avif,image/webp,image/png,image/*,*/*;q=0.8" },
      cache: "no-store",
    });

    if (!upstream.ok) {
      return new Response("Asset unavailable", { status: upstream.status });
    }

    const asset: CachedAsset = {
      body: await upstream.arrayBuffer(),
      contentType: upstream.headers.get("content-type") ?? "image/png",
      expiresAt: Date.now() + CACHE_MAX_AGE_MS,
    };
    assetCache.set(path, asset);
    return responseFromCache(asset);
  });

  inFlight.set(path, request);
  try {
    return await request;
  } finally {
    inFlight.delete(path);
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const path = segments.join("/");
  if (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
    || !path.startsWith("items/images/")
  ) {
    return new Response("Invalid asset path", { status: 400 });
  }

  return loadAsset(path);
}