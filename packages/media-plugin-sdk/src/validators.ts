import { ProtocolError } from "./errors";
import {
  SCHEMA_VERSION_CURRENT,
  type Capability,
  type CatalogEndpoint,
  type CatalogRequest,
  type CatalogResponse,
  type FilterSpec,
  type Manifest,
  type MediaDetail,
  type MediaSummary,
  type MetaRequest,
  type MetaResponse,
  type PluginCatalogRequest,
  type PluginCatalogResponse,
  type RequestFilter,
  type RequestPage,
  type RequestSort,
  type ResourceKind,
  type ResourceRequestMap,
  type ResourceResponseMap,
  type SchemaVersion,
  type StreamRequest,
  type StreamsResponse,
  type StreamSource,
  type SubtitlesRequest,
  type SubtitlesResponse,
  type VideoUnit,
} from "./types";
import {
  asArray,
  getCatalogCapability,
  getMetaCapability,
  getPluginCatalogCapability,
  getStreamCapability,
  getSubtitlesCapability,
  isRecord,
  nonBlank,
} from "./utils";

const SEMVER_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/;

function assertManifest(condition: boolean, message: string, details?: unknown): asserts condition {
  if (!condition) {
    throw ProtocolError.manifestInvalid(message, details);
  }
}

function assertRequest(condition: boolean, message: string, details?: unknown, traceId?: string): asserts condition {
  if (!condition) {
    throw ProtocolError.requestInvalid(message, details, traceId);
  }
}

function assertResponse(condition: boolean, message: string, details?: unknown, traceId?: string): asserts condition {
  if (!condition) {
    throw ProtocolError.responseInvalid(message, details, traceId);
  }
}

function checkSupportedSchemaVersion(
  schemaVersion: SchemaVersion | undefined,
  context: string,
  mode: "manifest" | "request" | "response",
  traceId?: string,
): void {
  if (!schemaVersion || typeof schemaVersion.major !== "number") {
    if (mode === "manifest") {
      throw ProtocolError.manifestInvalid(`Missing schemaVersion for ${context}`);
    }

    if (mode === "request") {
      throw ProtocolError.requestInvalid(`Missing schemaVersion for ${context}`, undefined, traceId);
    }

    throw ProtocolError.responseInvalid(`Missing schemaVersion for ${context}`, undefined, traceId);
  }

  if (schemaVersion.major !== SCHEMA_VERSION_CURRENT.major) {
    const message = `Unsupported schema major version '${schemaVersion.major}' for ${context}`;
    if (mode === "manifest") {
      throw ProtocolError.manifestInvalid(message);
    }
    if (mode === "request") {
      throw ProtocolError.requestInvalid(message, undefined, traceId);
    }
    throw ProtocolError.responseInvalid(message, undefined, traceId);
  }
}

function validateManifestCatalogCapability(capability: Extract<Capability, { kind: "catalog" }>): void {
  const endpoints = asArray(capability.endpoints);
  assertManifest(endpoints.length > 0, "Catalog capability must declare at least one endpoint");

  const seenIds = new Set<string>();
  for (const endpoint of endpoints) {
    assertManifest(nonBlank(endpoint.id), "Catalog endpoint id cannot be empty");
    assertManifest(!seenIds.has(endpoint.id), `Catalog endpoint '${endpoint.id}' is duplicated`);
    seenIds.add(endpoint.id);
    assertManifest(asArray(endpoint.mediaTypes).length > 0, `Catalog endpoint '${endpoint.id}' must declare media types`);

    const seenFilterKeys = new Set<string>();
    for (const filter of asArray(endpoint.filters)) {
      assertManifest(nonBlank(filter.key), `Filter key cannot be empty in endpoint '${endpoint.id}'`);
      assertManifest(
        !seenFilterKeys.has(filter.key),
        `Filter '${filter.key}' is duplicated in endpoint '${endpoint.id}'`,
      );
      seenFilterKeys.add(filter.key);
    }
  }
}

