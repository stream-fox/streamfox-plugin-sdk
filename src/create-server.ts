import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { normalizeError, ProtocolError } from "./errors";
import type {
  AnySettingField,
  InstallOptions,
  SettingPrimitive,
} from "./install";
import { parseInstallSettings } from "./install";
import type { MediaPlugin } from "./plugin";
import {
  validateRedirectInstruction,
  validateRequest,
  validateResponse,
} from "./validators";
import {
  SCHEMA_VERSION_CURRENT,
  type FilterSpec,
  type ManifestIndex,
  type RequestFilter,
  type RequestPage,
  type RequestSort,
  type ResourceKind,
  type ResourceRequestMap,
} from "./types";
import { isRecord } from "./utils";

const TEXT_MIME_BY_EXTENSION: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const moduleDir =
  typeof __dirname === "string"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

export interface FrontendOptions {
  enabled?: boolean;
  mountPath?: string;
  assetsMountPath?: string;
  distPath?: string;
}

export interface DeepLinkOptions {
  enabled?: boolean;
  scheme?: string;
  manifestPath?: string;
}

export interface CreateServerOptions {
  basePath?: string;
  enableCors?: boolean;
  frontend?: FrontendOptions | boolean;
  deeplink?: DeepLinkOptions;
  installer?: InstallOptions | boolean;
}

interface RouteIdentifiers {
  mediaType?: string;
  catalogID?: string;
  itemID?: string;
  pluginKind?: string;
}

interface NormalizedInstaller {
  enabled: boolean;
  configurationRequired: boolean;
  title: string;
  subtitle: string;
  description: string;
  logo?: string;
  installButtonText: string;
  openManifestButtonText: string;
  fields: readonly AnySettingField[];
}

function normalizePathPrefix(value: string | undefined): string {
  if (!value || value === "/") {
    return "";
  }

  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
}

function parseOptionalString(value: string | null): string | undefined {
  if (value === null) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function parseIntegerQueryValue(
  value: string | null,
  key: string,
  traceId?: string,
): number | undefined {
  if (value === null || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw ProtocolError.requestInvalid(
      `query parameter '${key}' must be an integer`,
      { key, value },
      traceId,
    );
  }

  return parsed;
}

function parseBooleanQueryValue(
  value: string | null,
  key: string,
  traceId?: string,
): boolean | undefined {
  const normalized = parseOptionalString(value)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  ) {
    return true;
  }

  if (
    normalized === "0" ||
    normalized === "false" ||
    normalized === "no" ||
    normalized === "off"
  ) {
    return false;
  }

  throw ProtocolError.requestInvalid(
    `query parameter '${key}' must be a boolean`,
    { key, value },
    traceId,
  );
}

function parseStringListQuery(
  searchParams: URLSearchParams,
  key: string,
): string[] | undefined {
  const values = searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return values.length > 0 ? values : undefined;
}

function rejectStructuredQueryParam(
  searchParams: URLSearchParams,
  key: string,
  traceId?: string,
): void {
  const value = parseOptionalString(searchParams.get(key));
  if (!value) {
    return;
  }

  throw ProtocolError.requestInvalid(
    `query parameter '${key}' is not supported on GET resource routes; use plain query aliases instead`,
    { key, value },
    traceId,
  );
}

function parseSchemaVersionFromQuery(
  searchParams: URLSearchParams,
  traceId?: string,
): { major: number; minor: number } {
  rejectStructuredQueryParam(searchParams, "schemaVersion", traceId);

  const major = parseIntegerQueryValue(
    searchParams.get("schemaMajor"),
    "schemaMajor",
    traceId,
  );
  const minor = parseIntegerQueryValue(
    searchParams.get("schemaMinor"),
    "schemaMinor",
    traceId,
  );

  if (major === undefined && minor === undefined) {
    return { ...SCHEMA_VERSION_CURRENT };
  }

  if (major === undefined || minor === undefined) {
    throw ProtocolError.requestInvalid(
      "query parameters 'schemaMajor' and 'schemaMinor' must be provided together",
      { schemaMajor: major, schemaMinor: minor },
      traceId,
    );
  }

  return { major, minor };
}

