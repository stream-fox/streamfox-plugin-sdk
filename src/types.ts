export const SCHEMA_VERSION_CURRENT = {
  major: 1,
  minor: 0,
} as const;

export type OpenString<T extends string> = T | (string & {});

export interface SchemaVersion {
  major: number;
  minor: number;
}

export type MediaType = OpenString<
  "movie" | "series" | "season" | "episode" | "liveChannel" | "other"
>;

export type PluginKindRef = OpenString<
  "catalog" | "meta" | "stream" | "subtitles" | "plugin_catalog"
>;

export type FilterValueType =
  | "string"
  | "int"
  | "bool"
  | "stringList"
  | "intRange"
  | "intOrRange";
export type FilterControl =
  | "select"
  | "multi_select"
  | "text"
  | "number"
  | "range"
  | "toggle";
export type SortDirection = "ascending" | "descending";
export type SupportedTransport =
  | "http"
  | "youtube"
  | "torrent"
  | "usenet"
  | "archive";
export type ArchiveFormat = "rar" | "zip" | "7zip" | "tar" | "tgz";
export type RedirectStatus = 302 | 307;

export interface ExperimentalField {
  namespace: string;
  key: string;
  value: unknown;
  [key: string]: unknown;
}

export interface PluginInfoAuthor {
  name: string;
  email?: string;
  website?: string;
  [key: string]: unknown;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
  logo?: string;
  author?: PluginInfoAuthor;
  homepage?: string;
  [key: string]: unknown;
}

export interface Paging {
  defaultPageSize?: number;
  maxPageSize?: number;
  [key: string]: unknown;
}

export interface FilterOption {
  value: string;
  label: string;
  aliases?: string[];
  [key: string]: unknown;
}

export interface FilterRangeDefaultValue {
  min?: number;
  max?: number;
  [key: string]: unknown;
}

export type FilterDefaultValue =
  | string
  | number
  | boolean
  | string[]
  | FilterRangeDefaultValue;

export interface FilterSpec {
  key: string;
  valueType: FilterValueType;
  isRequired?: boolean;
  label?: string;
  description?: string;
  placeholder?: string;
  group?: string;
  control?: FilterControl;
  defaultValue?: FilterDefaultValue;
  options?: FilterOption[];
  allowedValues?: string[];
  [key: string]: unknown;
}

export interface SortSpec {
  key: string;
  label?: string;
  description?: string;
  group?: string;
  aliases?: string[];
  directions: SortDirection[];
  defaultDirection?: SortDirection;
  [key: string]: unknown;
}

export type MetaInclude =
  | "videos"
  | "links"
  | "genres"
  | "cast"
  | "directors"
  | "writers"
  | "trailers"
  | "awards"
  | "popularity"
  | "behaviorHints"
  | "similarItems";

export interface CatalogEndpoint {
  id: string;
  name: string;
  mediaTypes: MediaType[];
  filterSetRefs?: string[];
  sortSetRefs?: string[];
  filters?: FilterSpec[];
  paging?: Paging;
  sorts?: SortSpec[];
  [key: string]: unknown;
}

export interface PluginCatalogEndpoint {
  id: string;
  name: string;
  pluginKinds: PluginKindRef[];
  tags?: string[];
  paging?: Paging;
  [key: string]: unknown;
}

export interface CatalogCapability {
  kind: "catalog";
  filterSets?: Record<string, FilterSpec[]>;
  sortSets?: Record<string, SortSpec[]>;
  endpoints: CatalogEndpoint[];
  [key: string]: unknown;
}

export interface MetaCapability {
  kind: "meta";
  mediaTypes: MediaType[];
  includes?: MetaInclude[];
  [key: string]: unknown;
}

export interface StreamCapability {
  kind: "stream";
  mediaTypes: MediaType[];
  supportedTransports: SupportedTransport[];
  [key: string]: unknown;
}

export interface SubtitlesCapability {
  kind: "subtitles";
  mediaTypes: MediaType[];
  supportsHashLookup?: boolean;
  defaultLanguages?: string[];
  [key: string]: unknown;
}

export interface PluginCatalogCapability {
  kind: "plugin_catalog";
  endpoints: PluginCatalogEndpoint[];
  [key: string]: unknown;
}

export type Capability =
  | CatalogCapability
  | MetaCapability
  | StreamCapability
  | SubtitlesCapability
  | PluginCatalogCapability;

export type ResourceKind = Capability["kind"];

export interface Manifest {
  schemaVersion: SchemaVersion;
  plugin: PluginInfo;
  capabilities: Capability[];
  experimental?: ExperimentalField[];
  [key: string]: unknown;
}

export interface SettingValue {
  key: string;
  value: string;
  [key: string]: unknown;
}

export interface RequestContext {
  locale?: string;
  regionCode?: string;
  traceID?: string;
  settingsSnapshot?: SettingValue[];
  [key: string]: unknown;
}