function validateManifestMetaCapability(capability: Extract<Capability, { kind: "meta" }>): void {
  assertManifest(asArray(capability.mediaTypes).length > 0, "Meta capability must declare media types");
}

function validateManifestStreamCapability(capability: Extract<Capability, { kind: "stream" }>): void {
  assertManifest(asArray(capability.mediaTypes).length > 0, "Stream capability must declare media types");
  assertManifest(asArray(capability.deliveryKinds).length > 0, "Stream capability must declare at least one delivery kind");
}

function validateManifestSubtitlesCapability(capability: Extract<Capability, { kind: "subtitles" }>): void {
  assertManifest(asArray(capability.mediaTypes).length > 0, "Subtitles capability must declare media types");
}

function validateManifestPluginCatalogCapability(capability: Extract<Capability, { kind: "plugin_catalog" }>): void {
  const endpoints = asArray(capability.endpoints);
  assertManifest(endpoints.length > 0, "Plugin catalog capability must declare at least one endpoint");

  const seenIds = new Set<string>();
  for (const endpoint of endpoints) {
    assertManifest(nonBlank(endpoint.id), "Plugin catalog endpoint id cannot be empty");
    assertManifest(!seenIds.has(endpoint.id), `Plugin catalog endpoint '${endpoint.id}' is duplicated`);
    seenIds.add(endpoint.id);
    assertManifest(
      asArray(endpoint.pluginKinds).length > 0,
      `Plugin catalog endpoint '${endpoint.id}' must declare plugin kinds`,
    );
  }
}

export function validateManifest(manifest: Manifest): Manifest {
  checkSupportedSchemaVersion(manifest.schemaVersion, "manifest", "manifest");

  assertManifest(nonBlank(manifest.plugin?.id), "Plugin id cannot be empty");
  assertManifest(nonBlank(manifest.plugin?.name), "Plugin name cannot be empty");
  assertManifest(nonBlank(manifest.plugin?.version), "Plugin version cannot be empty");
  assertManifest(
    SEMVER_PATTERN.test(manifest.plugin.version),
    "Plugin version must be semver (for example 1.2.3)",
  );

  const capabilities = asArray(manifest.capabilities);
  assertManifest(capabilities.length > 0, "Plugin must declare at least one capability");

  const seenKinds = new Set<ResourceKind>();
  for (const capability of capabilities) {
    assertManifest(isRecord(capability), "Capability entry must be an object");
    const kind = capability.kind;
    assertManifest(
      kind === "catalog" ||
        kind === "meta" ||
        kind === "stream" ||
        kind === "subtitles" ||
        kind === "plugin_catalog",
      "Capability kind is invalid",
      { kind },
    );

    assertManifest(!seenKinds.has(kind), `Capability '${kind}' is duplicated`);
    seenKinds.add(kind);

    switch (kind) {
      case "catalog":
        validateManifestCatalogCapability(capability);
        break;
      case "meta":
        validateManifestMetaCapability(capability);
        break;
      case "stream":
        validateManifestStreamCapability(capability);
        break;
      case "subtitles":
        validateManifestSubtitlesCapability(capability);
        break;
      case "plugin_catalog":
        validateManifestPluginCatalogCapability(capability);
        break;
      default:
        assertManifest(false, "Unknown capability kind", { kind });
    }
  }

  return manifest;
}

function validatePage(page: RequestPage | undefined, traceId?: string): void {
  if (!page) {
    return;
  }

  assertRequest(Number.isInteger(page.index), "page.index must be an integer", undefined, traceId);
  assertRequest(page.index >= 0, "page.index must be >= 0", undefined, traceId);

  if (page.size !== undefined) {
    assertRequest(Number.isInteger(page.size), "page.size must be an integer", undefined, traceId);
    assertRequest(page.size > 0, "page.size must be > 0", undefined, traceId);
  }
}

