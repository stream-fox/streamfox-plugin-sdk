import type {
  Capability,
  CatalogEndpoint,
  FilterOption,
  FilterSpec,
  Manifest,
  PluginCatalogCapability,
  ResourceKind,
  StreamCapability,
  CatalogCapability,
  MetaCapability,
  SubtitlesCapability,
} from "./types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function asArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

export function dedupe<T>(values: Iterable<T>): T[] {
  return Array.from(new Set(values));
}

export function isResourceKind(value: unknown): value is ResourceKind {
  return (
    value === "catalog" ||
    value === "meta" ||
    value === "stream" ||
    value === "subtitles" ||
    value === "plugin_catalog"
  );
}

export function getCapability<K extends ResourceKind>(
  manifest: Manifest,
  kind: K,
): Extract<Capability, { kind: K }> | undefined {
  return manifest.capabilities.find(
    (capability): capability is Extract<Capability, { kind: K }> =>
      capability.kind === kind,
  );
}

export function getCatalogCapability(
  manifest: Manifest,
): CatalogCapability | undefined {
  return getCapability(manifest, "catalog");
}

export function normalizeFilterOptions(spec: FilterSpec): FilterOption[] {
  if (Array.isArray(spec.options) && spec.options.length > 0) {
    return spec.options;
  }

  return asArray(spec.allowedValues).map((value) => ({
    value,
    label: value,
  }));
}

export function resolveCatalogEndpointFilters(
  capability: CatalogCapability | undefined,
  endpoint: CatalogEndpoint | undefined,
): FilterSpec[] {
  if (!capability || !endpoint) {
    return [];
  }

  const filterSetRefs = asArray(endpoint.filterSetRefs);
  const resolvedFromSets = filterSetRefs.flatMap(
    (ref) => capability.filterSets?.[ref] ?? [],
  );

  return [...resolvedFromSets, ...asArray(endpoint.filters)];
}

export function getCatalogEndpointFilters(
  manifest: Manifest,
  catalogID: string,
): FilterSpec[] {
  const capability = getCatalogCapability(manifest);
  const endpoint = capability?.endpoints.find((candidate) => candidate.id === catalogID);
  return resolveCatalogEndpointFilters(capability, endpoint);
}

export function getMetaCapability(
  manifest: Manifest,
): MetaCapability | undefined {
  return getCapability(manifest, "meta");
}

export function getStreamCapability(
  manifest: Manifest,
): StreamCapability | undefined {
  return getCapability(manifest, "stream");
}

export function getSubtitlesCapability(
  manifest: Manifest,
): SubtitlesCapability | undefined {
  return getCapability(manifest, "subtitles");
}

export function getPluginCatalogCapability(
  manifest: Manifest,
): PluginCatalogCapability | undefined {
  return getCapability(manifest, "plugin_catalog");
}

export function deepFreeze<T>(value: T): T {
  if (!isRecord(value) && !Array.isArray(value)) {
    return value;
  }

  Object.freeze(value);

  const entries: unknown[] = Array.isArray(value)
    ? value
    : Object.values(value as Record<string, unknown>);

  for (const entry of entries) {
    if ((isRecord(entry) || Array.isArray(entry)) && !Object.isFrozen(entry)) {
      deepFreeze(entry);
    }
  }

  return value;
}