function parseExperimentalScalar(
  value: string,
): string | number | boolean | null {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return "";
  }

  if (normalized === "null") {
    return null;
  }

  const lower = normalized.toLowerCase();
  if (lower === "true") {
    return true;
  }
  if (lower === "false") {
    return false;
  }

  if (/^-?\d+$/.test(normalized)) {
    const parsed = Number.parseInt(normalized, 10);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }

  if (/^-?(?:\d+\.\d+|\d+\.)$/.test(normalized)) {
    const parsed = Number.parseFloat(normalized);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return normalized;
}

function parseExperimentalFromQuery(
  searchParams: URLSearchParams,
  traceId?: string,
): Array<{ namespace: string; key: string; value: unknown }> | undefined {
  const rawValues = searchParams.getAll("experimental");
  for (const value of rawValues) {
    const normalized = value.trim();
    if (normalized.startsWith("[") || normalized.startsWith("{")) {
      throw ProtocolError.requestInvalid(
        "query parameter 'experimental' is not supported on GET resource routes; use plain query aliases instead",
        { key: "experimental", value },
        traceId,
      );
    }
  }

  const tokens = rawValues
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (tokens.length === 0) {
    return undefined;
  }

  return tokens.map((token) => {
    const first = token.indexOf(":");
    const second = token.indexOf(":", first + 1);

    if (first <= 0 || second === first + 1) {
      throw ProtocolError.requestInvalid(
        "query parameter 'experimental' must use 'namespace:key[:value]' format",
        { experimental: token },
        traceId,
      );
    }

    const namespace = token.slice(0, first).trim();
    const key =
      second === -1
        ? token.slice(first + 1).trim()
        : token.slice(first + 1, second).trim();
    const rawValue = second === -1 ? undefined : token.slice(second + 1).trim();

    if (!namespace || !key) {
      throw ProtocolError.requestInvalid(
        "query parameter 'experimental' must use non-empty namespace and key segments",
        { experimental: token },
        traceId,
      );
    }

    return {
      namespace,
      key,
      value:
        rawValue === undefined ? true : parseExperimentalScalar(rawValue),
    };
  });
}

function assertNeverResource(value: never, traceId?: string): never {
  throw ProtocolError.requestInvalid(
    `Unsupported resource '${String(value)}'`,
    undefined,
    traceId,
  );
}

function resolveIdentifierFromPathOrQuery(
  searchParams: URLSearchParams,
  routeIdentifiers: RouteIdentifiers,
  key: keyof RouteIdentifiers,
): string {
  return routeIdentifiers[key] ?? searchParams.get(key) ?? "";
}

function withCanonicalRouteIdentifiers<K extends ResourceKind>(
  resource: K,
  request: ResourceRequestMap[K],
  routeIdentifiers: RouteIdentifiers,
): ResourceRequestMap[K] {
  switch (resource) {
    case "catalog":
      return {
        ...request,
        ...(routeIdentifiers.catalogID !== undefined
          ? { catalogID: routeIdentifiers.catalogID }
          : {}),
        ...(routeIdentifiers.mediaType !== undefined
          ? { mediaType: routeIdentifiers.mediaType }
          : {}),
      } as ResourceRequestMap[K];
    case "meta":
    case "stream":
    case "subtitles":
      return {
        ...request,
        ...(routeIdentifiers.itemID !== undefined
          ? { itemID: routeIdentifiers.itemID }
          : {}),
        ...(routeIdentifiers.mediaType !== undefined
          ? { mediaType: routeIdentifiers.mediaType }
          : {}),
      } as ResourceRequestMap[K];
    case "plugin_catalog":
      return {
        ...request,
        ...(routeIdentifiers.catalogID !== undefined
          ? { catalogID: routeIdentifiers.catalogID }
          : {}),
        ...(routeIdentifiers.pluginKind !== undefined
          ? { pluginKind: routeIdentifiers.pluginKind }
          : {}),
      } as ResourceRequestMap[K];
    default:
      return assertNeverResource(resource);
  }
}

