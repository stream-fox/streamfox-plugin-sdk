import { ProtocolError } from "./errors";
import type { InstallOptions, SettingPrimitive } from "./install";
import {
  SCHEMA_VERSION_CURRENT,
  type CatalogEndpoint,
  type Capability,
  type HandlerKey,
  type ManifestIndex,
  type Manifest,
  type PluginCatalogEndpoint,
  type ResourceKind,
  type ResourceRequestMap,
  type ResourceResponseMap,
} from "./types";
import { deepFreeze, isRecord } from "./utils";
import { validateManifest } from "./validators";

export interface HandlerContext<TSettings extends Record<string, SettingPrimitive> = Record<string, SettingPrimitive>> {
  traceId?: string;
  headers?: Record<string, string | string[] | undefined>;
  request?: Request;
  settings?: Readonly<Partial<TSettings>>;
}

export type HandlerResponse<K extends ResourceKind> = Omit<ResourceResponseMap[K], "schemaVersion"> & {
  schemaVersion?: ResourceResponseMap[K]["schemaVersion"];
};

export type PluginHandler<
  K extends ResourceKind,
  TSettings extends Record<string, SettingPrimitive> = Record<string, SettingPrimitive>,
> = (
  request: ResourceRequestMap[K],
  context: HandlerContext<TSettings>,
) => Promise<HandlerResponse<K>> | HandlerResponse<K>;

export interface PluginHandlers<TSettings extends Record<string, SettingPrimitive> = Record<string, SettingPrimitive>> {
  catalog?: PluginHandler<"catalog", TSettings>;
  meta?: PluginHandler<"meta", TSettings>;
  stream?: PluginHandler<"stream", TSettings>;
  subtitles?: PluginHandler<"subtitles", TSettings>;
  pluginCatalog?: PluginHandler<"plugin_catalog", TSettings>;
}

export interface CreatePluginOptions<TSettings extends Record<string, SettingPrimitive> = Record<string, SettingPrimitive>> {
  manifest: Manifest;
  handlers: PluginHandlers<TSettings>;
  install?: InstallOptions;
}

export interface MediaPlugin<TSettings extends Record<string, SettingPrimitive> = Record<string, SettingPrimitive>> {
  readonly manifest: Manifest;
  readonly handlers: Readonly<PluginHandlers<TSettings>>;
  readonly install?: Readonly<InstallOptions>;
  readonly index: ManifestIndex;
  handle<K extends ResourceKind>(
    resource: K,
    request: ResourceRequestMap[K],
    context?: HandlerContext<TSettings>,
  ): Promise<ResourceResponseMap[K]>;
}

const resourceToHandlerKey: Record<ResourceKind, HandlerKey> = {
  catalog: "catalog",
  meta: "meta",
  stream: "stream",
  subtitles: "subtitles",
  plugin_catalog: "pluginCatalog",
};

function requiredHandlerKeys(manifest: Manifest): HandlerKey[] {
  const keys: HandlerKey[] = [];

  for (const capability of manifest.capabilities) {
    keys.push(resourceToHandlerKey[capability.kind]);
  }

  return Array.from(new Set(keys));
}

function buildManifestIndex(manifest: Manifest): ManifestIndex {
  const capabilityByKind: Partial<Record<ResourceKind, Capability>> = {};
  const catalogEndpointByID = new Map<string, CatalogEndpoint>();
  const pluginCatalogEndpointByID = new Map<string, PluginCatalogEndpoint>();

  for (const capability of manifest.capabilities) {
    capabilityByKind[capability.kind] = capability;

    if (capability.kind === "catalog") {
      for (const endpoint of capability.endpoints) {
        catalogEndpointByID.set(endpoint.id, endpoint);
      }
      continue;
    }

    if (capability.kind === "plugin_catalog") {
      for (const endpoint of capability.endpoints) {
        pluginCatalogEndpointByID.set(endpoint.id, endpoint);
      }
    }
  }

  return {
    capabilityByKind,
    catalogEndpointByID,
    pluginCatalogEndpointByID,
  };
}

function withResponseSchemaVersion<K extends ResourceKind>(response: HandlerResponse<K>): ResourceResponseMap[K] {
  if (isRecord(response) && !("schemaVersion" in response)) {
    return {
      ...(response as Record<string, unknown>),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    } as ResourceResponseMap[K];
  }

  return response as ResourceResponseMap[K];
}

export function createPlugin<TSettings extends Record<string, SettingPrimitive> = Record<string, SettingPrimitive>>(
  options: CreatePluginOptions<TSettings>,
): MediaPlugin<TSettings> {
  const manifest = validateManifest(options.manifest);
  const handlers = { ...options.handlers } as PluginHandlers<TSettings>;
  const requiredKeys = requiredHandlerKeys(manifest);

  for (const key of requiredKeys) {
    if (typeof handlers[key] !== "function") {
      throw ProtocolError.manifestInvalid(
        `manifest definition requires handler for ${key === "pluginCatalog" ? "plugin_catalog" : key}, but it is not provided`,
      );
    }
  }

  for (const key of Object.keys(handlers) as HandlerKey[]) {
    if (handlers[key] && !requiredKeys.includes(key)) {
      throw ProtocolError.manifestInvalid(
        `handler '${key}' is defined, but manifest does not declare its capability`,
      );
    }
  }

  const frozenManifest = deepFreeze({ ...manifest });
  const frozenHandlers = deepFreeze(handlers);
  const frozenInstall = options.install ? deepFreeze({ ...options.install }) : undefined;
  const index = buildManifestIndex(frozenManifest);

  return {
    manifest: frozenManifest,
    handlers: frozenHandlers,
    ...(frozenInstall ? { install: frozenInstall } : {}),
    index,
    async handle(resource, request, context = {}) {
      const handlerKey = resourceToHandlerKey[resource] as HandlerKey;
      const handler = frozenHandlers[handlerKey] as PluginHandler<typeof resource, TSettings> | undefined;

      if (!handler) {
        throw ProtocolError.noHandler(resource, context.traceId);
      }

      const response = await handler(request, context);
      return withResponseSchemaVersion(response);
    },
  };
}
