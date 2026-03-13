import { ProtocolError } from "./errors";
import {
  SCHEMA_VERSION_CURRENT,
  type Capability,
  type CatalogEndpoint,
  type CatalogRequest,
  type CatalogResponse,
  type FilterSpec,
  type Manifest,
  type ManifestIndex,
  type MediaDetail,
  type MediaSummary,
  type MetaRequest,
  type MetaResponse,
  type PluginCatalogRequest,
  type PluginCatalogResponse,
  type RedirectInstruction,
  type RequestFilter,
  type RequestPage,
  type RequestSort,
  type ResourceKind,
  type ResourceRequestMap,
  type ResourceResponseMap,
  type SchemaVersion,
  type StreamCapability,
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
  isRecord,
  nonBlank,
  normalizeFilterOptions,
  resolveCatalogEndpointFilters,
  resolveCatalogEndpointSorts,
} from "./utils";

const SEMVER_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/;
const SUPPORTED_TRANSPORTS = new Set([
  "http",
  "youtube",
  "torrent",
  "usenet",
  "archive",
]);
const ARCHIVE_FORMATS = new Set(["rar", "zip", "7zip", "tar", "tgz"]);

function assertManifest(
  condition: boolean,
  message: string,
  details?: unknown,
): asserts condition {
  if (!condition) {
    throw ProtocolError.manifestInvalid(message, details);
  }
}

function assertRequest(
  condition: boolean,
  message: string,
  details?: unknown,
  traceId?: string,
): asserts condition {
  if (!condition) {
    throw ProtocolError.requestInvalid(message, details, traceId);
  }
}

function assertResponse(
  condition: boolean,
  message: string,
  details?: unknown,
  traceId?: string,
): asserts condition {
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
      throw ProtocolError.manifestInvalid(
        `Missing schemaVersion for ${context}`,
      );
    }

    if (mode === "request") {
      throw ProtocolError.requestInvalid(
        `Missing schemaVersion for ${context}`,
        undefined,
        traceId,
      );
    }

    throw ProtocolError.responseInvalid(
      `Missing schemaVersion for ${context}`,
      undefined,
      traceId,
    );
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

function validateFilterSpecs(filters: FilterSpec[], ownerLabel: string): void {
  const seenFilterKeys = new Set<string>();

  for (const filter of filters) {
    assertManifest(
      nonBlank(filter.key),
      `Filter key cannot be empty in ${ownerLabel}`,
    );
    assertManifest(
      !seenFilterKeys.has(filter.key),
      `Filter '${filter.key}' is duplicated in ${ownerLabel}`,
    );
    seenFilterKeys.add(filter.key);

    const options = normalizeFilterOptions(filter);
    const seenOptionValues = new Set<string>();
    const seenAliases = new Set<string>();
    const normalizedOptionValues = new Set(
      options.map((option) => option.value.trim().toLowerCase()),
    );

    for (const option of options) {
      const normalizedOptionValue = option.value.trim().toLowerCase();
      assertManifest(
        nonBlank(option.value),
        `Filter '${filter.key}' in ${ownerLabel} contains an option with an empty value`,
      );
      assertManifest(
        nonBlank(option.label),
        `Filter '${filter.key}' in ${ownerLabel} contains an option with an empty label`,
      );
      assertManifest(
        !seenOptionValues.has(option.value),
        `Filter '${filter.key}' in ${ownerLabel} contains duplicate option value '${option.value}'`,
      );
      seenOptionValues.add(option.value);

      for (const alias of asArray(option.aliases)) {
        assertManifest(
          nonBlank(alias),
          `Filter '${filter.key}' in ${ownerLabel} contains a blank option alias`,
        );
        const normalizedAlias = alias.trim().toLowerCase();
        assertManifest(
          normalizedAlias === normalizedOptionValue ||
            !normalizedOptionValues.has(normalizedAlias),
          `Filter '${filter.key}' in ${ownerLabel} contains alias '${alias}' that collides with a canonical option value`,
        );
        assertManifest(
          !seenAliases.has(normalizedAlias),
          `Filter '${filter.key}' in ${ownerLabel} contains duplicate option alias '${alias}'`,
        );
        seenAliases.add(normalizedAlias);
      }
    }
  }
}