function parsePageFromQuery(
  searchParams: URLSearchParams,
  traceId?: string,
): RequestPage | undefined {
  const page = parseIntegerQueryValue(searchParams.get("page"), "page", traceId);
  const index = parseIntegerQueryValue(
    searchParams.get("pageIndex"),
    "pageIndex",
    traceId,
  );
  const size = parseIntegerQueryValue(
    searchParams.get("pageSize"),
    "pageSize",
    traceId,
  );
  if (page === undefined && index === undefined && size === undefined) {
    return undefined;
  }

  return {
    index: page ?? index ?? 0,
    ...(size !== undefined ? { size } : {}),
  };
}

function parseSortFromQuery(searchParams: URLSearchParams): RequestSort | undefined {
  const key = parseOptionalString(searchParams.get("sortKey"));
  const direction = parseOptionalString(searchParams.get("sortDirection"));
  if (!key && !direction) {
    return undefined;
  }

  const normalizedDirection =
    direction?.toLowerCase() === "desc"
      ? "descending"
      : direction?.toLowerCase() === "asc"
        ? "ascending"
        : direction;

  return {
    key: key ?? "",
    direction: (normalizedDirection ?? "ascending") as RequestSort["direction"],
  };
}

function parseContextFromQuery(
  searchParams: URLSearchParams,
): Record<string, unknown> | undefined {
  const context: Record<string, unknown> = {};
  const locale = parseOptionalString(searchParams.get("locale"));
  const regionCode = parseOptionalString(searchParams.get("regionCode"));

  if (locale) {
    context.locale = locale;
  }

  if (regionCode) {
    context.regionCode = regionCode;
  }

  const queryTraceId = parseOptionalString(searchParams.get("traceID"));
  if (queryTraceId) {
    context.traceID = queryTraceId;
  }

  return Object.keys(context).length > 0 ? context : undefined;
}

function parsePlaybackFromQuery(
  searchParams: URLSearchParams,
  traceId?: string,
): Record<string, unknown> | undefined {
  const playback: Record<string, unknown> = {};
  const startPositionSeconds = parseIntegerQueryValue(
    searchParams.get("startPositionSeconds"),
    "startPositionSeconds",
    traceId,
  );
  const networkProfile = parseOptionalString(searchParams.get("networkProfile"));

  if (startPositionSeconds !== undefined) {
    playback.startPositionSeconds = startPositionSeconds;
  }

  if (networkProfile !== undefined) {
    playback.networkProfile = networkProfile;
  }

  return Object.keys(playback).length > 0 ? playback : undefined;
}

function buildFilterValueFromAlias(
  spec: FilterSpec,
  searchParams: URLSearchParams,
  traceId?: string,
): RequestFilter["value"] | undefined {
  const directValues = searchParams.getAll(spec.key);
  const directValue = directValues[directValues.length - 1] ?? null;

  switch (spec.valueType) {
    case "string": {
      const value = parseOptionalString(directValue);
      return value ? { kind: "string", string: value } : undefined;
    }
    case "int": {
      const value = parseIntegerQueryValue(directValue, spec.key, traceId);
      return value !== undefined ? { kind: "int", int: value } : undefined;
    }
    case "bool": {
      const value = parseBooleanQueryValue(directValue, spec.key, traceId);
      return value !== undefined ? { kind: "bool", bool: value } : undefined;
    }
    case "stringList": {
      const values = parseStringListQuery(searchParams, spec.key);
      return values && values.length > 0
        ? { kind: "stringList", stringList: values }
        : undefined;
    }
    case "intRange": {
      const directInt = parseIntegerQueryValue(directValue, spec.key, traceId);
      const min = parseIntegerQueryValue(
        searchParams.get(`${spec.key}Min`),
        `${spec.key}Min`,
        traceId,
      );
      const max = parseIntegerQueryValue(
        searchParams.get(`${spec.key}Max`),
        `${spec.key}Max`,
        traceId,
      );

      if (directInt !== undefined) {
        return {
          kind: "intRange",
          intRange: {
            min: directInt,
            max: directInt,
          },
        };
      }

      if (min !== undefined || max !== undefined) {
        return {
          kind: "intRange",
          intRange: {
            ...(min !== undefined ? { min } : {}),
            ...(max !== undefined ? { max } : {}),
          },
        };
      }

      return undefined;
    }
    default:
      return undefined;
  }
}