export interface RequestSort {
  key: string;
  direction: SortDirection;
  [key: string]: unknown;
}

export interface RequestPage {
  index: number;
  size?: number;
  [key: string]: unknown;
}

export interface IntRange {
  min?: number;
  max?: number;
  [key: string]: unknown;
}

export type FilterValue =
  | {
      kind: "string";
      string?: string;
      int?: never;
      bool?: never;
      stringList?: never;
      intRange?: never;
    }
  | {
      kind: "int";
      string?: never;
      int?: number;
      bool?: never;
      stringList?: never;
      intRange?: never;
    }
  | {
      kind: "bool";
      string?: never;
      int?: never;
      bool?: boolean;
      stringList?: never;
      intRange?: never;
    }
  | {
      kind: "stringList";
      string?: never;
      int?: never;
      bool?: never;
      stringList?: string[];
      intRange?: never;
    }
  | {
      kind: "intRange";
      string?: never;
      int?: never;
      bool?: never;
      stringList?: never;
      intRange?: IntRange;
    };

export interface RequestFilter {
  key: string;
  value: FilterValue;
  [key: string]: unknown;
}

export interface CatalogRequest {
  schemaVersion: SchemaVersion;
  catalogID: string;
  mediaType: MediaType;
  query?: string;
  page?: RequestPage;
  sort?: RequestSort;
  filters?: RequestFilter[];
  context?: RequestContext;
  experimental?: ExperimentalField[];
  [key: string]: unknown;
}

export interface MetaRequest {
  schemaVersion: SchemaVersion;
  mediaType: MediaType;
  itemID: string;
  context?: RequestContext;
  experimental?: ExperimentalField[];
  [key: string]: unknown;
}

export interface Playback {
  startPositionSeconds?: number;
  networkProfile?: string;
  [key: string]: unknown;
}

export interface StreamRequest {
  schemaVersion: SchemaVersion;
  mediaType: MediaType;
  itemID: string;
  videoID?: string;
  playback?: Playback;
  context?: RequestContext;
  experimental?: ExperimentalField[];
  [key: string]: unknown;
}

export interface VideoFingerprint {
  hash?: string;
  size?: number;
  filename?: string;
  [key: string]: unknown;
}

export interface SubtitlesRequest {
  schemaVersion: SchemaVersion;
  mediaType: MediaType;
  itemID: string;
  videoFingerprint?: VideoFingerprint;
  languagePreferences?: string[];
  context?: RequestContext;
  experimental?: ExperimentalField[];
  [key: string]: unknown;
}

export interface PluginCatalogRequest {
  schemaVersion: SchemaVersion;
  catalogID: string;
  pluginKind: PluginKindRef;
  page?: RequestPage;
  query?: string;
  context?: RequestContext;
  experimental?: ExperimentalField[];
  [key: string]: unknown;
}

export interface LinkRef {
  name: string;
  url: string;
  category?: string;
  [key: string]: unknown;
}

export interface CachePolicy {
  maxAgeSeconds?: number;
  staleWhileRevalidateSeconds?: number;
  staleIfErrorSeconds?: number;
  [key: string]: unknown;
}

export interface SubtitleTrack {
  id: string;
  url: string;
  languageCode: string;
  [key: string]: unknown;
}

export interface ProxyHeaders {
  request?: Record<string, string>;
  response?: Record<string, string>;
  [key: string]: unknown;
}

export interface StreamHints {
  countryWhitelist?: string[];
  bingeGroup?: string;
  filename?: string;
  videoSize?: number;
  notWebReady?: boolean;
  proxyHeaders?: ProxyHeaders;
  videoHash?: string;
  [key: string]: unknown;
}

export interface StreamFileSource {
  url: string;
  bytes?: number;
  [key: string]: unknown;
}

export interface StreamSelection {
  fileIndex?: number;
  fileMustInclude?: string;
  [key: string]: unknown;
}

export type StreamTransport =
  | { kind: "http"; url: string; mode?: "stream" | "external" }
  | { kind: "youtube"; id: string }
  | { kind: "torrent"; infoHash: string; peerDiscovery?: string[] }
  | { kind: "usenet"; nzbURL: string; servers?: string[] }
  | { kind: "archive"; format: ArchiveFormat; files: StreamFileSource[] };

export interface StreamSource {
  transport: StreamTransport;
  selection?: StreamSelection;
  name?: string;
  description?: string;
  subtitles?: SubtitleTrack[];
  hints?: StreamHints;
  [key: string]: unknown;
}

export interface MediaSummary {
  id: string;
  mediaType: MediaType;
  title: string;
  year?: number;
  yearLabel?: string;
  poster?: string;
  background?: string;
  runtime?: string;
  genres?: string[];
  rating?: string;
  imdbRating?: number;
  sourceRatings?: SourceRating[];
  synopsis?: string;
  links?: LinkRef[];
  logoURL?: string;
  releasedAt?: string;
  slug?: string;
  popularity?: number;
  [key: string]: unknown;
}