function validateSort(sort: RequestSort | undefined, endpoint: CatalogEndpoint, traceId?: string): void {
  if (!sort) {
    return;
  }

  assertRequest(nonBlank(sort.key), "sort.key cannot be empty", undefined, traceId);

  const endpointSorts = asArray(endpoint.sorts);
  if (endpointSorts.length === 0) {
    return;
  }

  const supported = endpointSorts.some((candidate) => candidate.key === sort.key && asArray(candidate.directions).includes(sort.direction));
  assertRequest(
    supported,
    `sort '${sort.key}' with direction '${sort.direction}' is not supported`,
    undefined,
    traceId,
  );
}

function validateFilterValueType(filter: RequestFilter, spec: FilterSpec, traceId?: string): void {
  assertRequest(
    filter.value.kind === spec.valueType,
    `filter '${spec.key}' expects type '${spec.valueType}'`,
    undefined,
    traceId,
  );
}

function validateCatalogRequest(request: CatalogRequest, manifest: Manifest, traceId?: string): CatalogRequest {
  checkSupportedSchemaVersion(request.schemaVersion, "request.catalog", "request", traceId);
  assertRequest(nonBlank(request.catalogID), "catalogID cannot be empty", undefined, traceId);

  const capability = getCatalogCapability(manifest);
  assertRequest(!!capability, "catalog capability is not declared", undefined, traceId);

  const endpoint = asArray(capability.endpoints).find((candidate) => candidate.id === request.catalogID);
  assertRequest(!!endpoint, `unknown catalog endpoint '${request.catalogID}'`, undefined, traceId);

  assertRequest(
    asArray(endpoint.mediaTypes).includes(request.mediaType),
    `catalog endpoint '${endpoint.id}' does not support media type '${request.mediaType}'`,
    undefined,
    traceId,
  );

  if (request.query !== undefined) {
    assertRequest(nonBlank(request.query), "query cannot be blank when provided", undefined, traceId);
  }

  validatePage(request.page, traceId);
  validateSort(request.sort, endpoint, traceId);

  const specByKey = new Map(asArray(endpoint.filters).map((spec) => [spec.key, spec]));
  const seenFilters = new Set<string>();

  for (const filter of asArray(request.filters)) {
    assertRequest(!seenFilters.has(filter.key), `duplicate filter '${filter.key}'`, undefined, traceId);
    seenFilters.add(filter.key);

    const spec = specByKey.get(filter.key);
    assertRequest(
      !!spec,
      `unsupported filter '${filter.key}' for catalog '${request.catalogID}'`,
      undefined,
      traceId,
    );

    validateFilterValueType(filter, spec, traceId);
  }

  for (const spec of asArray(endpoint.filters)) {
    if (spec.isRequired) {
      assertRequest(
        asArray(request.filters).some((candidate) => candidate.key === spec.key),
        `required filter '${spec.key}' missing`,
        undefined,
        traceId,
      );
    }
  }

  return request;
}

function validateMetaRequest(request: MetaRequest, manifest: Manifest, traceId?: string): MetaRequest {
  checkSupportedSchemaVersion(request.schemaVersion, "request.meta", "request", traceId);
  assertRequest(nonBlank(request.itemID), "itemID cannot be empty", undefined, traceId);

  const capability = getMetaCapability(manifest);
  assertRequest(!!capability, "meta capability is not declared", undefined, traceId);

  assertRequest(
    asArray(capability.mediaTypes).includes(request.mediaType),
    `meta capability does not support media type '${request.mediaType}'`,
    undefined,
    traceId,
  );

  return request;
}

function validateStreamRequest(request: StreamRequest, manifest: Manifest, traceId?: string): StreamRequest {
  checkSupportedSchemaVersion(request.schemaVersion, "request.stream", "request", traceId);
  assertRequest(nonBlank(request.itemID), "itemID cannot be empty", undefined, traceId);

  if (request.videoID !== undefined) {
    assertRequest(nonBlank(request.videoID), "videoID cannot be blank when provided", undefined, traceId);
  }

  const capability = getStreamCapability(manifest);
  assertRequest(!!capability, "stream capability is not declared", undefined, traceId);

  assertRequest(
    asArray(capability.mediaTypes).includes(request.mediaType),
    `stream capability does not support media type '${request.mediaType}'`,
    undefined,
    traceId,
  );

  return request;
}

