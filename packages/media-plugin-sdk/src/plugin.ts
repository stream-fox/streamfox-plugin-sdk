import { ProtocolError } from "./errors";
import type { HandlerKey, Manifest, ResourceKind, ResourceRequestMap, ResourceResponseMap } from "./types";
import { deepFreeze } from "./utils";
import { validateManifest } from "./validators";

export interface HandlerContext {
  traceId?: string;
  headers?: Record<string, string | string[] | undefined>;
  request?: Request;
}

export type PluginHandler<K extends ResourceKind> = (
  request: ResourceRequestMap[K],
  context: HandlerContext,
) => Promise<ResourceResponseMap[K]> | ResourceResponseMap[K];

export interface PluginHandlers {
  catalog?: PluginHandler<"catalog">;
  meta?: PluginHandler<"meta">;
  stream?: PluginHandler<"stream">;
  subtitles?: PluginHandler<"subtitles">;
  pluginCatalog?: PluginHandler<"plugin_catalog">;
}

export interface CreatePluginOptions {
  manifest: Manifest;
  handlers: PluginHandlers;
}

export interface MediaPlugin {
  readonly manifest: Manifest;
  readonly handlers: Readonly<PluginHandlers>;
  handle<K extends ResourceKind>(
    resource: K,
    request: ResourceRequestMap[K],
    context?: HandlerContext,
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

export function createPlugin(options: CreatePluginOptions): MediaPlugin {
  const manifest = validateManifest(options.manifest);
  const handlers = { ...options.handlers };
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

  return {
    manifest: frozenManifest,
    handlers: frozenHandlers,
    async handle(resource, request, context = {}) {
      const handlerKey = resourceToHandlerKey[resource];
      const handler = frozenHandlers[handlerKey] as PluginHandler<typeof resource> | undefined;

      if (!handler) {
        throw ProtocolError.noHandler(resource, context.traceId);
      }

      return handler(request, context);
    },
  };
}
