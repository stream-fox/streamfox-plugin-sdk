import {
  SCHEMA_VERSION_CURRENT,
  type CatalogEndpoint,
  type ExperimentalField,
  type FilterSpec,
  type Manifest,
  type MediaType,
  type MetaInclude,
  type PluginCatalogEndpoint,
  type PluginInfo,
  type PluginKindRef,
  type SchemaVersion,
  type SupportedTransport,
} from "./types";
import type {
  AnySettingField,
  InferSettings,
  InstallOptions,
  SettingPrimitive,
} from "./install";
import { createPlugin, type MediaPlugin, type PluginHandler } from "./plugin";
import { ProtocolError } from "./errors";

interface CatalogResource<TSettings extends Record<string, SettingPrimitive>> {
  filterSets?: Record<string, FilterSpec[]>;
  endpoints: CatalogEndpoint[];
  handler: PluginHandler<"catalog", TSettings>;
}

interface MetaResource<TSettings extends Record<string, SettingPrimitive>> {
  mediaTypes: MediaType[];
  includes?: MetaInclude[];
  handler: PluginHandler<"meta", TSettings>;
}

interface StreamResource<TSettings extends Record<string, SettingPrimitive>> {
  mediaTypes: MediaType[];
  supportedTransports: SupportedTransport[];
  handler: PluginHandler<"stream", TSettings>;
}

interface SubtitlesResource<
  TSettings extends Record<string, SettingPrimitive>,
> {
  mediaTypes: MediaType[];
  supportsHashLookup?: boolean;
  defaultLanguages?: string[];
  handler: PluginHandler<"subtitles", TSettings>;
}

interface PluginCatalogResource<
  TSettings extends Record<string, SettingPrimitive>,
> {
  endpoints: PluginCatalogEndpoint[];
  pluginKinds?: PluginKindRef[];
  handler: PluginHandler<"plugin_catalog", TSettings>;
}

export interface DefineResources<
  TSettings extends Record<string, SettingPrimitive>,
> {
  catalog?: CatalogResource<TSettings>;
  meta?: MetaResource<TSettings>;
  stream?: StreamResource<TSettings>;
  subtitles?: SubtitlesResource<TSettings>;
  pluginCatalog?: PluginCatalogResource<TSettings>;
}

export interface DefinePluginOptions<
  TFields extends readonly AnySettingField[] = readonly AnySettingField[],
> {
  plugin: PluginInfo;
  resources: DefineResources<InferSettings<TFields>>;
  install?: InstallOptions<TFields>;
  schemaVersion?: SchemaVersion;
  experimental?: ExperimentalField[];
}

export function definePlugin<
  TFields extends readonly AnySettingField[] = readonly AnySettingField[],
>(options: DefinePluginOptions<TFields>): MediaPlugin<InferSettings<TFields>> {
  const resources = options.resources ?? {};

  const manifestCapabilities: Manifest["capabilities"] = [];
  const handlers: {
    catalog?: PluginHandler<"catalog", InferSettings<TFields>>;
    meta?: PluginHandler<"meta", InferSettings<TFields>>;
    stream?: PluginHandler<"stream", InferSettings<TFields>>;
    subtitles?: PluginHandler<"subtitles", InferSettings<TFields>>;
    pluginCatalog?: PluginHandler<"plugin_catalog", InferSettings<TFields>>;
  } = {};

  if (resources.catalog) {
    manifestCapabilities.push({
      kind: "catalog",
      ...(resources.catalog.filterSets
        ? { filterSets: resources.catalog.filterSets }
        : {}),
      endpoints: resources.catalog.endpoints,
    });
    handlers.catalog = resources.catalog.handler;
  }

  if (resources.meta) {
    manifestCapabilities.push({
      kind: "meta",
      mediaTypes: resources.meta.mediaTypes,
      ...(resources.meta.includes ? { includes: resources.meta.includes } : {}),
    });
    handlers.meta = resources.meta.handler;
  }

  if (resources.stream) {
    manifestCapabilities.push({
      kind: "stream",
      mediaTypes: resources.stream.mediaTypes,
      supportedTransports: resources.stream.supportedTransports,
    });
    handlers.stream = resources.stream.handler;
  }

  if (resources.subtitles) {
    manifestCapabilities.push({
      kind: "subtitles",
      mediaTypes: resources.subtitles.mediaTypes,
      ...(resources.subtitles.supportsHashLookup !== undefined
        ? { supportsHashLookup: resources.subtitles.supportsHashLookup }
        : {}),
      ...(resources.subtitles.defaultLanguages
        ? { defaultLanguages: resources.subtitles.defaultLanguages }
        : {}),
    });
    handlers.subtitles = resources.subtitles.handler;
  }

  if (resources.pluginCatalog) {
    manifestCapabilities.push({
      kind: "plugin_catalog",
      endpoints: resources.pluginCatalog.endpoints,
    });
    handlers.pluginCatalog = resources.pluginCatalog.handler;
  }

  if (manifestCapabilities.length === 0) {
    throw ProtocolError.manifestInvalid(
      "definePlugin requires at least one resource",
    );
  }

  return createPlugin<InferSettings<TFields>>({
    manifest: {
      schemaVersion: options.schemaVersion ?? SCHEMA_VERSION_CURRENT,
      plugin: options.plugin,
      capabilities: manifestCapabilities,
      ...(options.experimental ? { experimental: options.experimental } : {}),
    },
    handlers,
    ...(options.install ? { install: options.install } : {}),
  });
}