export interface PersonCredit {
  name: string;
  role?: string;
  character?: string;
  photoURL?: string;
  externalURL?: string;
  [key: string]: unknown;
}

export interface SourceRating {
  provider: string;
  rating: number;
  [key: string]: unknown;
}

export interface MediaBehaviorHints {
  defaultVideoId?: string | null;
  hasScheduledVideos?: boolean;
  [key: string]: unknown;
}

export interface VideoUnit {
  id: string;
  title: string;
  releasedAt?: string;
  firstAiredAt?: string;
  thumbnail?: string;
  available?: boolean;
  season?: number;
  episode?: number;
  rating?: number;
  overview?: string;
  streams?: StreamSource[];
  trailers?: StreamSource[];
  [key: string]: unknown;
}

export interface MediaDetail {
  summary: MediaSummary;
  background?: string;
  releasedAt?: string;
  dvdReleaseAt?: string;
  logoURL?: string;
  runtime?: string;
  language?: string;
  country?: string;
  awards?: string;
  website?: string;
  slug?: string;
  popularity?: number;
  popularityBySource?: Record<string, number>;
  imdbRating?: number;
  sourceRatings?: SourceRating[];
  cast?: PersonCredit[];
  directors?: PersonCredit[];
  writers?: PersonCredit[];
  videos?: VideoUnit[];
  defaultVideoID?: string;
  trailers?: StreamSource[];
  similarItems?: MediaSummary[];
  behaviorHints?: MediaBehaviorHints;
  [key: string]: unknown;
}

export interface ResponsePage {
  index: number;
  size?: number;
  total?: number;
  [key: string]: unknown;
}

export interface RedirectInstruction {
  url: string;
  status?: RedirectStatus;
  [key: string]: unknown;
}

export interface CatalogResponse {
  schemaVersion: SchemaVersion;
  items?: MediaSummary[];
  page?: ResponsePage;
  cache?: CachePolicy;
  redirect?: RedirectInstruction;
  experimental?: ExperimentalField[];
  [key: string]: unknown;
}

export interface MetaResponse {
  schemaVersion: SchemaVersion;
  item?: MediaDetail | null;
  cache?: CachePolicy;
  redirect?: RedirectInstruction;
  experimental?: ExperimentalField[];
  [key: string]: unknown;
}

export interface StreamsResponse {
  schemaVersion: SchemaVersion;
  streams?: StreamSource[];
  cache?: CachePolicy;
  redirect?: RedirectInstruction;
  experimental?: ExperimentalField[];
  [key: string]: unknown;
}

export interface SubtitlesResponse {
  schemaVersion: SchemaVersion;
  subtitles?: SubtitleTrack[];
  cache?: CachePolicy;
  redirect?: RedirectInstruction;
  experimental?: ExperimentalField[];
  [key: string]: unknown;
}

export interface PluginDistribution {
  transport: string;
  manifestURL: string;
  [key: string]: unknown;
}

export interface PluginCard {
  id: string;
  name: string;
  version: string;
  description?: string;
  manifestURL?: string;
  pluginKinds?: PluginKindRef[];
  distribution?: PluginDistribution;
  manifestSnapshot?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PluginCatalogResponse {
  schemaVersion: SchemaVersion;
  plugins?: PluginCard[];
  page?: ResponsePage;
  cache?: CachePolicy;
  redirect?: RedirectInstruction;
  experimental?: ExperimentalField[];
  [key: string]: unknown;
}

export interface ResourceRequestMap {
  catalog: CatalogRequest;
  meta: MetaRequest;
  stream: StreamRequest;
  subtitles: SubtitlesRequest;
  plugin_catalog: PluginCatalogRequest;
}

export interface ResourceResponseMap {
  catalog: CatalogResponse;
  meta: MetaResponse;
  stream: StreamsResponse;
  subtitles: SubtitlesResponse;
  plugin_catalog: PluginCatalogResponse;
}

export type HandlerKey =
  | "catalog"
  | "meta"
  | "stream"
  | "subtitles"
  | "pluginCatalog";

export interface ManifestIndex {
  readonly capabilityByKind: Readonly<
    Partial<Record<ResourceKind, Capability>>
  >;
  readonly catalogEndpointByID: ReadonlyMap<string, CatalogEndpoint>;
  readonly catalogFiltersByEndpointID: ReadonlyMap<
    string,
    readonly FilterSpec[]
  >;
  readonly catalogSortsByEndpointID: ReadonlyMap<string, readonly SortSpec[]>;
  readonly pluginCatalogEndpointByID: ReadonlyMap<
    string,
    PluginCatalogEndpoint
  >;
}