function parseCatalogFiltersFromQuery(
  searchParams: URLSearchParams,
  manifestIndex: ManifestIndex | undefined,
  catalogID: string,
  traceId?: string,
): RequestFilter[] | undefined {
  const endpoint = manifestIndex?.catalogEndpointByID.get(catalogID);
  const filterSpecs = endpoint?.filters ?? [];

  if (filterSpecs.length === 0) {
    return undefined;
  }

  const synthesizedFilters = filterSpecs
    .map((spec) => {
      const value = buildFilterValueFromAlias(spec, searchParams, traceId);
      return value ? ({ key: spec.key, value } satisfies RequestFilter) : undefined;
    })
    .filter((filter): filter is RequestFilter => filter !== undefined);

  return synthesizedFilters.length > 0 ? synthesizedFilters : undefined;
}

function parseVideoFingerprintFromQuery(
  searchParams: URLSearchParams,
  traceId?: string,
): Record<string, unknown> | undefined {
  rejectStructuredQueryParam(searchParams, "videoFingerprint", traceId);

  const hash = parseOptionalString(searchParams.get("videoHash"));
  const size = parseIntegerQueryValue(
    searchParams.get("videoSize"),
    "videoSize",
    traceId,
  );
  const filename = parseOptionalString(searchParams.get("filename"));

  if (hash === undefined && size === undefined && filename === undefined) {
    return undefined;
  }

  return {
    ...(hash !== undefined ? { hash } : {}),
    ...(size !== undefined ? { size } : {}),
    ...(filename !== undefined ? { filename } : {}),
  };
}

function parseRequestFromQuery<K extends ResourceKind>(
  resource: K,
  searchParams: URLSearchParams,
  routeIdentifiers: RouteIdentifiers = {},
  manifestIndex?: ManifestIndex,
  headerTraceId?: string,
): ResourceRequestMap[K] {
  rejectStructuredQueryParam(searchParams, "request", headerTraceId);
  rejectStructuredQueryParam(searchParams, "context", headerTraceId);
  rejectStructuredQueryParam(searchParams, "sort", headerTraceId);
  rejectStructuredQueryParam(searchParams, "filters", headerTraceId);
  rejectStructuredQueryParam(searchParams, "playback", headerTraceId);

  const schemaVersion = parseSchemaVersionFromQuery(searchParams, headerTraceId);
  const context = parseContextFromQuery(searchParams);
  const experimental = parseExperimentalFromQuery(searchParams, headerTraceId);
  const mediaType = resolveIdentifierFromPathOrQuery(
    searchParams,
    routeIdentifiers,
    "mediaType",
  );
  const catalogID = resolveIdentifierFromPathOrQuery(
    searchParams,
    routeIdentifiers,
    "catalogID",
  );
  const itemID = resolveIdentifierFromPathOrQuery(
    searchParams,
    routeIdentifiers,
    "itemID",
  );
  const pluginKind = resolveIdentifierFromPathOrQuery(
    searchParams,
    routeIdentifiers,
    "pluginKind",
  );

  switch (resource) {
    case "catalog": {
      const query = parseOptionalString(searchParams.get("query"));
      const page = parsePageFromQuery(searchParams, headerTraceId);
      const sort = parseSortFromQuery(searchParams);
      const filters = parseCatalogFiltersFromQuery(
        searchParams,
        manifestIndex,
        catalogID,
        headerTraceId,
      );

      return {
        schemaVersion,
        catalogID,
        mediaType,
        ...(query !== undefined ? { query } : {}),
        ...(page !== undefined ? { page } : {}),
        ...(sort !== undefined ? { sort } : {}),
        ...(filters !== undefined ? { filters } : {}),
        ...(context !== undefined ? { context } : {}),
        ...(experimental !== undefined ? { experimental } : {}),
      } as ResourceRequestMap[K];
    }
    case "meta":
      return {
        schemaVersion,
        mediaType,
        itemID,
        ...(context !== undefined ? { context } : {}),
        ...(experimental !== undefined ? { experimental } : {}),
      } as ResourceRequestMap[K];
    case "stream": {
      const videoID = parseOptionalString(searchParams.get("videoID"));
      const playback = parsePlaybackFromQuery(searchParams, headerTraceId);

      return {
        schemaVersion,
        mediaType,
        itemID,
        ...(videoID !== undefined ? { videoID } : {}),
        ...(playback !== undefined ? { playback } : {}),
        ...(context !== undefined ? { context } : {}),
        ...(experimental !== undefined ? { experimental } : {}),
      } as ResourceRequestMap[K];
    }
    case "subtitles": {
      const videoFingerprint = parseVideoFingerprintFromQuery(
        searchParams,
        headerTraceId,
      );
      const languagePreferences = parseStringListQuery(
        searchParams,
        "languagePreferences",
      );

      return {
        schemaVersion,
        mediaType,
        itemID,
        ...(videoFingerprint !== undefined ? { videoFingerprint } : {}),
        ...(languagePreferences !== undefined ? { languagePreferences } : {}),
        ...(context !== undefined ? { context } : {}),
        ...(experimental !== undefined ? { experimental } : {}),
      } as ResourceRequestMap[K];
    }
    case "plugin_catalog": {
      const query = parseOptionalString(searchParams.get("query"));
      const page = parsePageFromQuery(searchParams, headerTraceId);

      return {
        schemaVersion,
        catalogID,
        pluginKind,
        ...(query !== undefined ? { query } : {}),
        ...(page !== undefined ? { page } : {}),
        ...(context !== undefined ? { context } : {}),
        ...(experimental !== undefined ? { experimental } : {}),
      } as ResourceRequestMap[K];
    }
    default:
      return assertNeverResource(resource, headerTraceId);
  }
}