function validateSubtitlesRequest(request: SubtitlesRequest, manifest: Manifest, traceId?: string): SubtitlesRequest {
  checkSupportedSchemaVersion(request.schemaVersion, "request.subtitles", "request", traceId);
  assertRequest(nonBlank(request.itemID), "itemID cannot be empty", undefined, traceId);

  const capability = getSubtitlesCapability(manifest);
  assertRequest(!!capability, "subtitles capability is not declared", undefined, traceId);

  assertRequest(
    asArray(capability.mediaTypes).includes(request.mediaType),
    `subtitles capability does not support media type '${request.mediaType}'`,
    undefined,
    traceId,
  );

  for (const language of asArray(request.languagePreferences)) {
    assertRequest(nonBlank(language), "languagePreferences cannot contain blank values", undefined, traceId);
  }

  return request;
}

function validatePluginCatalogRequest(
  request: PluginCatalogRequest,
  manifest: Manifest,
  traceId?: string,
): PluginCatalogRequest {
  checkSupportedSchemaVersion(request.schemaVersion, "request.plugin_catalog", "request", traceId);
  assertRequest(nonBlank(request.catalogID), "catalogID cannot be empty", undefined, traceId);

  const capability = getPluginCatalogCapability(manifest);
  assertRequest(!!capability, "plugin_catalog capability is not declared", undefined, traceId);

  const endpoint = asArray(capability.endpoints).find((candidate) => candidate.id === request.catalogID);
  assertRequest(!!endpoint, `unknown plugin catalog endpoint '${request.catalogID}'`, undefined, traceId);

  assertRequest(
    asArray(endpoint.pluginKinds).includes(request.pluginKind),
    `plugin kind '${request.pluginKind}' is not supported by endpoint '${endpoint.id}'`,
    undefined,
    traceId,
  );

  if (request.query !== undefined) {
    assertRequest(nonBlank(request.query), "query cannot be blank when provided", undefined, traceId);
  }

  validatePage(request.page, traceId);
  return request;
}

function validateMediaSummary(summary: MediaSummary, traceId?: string): void {
  assertResponse(nonBlank(summary.id?.namespace), "media id namespace cannot be empty", undefined, traceId);
  assertResponse(nonBlank(summary.id?.value), "media id value cannot be empty", undefined, traceId);
  assertResponse(nonBlank(summary.title), "media title cannot be empty", undefined, traceId);
}

function validateVideoUnit(video: VideoUnit, traceId?: string): void {
  assertResponse(nonBlank(video.id), "video.id cannot be empty", undefined, traceId);
  assertResponse(nonBlank(video.title), "video.title cannot be empty", undefined, traceId);
}

function validateStreamSource(stream: StreamSource, traceId?: string): void {
  if (stream.name !== undefined) {
    assertResponse(nonBlank(stream.name), "stream name cannot be blank", undefined, traceId);
  }

  const delivery = stream.delivery;
  switch (delivery.kind) {
    case "direct_url":
    case "nzb":
    case "external":
      assertResponse(nonBlank(delivery.url), "stream URL cannot be empty", undefined, traceId);
      break;
    case "youtube":
      assertResponse(nonBlank(delivery.id), "youtube id cannot be empty", undefined, traceId);
      break;
    case "torrent":
      assertResponse(nonBlank(delivery.infoHash), "torrent infoHash cannot be empty", undefined, traceId);
      break;
    default:
      assertResponse(false, "stream delivery kind is invalid", delivery, traceId);
  }
}

function validateCatalogResponse(response: CatalogResponse, traceId?: string): CatalogResponse {
  checkSupportedSchemaVersion(response.schemaVersion, "response.catalog", "response", traceId);
  for (const item of asArray(response.items)) {
    validateMediaSummary(item, traceId);
  }
  return response;
}