function validateSortSpecs(
  sorts: import("./types").SortSpec[],
  ownerLabel: string,
): void {
  const seenSortKeys = new Set<string>();
  const normalizedSortKeys = new Set(
    sorts.map((sort) => sort.key.trim().toLowerCase()),
  );
  const seenAliases = new Set<string>();

  for (const sort of sorts) {
    assertManifest(
      nonBlank(sort.key),
      `Sort key cannot be empty in ${ownerLabel}`,
    );
    assertManifest(
      !seenSortKeys.has(sort.key),
      `Sort '${sort.key}' is duplicated in ${ownerLabel}`,
    );
    seenSortKeys.add(sort.key);

    if (sort.label !== undefined) {
      assertManifest(
        nonBlank(sort.label),
        `Sort '${sort.key}' in ${ownerLabel} cannot have a blank label`,
      );
    }

    const directions = asArray(sort.directions);
    assertManifest(
      directions.length > 0,
      `Sort '${sort.key}' in ${ownerLabel} must declare at least one direction`,
    );

    const seenDirections = new Set<string>();
    for (const direction of directions) {
      assertManifest(
        direction === "ascending" || direction === "descending",
        `Sort '${sort.key}' in ${ownerLabel} contains unsupported direction '${String(direction)}'`,
      );
      assertManifest(
        !seenDirections.has(direction),
        `Sort '${sort.key}' in ${ownerLabel} contains duplicate direction '${direction}'`,
      );
      seenDirections.add(direction);
    }

    if (sort.defaultDirection !== undefined) {
      assertManifest(
        directions.includes(sort.defaultDirection),
        `Sort '${sort.key}' in ${ownerLabel} has defaultDirection '${sort.defaultDirection}' that is not declared in directions`,
      );
    }

    for (const alias of asArray(sort.aliases)) {
      assertManifest(
        nonBlank(alias),
        `Sort '${sort.key}' in ${ownerLabel} contains a blank alias`,
      );
      const normalizedAlias = alias.trim().toLowerCase();
      assertManifest(
        normalizedAlias === sort.key.trim().toLowerCase() ||
          !normalizedSortKeys.has(normalizedAlias),
        `Sort '${sort.key}' in ${ownerLabel} contains alias '${alias}' that collides with a canonical sort key`,
      );
      assertManifest(
        !seenAliases.has(normalizedAlias),
        `Sort '${sort.key}' in ${ownerLabel} contains duplicate alias '${alias}'`,
      );
      seenAliases.add(normalizedAlias);
    }
  }
}

function validateManifestCatalogCapability(
  capability: Extract<Capability, { kind: "catalog" }>,
): void {
  const endpoints = asArray(capability.endpoints);
  assertManifest(
    endpoints.length > 0,
    "Catalog capability must declare at least one endpoint",
  );

  const seenIds = new Set<string>();
  for (const [filterSetName, filters] of Object.entries(
    capability.filterSets ?? {},
  )) {
    assertManifest(
      nonBlank(filterSetName),
      "Catalog filter set name cannot be empty",
    );
    validateFilterSpecs(asArray(filters), `filter set '${filterSetName}'`);
  }
  for (const [sortSetName, sorts] of Object.entries(
    capability.sortSets ?? {},
  )) {
    assertManifest(
      nonBlank(sortSetName),
      "Catalog sort set name cannot be empty",
    );
    validateSortSpecs(asArray(sorts), `sort set '${sortSetName}'`);
  }

  for (const endpoint of endpoints) {
    assertManifest(
      nonBlank(endpoint.id),
      "Catalog endpoint id cannot be empty",
    );
    assertManifest(
      !seenIds.has(endpoint.id),
      `Catalog endpoint '${endpoint.id}' is duplicated`,
    );
    seenIds.add(endpoint.id);
    assertManifest(
      asArray(endpoint.mediaTypes).length > 0,
      `Catalog endpoint '${endpoint.id}' must declare media types`,
    );

    for (const filterSetRef of asArray(endpoint.filterSetRefs)) {
      assertManifest(
        nonBlank(filterSetRef),
        `Catalog endpoint '${endpoint.id}' contains a blank filterSetRef`,
      );
      assertManifest(
        !!capability.filterSets?.[filterSetRef],
        `Catalog endpoint '${endpoint.id}' references unknown filter set '${filterSetRef}'`,
      );
    }
    for (const sortSetRef of asArray(endpoint.sortSetRefs)) {
      assertManifest(
        nonBlank(sortSetRef),
        `Catalog endpoint '${endpoint.id}' contains a blank sortSetRef`,
      );
      assertManifest(
        !!capability.sortSets?.[sortSetRef],
        `Catalog endpoint '${endpoint.id}' references unknown sort set '${sortSetRef}'`,
      );
    }

    validateFilterSpecs(
      resolveCatalogEndpointFilters(capability, endpoint),
      `endpoint '${endpoint.id}'`,
    );
    validateSortSpecs(
      resolveCatalogEndpointSorts(capability, endpoint),
      `endpoint '${endpoint.id}'`,
    );
  }
}