function buildTraceId(
  headerTraceId: string | undefined,
  requestBody: unknown,
): string {
  if (headerTraceId && headerTraceId.trim().length > 0) {
    return headerTraceId;
  }

  if (
    typeof requestBody === "object" &&
    requestBody !== null &&
    "context" in requestBody &&
    typeof (requestBody as { context?: { traceID?: string } }).context
      ?.traceID === "string" &&
    (requestBody as { context?: { traceID?: string } }).context?.traceID?.trim()
      .length
  ) {
    return (requestBody as { context?: { traceID?: string } }).context
      ?.traceID as string;
  }

  return randomUUID();
}

function responseMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return TEXT_MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

async function sendStaticFile(filePath: string): Promise<Response> {
  const candidate = path.resolve(filePath);
  const metadata = await stat(candidate);

  if (!metadata.isFile()) {
    throw new Error("not_a_file");
  }

  const content = readFileSync(candidate);
  return new Response(content, {
    status: 200,
    headers: {
      "content-type": responseMimeType(candidate),
      "cache-control": candidate.endsWith(".html")
        ? "no-cache"
        : "public, max-age=3600",
    },
  });
}

function setCacheHeaders(
  response: Record<string, unknown>,
  headers: Headers,
): void {
  const cache = response.cache;
  if (!cache || typeof cache !== "object") {
    return;
  }

  const cacheObject = cache as {
    maxAgeSeconds?: unknown;
    staleWhileRevalidateSeconds?: unknown;
    staleIfErrorSeconds?: unknown;
  };

  const directives: string[] = [];

  if (Number.isInteger(cacheObject.maxAgeSeconds)) {
    directives.push(`max-age=${cacheObject.maxAgeSeconds}`);
  }
  if (Number.isInteger(cacheObject.staleWhileRevalidateSeconds)) {
    directives.push(
      `stale-while-revalidate=${cacheObject.staleWhileRevalidateSeconds}`,
    );
  }
  if (Number.isInteger(cacheObject.staleIfErrorSeconds)) {
    directives.push(`stale-if-error=${cacheObject.staleIfErrorSeconds}`);
  }

  if (directives.length > 0) {
    headers.set("cache-control", `${directives.join(", ")}, public`);
  }
}