function validateMetaResponse(response: MetaResponse, traceId?: string): MetaResponse {
  checkSupportedSchemaVersion(response.schemaVersion, "response.meta", "response", traceId);
  const item = response.item;
  if (!item) {
    return response;
  }

  const detail = item as MediaDetail;
  validateMediaSummary(detail.summary, traceId);
  for (const video of asArray(detail.videos)) {
    validateVideoUnit(video, traceId);
  }

  return response;
}

function validateStreamsResponse(response: StreamsResponse, traceId?: string): StreamsResponse {
  checkSupportedSchemaVersion(response.schemaVersion, "response.streams", "response", traceId);
  for (const stream of asArray(response.streams)) {
    validateStreamSource(stream, traceId);
  }
  return response;
}

function validateSubtitlesResponse(response: SubtitlesResponse, traceId?: string): SubtitlesResponse {
  checkSupportedSchemaVersion(response.schemaVersion, "response.subtitles", "response", traceId);
  for (const subtitle of asArray(response.subtitles)) {
    assertResponse(nonBlank(subtitle.id), "subtitle.id cannot be empty", undefined, traceId);
    assertResponse(nonBlank(subtitle.url), "subtitle.url cannot be empty", undefined, traceId);
    assertResponse(nonBlank(subtitle.languageCode), "subtitle.languageCode cannot be empty", undefined, traceId);
  }
  return response;
}

function validatePluginCatalogResponse(response: PluginCatalogResponse, traceId?: string): PluginCatalogResponse {
  checkSupportedSchemaVersion(response.schemaVersion, "response.plugin_catalog", "response", traceId);
  for (const plugin of asArray(response.plugins)) {
    assertResponse(nonBlank(plugin.id), "plugin.id cannot be empty", undefined, traceId);
    assertResponse(nonBlank(plugin.name), "plugin.name cannot be empty", undefined, traceId);
    assertResponse(nonBlank(plugin.version), "plugin.version cannot be empty", undefined, traceId);
  }
  return response;
}

export function validateRequest<K extends ResourceKind>(
  resource: K,
  request: ResourceRequestMap[K],
  manifest: Manifest,
  traceId?: string,
): ResourceRequestMap[K] {
  switch (resource) {
    case "catalog":
      return validateCatalogRequest(request as CatalogRequest, manifest, traceId) as ResourceRequestMap[K];
    case "meta":
      return validateMetaRequest(request as MetaRequest, manifest, traceId) as ResourceRequestMap[K];
    case "stream":
      return validateStreamRequest(request as StreamRequest, manifest, traceId) as ResourceRequestMap[K];
    case "subtitles":
      return validateSubtitlesRequest(request as SubtitlesRequest, manifest, traceId) as ResourceRequestMap[K];
    case "plugin_catalog":
      return validatePluginCatalogRequest(request as PluginCatalogRequest, manifest, traceId) as ResourceRequestMap[K];
    default:
      throw ProtocolError.requestInvalid(`Unsupported resource '${String(resource)}'`, undefined, traceId);
  }
}

export function validateResponse<K extends ResourceKind>(
  resource: K,
  response: ResourceResponseMap[K],
  traceId?: string,
): ResourceResponseMap[K] {
  switch (resource) {
    case "catalog":
      return validateCatalogResponse(response as CatalogResponse, traceId) as ResourceResponseMap[K];
    case "meta":
      return validateMetaResponse(response as MetaResponse, traceId) as ResourceResponseMap[K];
    case "stream":
      return validateStreamsResponse(response as StreamsResponse, traceId) as ResourceResponseMap[K];
    case "subtitles":
      return validateSubtitlesResponse(response as SubtitlesResponse, traceId) as ResourceResponseMap[K];
    case "plugin_catalog":
      return validatePluginCatalogResponse(response as PluginCatalogResponse, traceId) as ResourceResponseMap[K];
    default:
      throw ProtocolError.responseInvalid(`Unsupported resource '${String(resource)}'`, undefined, traceId);
  }
}