function validateManifestMetaCapability(
  capability: Extract<Capability, { kind: "meta" }>,
): void {
  assertManifest(
    asArray(capability.mediaTypes).length > 0,
    "Meta capability must declare media types",
  );
}

function validateManifestStreamCapability(capability: StreamCapability): void {
  assertManifest(
    asArray(capability.mediaTypes).length > 0,
    "Stream capability must declare media types",
  );
  const supportedTransports = asArray(capability.supportedTransports);
  assertManifest(
    supportedTransports.length > 0,
    "Stream capability must declare at least one supported transport",
  );
  const seen = new Set<string>();
  for (const transport of supportedTransports) {
    assertManifest(
      SUPPORTED_TRANSPORTS.has(transport),
      `Unsupported transport '${transport}' in stream capability`,
    );
    assertManifest(
      !seen.has(transport),
      `Transport '${transport}' is duplicated in stream capability`,
    );
    seen.add(transport);
  }
}

function validateManifestSubtitlesCapability(
  capability: Extract<Capability, { kind: "subtitles" }>,
): void {
  assertManifest(
    asArray(capability.mediaTypes).length > 0,
    "Subtitles capability must declare media types",
  );
}

function validateManifestPluginCatalogCapability(
  capability: Extract<Capability, { kind: "plugin_catalog" }>,
): void {
  const endpoints = asArray(capability.endpoints);
  assertManifest(
    endpoints.length > 0,
    "Plugin catalog capability must declare at least one endpoint",
  );

  const seenIds = new Set<string>();
  for (const endpoint of endpoints) {
    assertManifest(
      nonBlank(endpoint.id),
      "Plugin catalog endpoint id cannot be empty",
    );
    assertManifest(
      !seenIds.has(endpoint.id),
      `Plugin catalog endpoint '${endpoint.id}' is duplicated`,
    );
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
  assertManifest(
    nonBlank(manifest.plugin?.name),
    "Plugin name cannot be empty",
  );
  assertManifest(
    nonBlank(manifest.plugin?.version),
    "Plugin version cannot be empty",
  );
  assertManifest(
    SEMVER_PATTERN.test(manifest.plugin.version),
    "Plugin version must be semver (for example 1.2.3)",
  );

  const capabilities = asArray(manifest.capabilities);
  assertManifest(
    capabilities.length > 0,
    "Plugin must declare at least one capability",
  );

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

  assertRequest(
    Number.isInteger(page.index),
    "page.index must be an integer",
    undefined,
    traceId,
  );
  assertRequest(page.index >= 0, "page.index must be >= 0", undefined, traceId);

  if (page.size !== undefined) {
    assertRequest(
      Number.isInteger(page.size),
      "page.size must be an integer",
      undefined,
      traceId,
    );
    assertRequest(page.size > 0, "page.size must be > 0", undefined, traceId);
  }
}

function validateSort(
  sort: RequestSort | undefined,
  effectiveSorts: readonly import("./types").SortSpec[],
  traceId?: string,
): void {
  if (!sort) {
    return;
  }

  assertRequest(
    nonBlank(sort.key),
    "sort.key cannot be empty",
    undefined,
    traceId,
  );

  const endpointSorts = effectiveSorts;
  if (endpointSorts.length === 0) {
    return;
  }

  const supported = endpointSorts.some(
    (candidate) =>
      candidate.key === sort.key &&
      asArray(candidate.directions).includes(sort.direction),
  );
  assertRequest(
    supported,
    `sort '${sort.key}' with direction '${sort.direction}' is not supported`,
    undefined,
    traceId,
  );
}

function validateFilterValueType(
  filter: RequestFilter,
  spec: FilterSpec,
  traceId?: string,
): void {
  assertRequest(
    filter.value.kind === spec.valueType,
    `filter '${spec.key}' expects type '${spec.valueType}'`,
    undefined,
    traceId,
  );
}

function validateCatalogRequest(
  request: CatalogRequest,
  manifest: Manifest,
  index?: ManifestIndex,
  traceId?: string,
): CatalogRequest {
  checkSupportedSchemaVersion(
    request.schemaVersion,
    "request.catalog",
    "request",
    traceId,
  );
  assertRequest(
    nonBlank(request.catalogID),
    "catalogID cannot be empty",
    undefined,
    traceId,
  );

  const capability = (index?.capabilityByKind.catalog ??
    getCatalogCapability(manifest)) as
    | Extract<Capability, { kind: "catalog" }>
    | undefined;
  assertRequest(
    !!capability,
    "catalog capability is not declared",
    undefined,
    traceId,
  );

  const endpoint =
    index?.catalogEndpointByID.get(request.catalogID) ??
    asArray(capability.endpoints).find(
      (candidate) => candidate.id === request.catalogID,
    );
  assertRequest(
    !!endpoint,
    `unknown catalog endpoint '${request.catalogID}'`,
    undefined,
    traceId,
  );

  assertRequest(
    asArray(endpoint.mediaTypes).includes(request.mediaType),
    `catalog endpoint '${endpoint.id}' does not support media type '${request.mediaType}'`,
    undefined,
    traceId,
  );

  if (request.query !== undefined) {
    assertRequest(
      nonBlank(request.query),
      "query cannot be blank when provided",
      undefined,
      traceId,
    );
  }

  validatePage(request.page, traceId);
  const effectiveSorts =
    index?.catalogSortsByEndpointID.get(request.catalogID) ??
    resolveCatalogEndpointSorts(capability, endpoint);
  validateSort(request.sort, effectiveSorts, traceId);

  const effectiveFilters =
    index?.catalogFiltersByEndpointID.get(request.catalogID) ??
    resolveCatalogEndpointFilters(capability, endpoint);
  const specByKey = new Map(effectiveFilters.map((spec) => [spec.key, spec]));
  const seenFilters = new Set<string>();

  for (const filter of asArray(request.filters)) {
    assertRequest(
      !seenFilters.has(filter.key),
      `duplicate filter '${filter.key}'`,
      undefined,
      traceId,
    );
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

  for (const spec of effectiveFilters) {
    if (spec.isRequired) {
      assertRequest(
        asArray(request.filters).some(
          (candidate) => candidate.key === spec.key,
        ),
        `required filter '${spec.key}' missing`,
        undefined,
        traceId,
      );
    }
  }

  return request;
}

function validateMetaRequest(
  request: MetaRequest,
  manifest: Manifest,
  index?: ManifestIndex,
  traceId?: string,
): MetaRequest {
  checkSupportedSchemaVersion(
    request.schemaVersion,
    "request.meta",
    "request",
    traceId,
  );
  assertRequest(
    nonBlank(request.itemID),
    "itemID cannot be empty",
    undefined,
    traceId,
  );

  const capability = (index?.capabilityByKind.meta ??
    manifest.capabilities.find(
      (candidate): candidate is Extract<Capability, { kind: "meta" }> =>
        candidate.kind === "meta",
    )) as Extract<Capability, { kind: "meta" }> | undefined;
  assertRequest(
    !!capability,
    "meta capability is not declared",
    undefined,
    traceId,
  );

  assertRequest(
    asArray(capability.mediaTypes).includes(request.mediaType),
    `meta capability does not support media type '${request.mediaType}'`,
    undefined,
    traceId,
  );

  return request;
}

function validateStreamRequest(
  request: StreamRequest,
  manifest: Manifest,
  index?: ManifestIndex,
  traceId?: string,
): StreamRequest {
  checkSupportedSchemaVersion(
    request.schemaVersion,
    "request.stream",
    "request",
    traceId,
  );
  assertRequest(
    nonBlank(request.itemID),
    "itemID cannot be empty",
    undefined,
    traceId,
  );

  if (request.videoID !== undefined) {
    assertRequest(
      nonBlank(request.videoID),
      "videoID cannot be blank when provided",
      undefined,
      traceId,
    );
  }

  const capability = (index?.capabilityByKind.stream ??
    manifest.capabilities.find(
      (candidate): candidate is Extract<Capability, { kind: "stream" }> =>
        candidate.kind === "stream",
    )) as Extract<Capability, { kind: "stream" }> | undefined;
  assertRequest(
    !!capability,
    "stream capability is not declared",
    undefined,
    traceId,
  );

  assertRequest(
    asArray(capability.mediaTypes).includes(request.mediaType),
    `stream capability does not support media type '${request.mediaType}'`,
    undefined,
    traceId,
  );

  return request;
}

function validateSubtitlesRequest(
  request: SubtitlesRequest,
  manifest: Manifest,
  index?: ManifestIndex,
  traceId?: string,
): SubtitlesRequest {
  checkSupportedSchemaVersion(
    request.schemaVersion,
    "request.subtitles",
    "request",
    traceId,
  );
  assertRequest(
    nonBlank(request.itemID),
    "itemID cannot be empty",
    undefined,
    traceId,
  );

  const capability = (index?.capabilityByKind.subtitles ??
    manifest.capabilities.find(
      (candidate): candidate is Extract<Capability, { kind: "subtitles" }> =>
        candidate.kind === "subtitles",
    )) as Extract<Capability, { kind: "subtitles" }> | undefined;
  assertRequest(
    !!capability,
    "subtitles capability is not declared",
    undefined,
    traceId,
  );

  assertRequest(
    asArray(capability.mediaTypes).includes(request.mediaType),
    `subtitles capability does not support media type '${request.mediaType}'`,
    undefined,
    traceId,
  );

  for (const language of asArray(request.languagePreferences)) {
    assertRequest(
      nonBlank(language),
      "languagePreferences cannot contain blank values",
      undefined,
      traceId,
    );
  }

  return request;
}

function validatePluginCatalogRequest(
  request: PluginCatalogRequest,
  manifest: Manifest,
  index?: ManifestIndex,
  traceId?: string,
): PluginCatalogRequest {
  checkSupportedSchemaVersion(
    request.schemaVersion,
    "request.plugin_catalog",
    "request",
    traceId,
  );
  assertRequest(
    nonBlank(request.catalogID),
    "catalogID cannot be empty",
    undefined,
    traceId,
  );

  const capability = (index?.capabilityByKind.plugin_catalog ??
    manifest.capabilities.find(
      (
        candidate,
      ): candidate is Extract<Capability, { kind: "plugin_catalog" }> =>
        candidate.kind === "plugin_catalog",
    )) as Extract<Capability, { kind: "plugin_catalog" }> | undefined;
  assertRequest(
    !!capability,
    "plugin_catalog capability is not declared",
    undefined,
    traceId,
  );

  const endpoint =
    index?.pluginCatalogEndpointByID.get(request.catalogID) ??
    asArray(capability.endpoints).find(
      (candidate) => candidate.id === request.catalogID,
    );
  assertRequest(
    !!endpoint,
    `unknown plugin catalog endpoint '${request.catalogID}'`,
    undefined,
    traceId,
  );

  assertRequest(
    asArray(endpoint.pluginKinds).includes(request.pluginKind),
    `plugin kind '${request.pluginKind}' is not supported by endpoint '${endpoint.id}'`,
    undefined,
    traceId,
  );

  if (request.query !== undefined) {
    assertRequest(
      nonBlank(request.query),
      "query cannot be blank when provided",
      undefined,
      traceId,
    );
  }

  validatePage(request.page, traceId);
  return request;
}

function validateMediaSummary(summary: MediaSummary, traceId?: string): void {
  assertResponse(
    nonBlank(summary.id?.namespace),
    "media id namespace cannot be empty",
    undefined,
    traceId,
  );
  assertResponse(
    nonBlank(summary.id?.value),
    "media id value cannot be empty",
    undefined,
    traceId,
  );
  assertResponse(
    nonBlank(summary.title),
    "media title cannot be empty",
    undefined,
    traceId,
  );
}

function validateVideoUnit(video: VideoUnit, traceId?: string): void {
  assertResponse(
    nonBlank(video.id),
    "video.id cannot be empty",
    undefined,
    traceId,
  );
  assertResponse(
    nonBlank(video.title),
    "video.title cannot be empty",
    undefined,
    traceId,
  );
  for (const stream of asArray(video.streams)) {
    validateStreamSource(stream, traceId);
  }
  for (const trailer of asArray(video.trailers)) {
    validateStreamSource(trailer, traceId);
  }
}

function validateStringMap(
  value: unknown,
  fieldName: string,
  traceId?: string,
): void {
  assertResponse(
    isRecord(value),
    `${fieldName} must be an object`,
    undefined,
    traceId,
  );
  for (const [key, headerValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    assertResponse(
      nonBlank(key),
      `${fieldName} contains blank header name`,
      undefined,
      traceId,
    );
    assertResponse(
      typeof headerValue === "string" && nonBlank(headerValue),
      `${fieldName} '${key}' must be a non-empty string`,
      undefined,
      traceId,
    );
  }
}

function validateStreamSource(stream: StreamSource, traceId?: string): void {
  if (stream.name !== undefined) {
    assertResponse(
      nonBlank(stream.name),
      "stream name cannot be blank",
      undefined,
      traceId,
    );
  }

  if (stream.selection?.fileIndex !== undefined) {
    assertResponse(
      Number.isInteger(stream.selection.fileIndex),
      "stream selection fileIndex must be an integer",
      undefined,
      traceId,
    );
    assertResponse(
      stream.selection.fileIndex >= 0,
      "stream selection fileIndex must be >= 0",
      undefined,
      traceId,
    );
  }

  if (stream.selection?.fileMustInclude !== undefined) {
    assertResponse(
      nonBlank(stream.selection.fileMustInclude),
      "stream selection fileMustInclude cannot be blank",
      undefined,
      traceId,
    );
  }

  const transport = stream.transport;
  switch (transport.kind) {
    case "http":
      assertResponse(
        nonBlank(transport.url),
        "http transport url cannot be empty",
        undefined,
        traceId,
      );
      if (transport.mode !== undefined) {
        assertResponse(
          transport.mode === "stream" || transport.mode === "external",
          "http transport mode must be 'stream' or 'external'",
          undefined,
          traceId,
        );
      }
      break;
    case "youtube":
      assertResponse(
        nonBlank(transport.id),
        "youtube transport id cannot be empty",
        undefined,
        traceId,
      );
      break;
    case "torrent":
      assertResponse(
        nonBlank(transport.infoHash),
        "torrent transport infoHash cannot be empty",
        undefined,
        traceId,
      );
      for (const source of asArray(transport.peerDiscovery)) {
        assertResponse(
          nonBlank(source),
          "torrent peerDiscovery cannot contain blank values",
          undefined,
          traceId,
        );
      }
      break;
    case "usenet":
      assertResponse(
        nonBlank(transport.nzbURL),
        "usenet transport nzbURL cannot be empty",
        undefined,
        traceId,
      );
      for (const server of asArray(transport.servers)) {
        assertResponse(
          nonBlank(server),
          "usenet transport servers cannot contain blank values",
          undefined,
          traceId,
        );
      }
      break;
    case "archive":
      assertResponse(
        ARCHIVE_FORMATS.has(transport.format),
        "archive transport format is invalid",
        transport.format,
        traceId,
      );
      assertResponse(
        asArray(transport.files).length > 0,
        "archive transport must contain at least one file",
        undefined,
        traceId,
      );
      for (const file of asArray(transport.files)) {
        assertResponse(
          nonBlank(file.url),
          "archive transport file url cannot be empty",
          undefined,
          traceId,
        );
        if (file.bytes !== undefined) {
          assertResponse(
            Number.isInteger(file.bytes),
            "archive transport file bytes must be an integer",
            undefined,
            traceId,
          );
          assertResponse(
            file.bytes > 0,
            "archive transport file bytes must be > 0",
            undefined,
            traceId,
          );
        }
      }
      break;
    default:
      assertResponse(
        false,
        "stream transport kind is invalid",
        transport,
        traceId,
      );
  }

  if (stream.hints?.videoHash !== undefined) {
    assertResponse(
      nonBlank(stream.hints.videoHash),
      "stream hints videoHash cannot be blank",
      undefined,
      traceId,
    );
  }

  for (const country of asArray(stream.hints?.countryWhitelist)) {
    assertResponse(
      nonBlank(country),
      "stream hints countryWhitelist cannot contain blank values",
      undefined,
      traceId,
    );
  }

  if (stream.hints?.proxyHeaders !== undefined) {
    assertResponse(
      stream.hints.notWebReady === true,
      "proxyHeaders require hints.notWebReady to be true",
      undefined,
      traceId,
    );
    if (stream.hints.proxyHeaders.request !== undefined) {
      validateStringMap(
        stream.hints.proxyHeaders.request,
        "proxyHeaders.request",
        traceId,
      );
    }
    if (stream.hints.proxyHeaders.response !== undefined) {
      validateStringMap(
        stream.hints.proxyHeaders.response,
        "proxyHeaders.response",
        traceId,
      );
    }
  }
}

export function validateRedirectInstruction(
  redirect: RedirectInstruction | undefined,
  traceId?: string,
): void {
  if (!redirect) {
    return;
  }

  assertResponse(
    nonBlank(redirect.url),
    "redirect url cannot be empty",
    undefined,
    traceId,
  );
  try {
    // eslint-disable-next-line no-new
    new URL(redirect.url);
  } catch {
    throw ProtocolError.responseInvalid(
      "redirect url must be an absolute URL",
      { url: redirect.url },
      traceId,
    );
  }

  if (redirect.status !== undefined) {
    assertResponse(
      redirect.status === 302 || redirect.status === 307,
      "redirect status must be 302 or 307",
      undefined,
      traceId,
    );
  }
}

function validateCatalogResponse(
  response: CatalogResponse,
  traceId?: string,
): CatalogResponse {
  checkSupportedSchemaVersion(
    response.schemaVersion,
    "response.catalog",
    "response",
    traceId,
  );
  validateRedirectInstruction(response.redirect, traceId);
  for (const item of asArray(response.items)) {
    validateMediaSummary(item, traceId);
  }
  return response;
}

function validateMetaResponse(
  response: MetaResponse,
  traceId?: string,
): MetaResponse {
  checkSupportedSchemaVersion(
    response.schemaVersion,
    "response.meta",
    "response",
    traceId,
  );
  validateRedirectInstruction(response.redirect, traceId);
  const item = response.item;
  if (!item) {
    return response;
  }

  const detail = item as MediaDetail;
  validateMediaSummary(detail.summary, traceId);

  const videos = asArray(detail.videos);
  for (const video of videos) {
    validateVideoUnit(video, traceId);
  }

  for (const trailer of asArray(detail.trailers)) {
    validateStreamSource(trailer, traceId);
  }

  if (detail.defaultVideoID !== undefined) {
    assertResponse(
      nonBlank(detail.defaultVideoID),
      "defaultVideoID cannot be blank",
      undefined,
      traceId,
    );
    if (videos.length > 0) {
      assertResponse(
        videos.some((video) => video.id === detail.defaultVideoID),
        "defaultVideoID must reference an existing video id",
        undefined,
        traceId,
      );
    }
  }

  return response;
}

function validateStreamsResponse(
  response: StreamsResponse,
  traceId?: string,
): StreamsResponse {
  checkSupportedSchemaVersion(
    response.schemaVersion,
    "response.streams",
    "response",
    traceId,
  );
  validateRedirectInstruction(response.redirect, traceId);
  for (const stream of asArray(response.streams)) {
    validateStreamSource(stream, traceId);
  }
  return response;
}

function validateSubtitlesResponse(
  response: SubtitlesResponse,
  traceId?: string,
): SubtitlesResponse {
  checkSupportedSchemaVersion(
    response.schemaVersion,
    "response.subtitles",
    "response",
    traceId,
  );
  validateRedirectInstruction(response.redirect, traceId);
  for (const subtitle of asArray(response.subtitles)) {
    assertResponse(
      nonBlank(subtitle.id),
      "subtitle.id cannot be empty",
      undefined,
      traceId,
    );
    assertResponse(
      nonBlank(subtitle.url),
      "subtitle.url cannot be empty",
      undefined,
      traceId,
    );
    assertResponse(
      nonBlank(subtitle.languageCode),
      "subtitle.languageCode cannot be empty",
      undefined,
      traceId,
    );
  }
  return response;
}

function validatePluginCatalogResponse(
  response: PluginCatalogResponse,
  traceId?: string,
): PluginCatalogResponse {
  checkSupportedSchemaVersion(
    response.schemaVersion,
    "response.plugin_catalog",
    "response",
    traceId,
  );
  validateRedirectInstruction(response.redirect, traceId);
  for (const plugin of asArray(response.plugins)) {
    assertResponse(
      nonBlank(plugin.id),
      "plugin.id cannot be empty",
      undefined,
      traceId,
    );
    assertResponse(
      nonBlank(plugin.name),
      "plugin.name cannot be empty",
      undefined,
      traceId,
    );
    assertResponse(
      nonBlank(plugin.version),
      "plugin.version cannot be empty",
      undefined,
      traceId,
    );

    if (plugin.distribution !== undefined) {
      assertResponse(
        nonBlank(plugin.distribution.transport),
        "plugin distribution transport cannot be empty",
        undefined,
        traceId,
      );
      assertResponse(
        nonBlank(plugin.distribution.manifestURL),
        "plugin distribution manifestURL cannot be empty",
        undefined,
        traceId,
      );
    }

    if (plugin.manifestSnapshot !== undefined) {
      assertResponse(
        isRecord(plugin.manifestSnapshot),
        "plugin manifestSnapshot must be an object",
        undefined,
        traceId,
      );
    }
  }
  return response;
}

export function validateRequest<K extends ResourceKind>(
  resource: K,
  request: ResourceRequestMap[K],
  manifest: Manifest,
  index?: ManifestIndex,
  traceId?: string,
): ResourceRequestMap[K] {
  switch (resource) {
    case "catalog":
      return validateCatalogRequest(
        request as CatalogRequest,
        manifest,
        index,
        traceId,
      ) as ResourceRequestMap[K];
    case "meta":
      return validateMetaRequest(
        request as MetaRequest,
        manifest,
        index,
        traceId,
      ) as ResourceRequestMap[K];
    case "stream":
      return validateStreamRequest(
        request as StreamRequest,
        manifest,
        index,
        traceId,
      ) as ResourceRequestMap[K];
    case "subtitles":
      return validateSubtitlesRequest(
        request as SubtitlesRequest,
        manifest,
        index,
        traceId,
      ) as ResourceRequestMap[K];
    case "plugin_catalog":
      return validatePluginCatalogRequest(
        request as PluginCatalogRequest,
        manifest,
        index,
        traceId,
      ) as ResourceRequestMap[K];
    default:
      throw ProtocolError.requestInvalid(
        `Unsupported resource '${String(resource)}'`,
        undefined,
        traceId,
      );
  }
}

export function validateResponse<K extends ResourceKind>(
  resource: K,
  response: ResourceResponseMap[K],
  traceId?: string,
): ResourceResponseMap[K] {
  switch (resource) {
    case "catalog":
      return validateCatalogResponse(
        response as CatalogResponse,
        traceId,
      ) as ResourceResponseMap[K];
    case "meta":
      return validateMetaResponse(
        response as MetaResponse,
        traceId,
      ) as ResourceResponseMap[K];
    case "stream":
      return validateStreamsResponse(
        response as StreamsResponse,
        traceId,
      ) as ResourceResponseMap[K];
    case "subtitles":
      return validateSubtitlesResponse(
        response as SubtitlesResponse,
        traceId,
      ) as ResourceResponseMap[K];
    case "plugin_catalog":
      return validatePluginCatalogResponse(
        response as PluginCatalogResponse,
        traceId,
      ) as ResourceResponseMap[K];
    default:
      throw ProtocolError.responseInvalid(
        `Unsupported resource '${String(resource)}'`,
        undefined,
        traceId,
      );
  }
}