function configureFrontend(
  app: Hono,
  prefix: string,
  options: FrontendOptions,
): void {
  const mountPath = normalizePathPrefix(options.mountPath ?? "/");
  const assetsMountPath = normalizePathPrefix(
    options.assetsMountPath ?? `${mountPath}/assets`,
  );
  const distPath = options.distPath ?? path.resolve(moduleDir, "ui");

  if (!existsSync(distPath)) {
    return;
  }

  const indexPath = path.join(distPath, "index.html");
  const assetsPath = path.join(distPath, "assets");

  const rootRoute = `${prefix}${mountPath}` || "/";
  const rootRouteWithSlash = rootRoute.endsWith("/")
    ? rootRoute
    : `${rootRoute}/`;
  const assetsRoutePrefix = `${prefix}${assetsMountPath}` || "/assets";
  const assetsRoutePattern = assetsRoutePrefix.endsWith("/")
    ? `${assetsRoutePrefix}*`
    : `${assetsRoutePrefix}/*`;

  app.get(rootRoute, async () => sendStaticFile(indexPath));
  app.get(rootRouteWithSlash, async () => sendStaticFile(indexPath));
  app.get(assetsRoutePattern, async (context) => {
    const requestPath = context.req.path;
    const file = requestPath.startsWith(`${assetsRoutePrefix}/`)
      ? requestPath.slice(assetsRoutePrefix.length + 1)
      : requestPath.slice(assetsRoutePrefix.length);
    const candidate = path.resolve(assetsPath, file);
    if (!candidate.startsWith(assetsPath)) {
      return context.json(
        ProtocolError.requestInvalid("Invalid asset path").toJSON(),
        400,
      );
    }

    try {
      return await sendStaticFile(candidate);
    } catch {
      return context.json(
        { error: { code: "NO_HANDLER", message: "Asset not found" } },
        404,
      );
    }
  });
}

function normalizeInstaller<TSettings extends Record<string, SettingPrimitive>>(
  plugin: MediaPlugin<TSettings>,
  installerOptions: InstallOptions | boolean | undefined,
): NormalizedInstaller {
  const base = plugin.install ?? {};
  const resolvedLogo = base.logo ?? plugin.manifest.plugin.logo;

  if (installerOptions === false) {
    return {
      enabled: false,
      configurationRequired: false,
      title: base.title ?? plugin.manifest.plugin.name,
      subtitle: base.subtitle ?? plugin.manifest.plugin.version,
      description:
        base.description ??
        plugin.manifest.plugin.description ??
        "Install and configure this plugin before adding it to your app.",
      ...(resolvedLogo !== undefined ? { logo: resolvedLogo } : {}),
      installButtonText: base.installButtonText ?? "Install Plugin",
      openManifestButtonText: base.openManifestButtonText ?? "Open Manifest",
      fields: [],
    };
  }

  const explicit = typeof installerOptions === "object" ? installerOptions : {};
  const fields = explicit.fields ?? base.fields ?? [];
  const resolvedExplicitLogo = explicit.logo ?? resolvedLogo;

  return {
    enabled: explicit.enabled ?? base.enabled ?? true,
    configurationRequired:
      explicit.configurationRequired ?? base.configurationRequired ?? false,
    title: explicit.title ?? base.title ?? plugin.manifest.plugin.name,
    subtitle:
      explicit.subtitle ?? base.subtitle ?? plugin.manifest.plugin.version,
    description:
      explicit.description ??
      base.description ??
      plugin.manifest.plugin.description ??
      "Install and configure this plugin before adding it to your app.",
    ...(resolvedExplicitLogo !== undefined
      ? { logo: resolvedExplicitLogo }
      : {}),
    installButtonText:
      explicit.installButtonText ?? base.installButtonText ?? "Install Plugin",
    openManifestButtonText:
      explicit.openManifestButtonText ??
      base.openManifestButtonText ??
      "Open Manifest",
    fields,
  };
}

function buildStudioConfig(
  prefix: string,
  deepLinkOptions: DeepLinkOptions | undefined,
  installer: NormalizedInstaller,
): {
  manifestPath: string;
  deeplink: {
    enabled: boolean;
    scheme: string;
    manifestPath: string;
  };
  installer: NormalizedInstaller;
} {
  const manifestPath = deepLinkOptions?.manifestPath ?? `${prefix}/manifest`;

  return {
    manifestPath,
    deeplink: {
      enabled: deepLinkOptions?.enabled ?? true,
      scheme: deepLinkOptions?.scheme ?? "streamfox",
      manifestPath,
    },
    installer,
  };
}

export function createServer<
  TSettings extends Record<string, SettingPrimitive>,
>(plugin: MediaPlugin<TSettings>, options: CreateServerOptions = {}): Hono {
  const app = new Hono();
  const prefix = normalizePathPrefix(options.basePath);
  const installer = normalizeInstaller(plugin, options.installer);

  if (options.enableCors !== false) {
    app.use(`${prefix || ""}/*`, cors());
  }

  app.onError((error, context) => {
    const traceId = context.req.header("x-trace-id") ?? randomUUID();
    const normalized = normalizeError(error, traceId);
    context.header("x-trace-id", traceId);
    return context.json(
      normalized.toJSON(),
      normalized.status as 400 | 404 | 500,
    );
  });

  app.get(`${prefix}/manifest`, (context) => {
    const traceId = context.req.header("x-trace-id") ?? randomUUID();
    context.header("x-trace-id", traceId);
    return context.json(plugin.manifest, 200);
  });

  app.get(`${prefix}/studio-config`, (context) => {
    const traceId = context.req.header("x-trace-id") ?? randomUUID();
    context.header("x-trace-id", traceId);
    return context.json(
      buildStudioConfig(prefix, options.deeplink, installer),
      200,
    );
  });

  const mediaItemRouteIdentifiers = (context: any): RouteIdentifiers => ({
    mediaType: context.req.param("mediaType"),
    itemID: context.req.param("itemID"),
  });

  const resourceRoutes: Array<{
    resource: ResourceKind;
    pattern: string;
    identifiers: (context: any) => RouteIdentifiers;
  }> = [
    {
      resource: "catalog",
      pattern: `${prefix}/catalog/:mediaType/:catalogID`,
      identifiers: (context) => ({
        mediaType: context.req.param("mediaType"),
        catalogID: context.req.param("catalogID"),
      }),
    },
    {
      resource: "meta",
      pattern: `${prefix}/meta/:mediaType/:itemID`,
      identifiers: mediaItemRouteIdentifiers,
    },
    {
      resource: "stream",
      pattern: `${prefix}/stream/:mediaType/:itemID`,
      identifiers: mediaItemRouteIdentifiers,
    },
    {
      resource: "subtitles",
      pattern: `${prefix}/subtitles/:mediaType/:itemID`,
      identifiers: mediaItemRouteIdentifiers,
    },
    {
      resource: "plugin_catalog",
      pattern: `${prefix}/plugin_catalog/:catalogID/:pluginKind`,
      identifiers: (context) => ({
        catalogID: context.req.param("catalogID"),
        pluginKind: context.req.param("pluginKind"),
      }),
    },
  ];

  for (const route of resourceRoutes) {
    app.get(route.pattern, async (context) => {
      const searchParams = new URL(context.req.url).searchParams;
      const request = parseRequestFromQuery(
        route.resource,
        searchParams,
        route.identifiers(context),
        plugin.index,
        context.req.header("x-trace-id"),
      );
      const traceId = buildTraceId(context.req.header("x-trace-id"), request);

      context.header("x-trace-id", traceId);

      const validRequest = validateRequest(
        route.resource,
        request,
        plugin.manifest,
        plugin.index,
        traceId,
      );
      const settings = parseInstallSettings(
        installer.fields,
        searchParams,
        traceId,
      ) as Partial<TSettings> | undefined;

      const response = await plugin.handle(route.resource, validRequest, {
        traceId,
        headers: Object.fromEntries(context.req.raw.headers),
        request: context.req.raw,
        ...(settings ? { settings } : {}),
      });

      if (isRecord(response) && "redirect" in response && response.redirect) {
        validateRedirectInstruction(response.redirect, traceId);
        return new Response(null, {
          status: response.redirect.status ?? 307,
          headers: {
            location: response.redirect.url,
            "x-trace-id": traceId,
          },
        });
      }

      const validResponse = validateResponse(
        route.resource,
        response,
        traceId,
      ) as Record<string, unknown>;

      const headers = new Headers({
        "content-type": "application/json; charset=utf-8",
        "x-trace-id": traceId,
      });
      setCacheHeaders(validResponse, headers);

      return new Response(JSON.stringify(validResponse), {
        status: 200,
        headers,
      });
    });
  }

  const frontend =
    options.frontend === false
      ? { enabled: false }
      : typeof options.frontend === "boolean"
        ? { enabled: options.frontend }
        : { enabled: true, ...(options.frontend ?? {}) };

  if (frontend.enabled) {
    configureFrontend(app, prefix, frontend);
  }

  return app;
}
