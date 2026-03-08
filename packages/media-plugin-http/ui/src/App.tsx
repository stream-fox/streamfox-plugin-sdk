import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type ResourceKey = 'catalog' | 'meta' | 'stream' | 'subtitles' | 'plugin_catalog';

const SAMPLE_REQUESTS: Record<ResourceKey, string> = {
  catalog: JSON.stringify(
    {
      schemaVersion: { major: 2, minor: 0 },
      catalogID: 'top',
      mediaType: 'movie',
      filters: [],
    },
    null,
    2,
  ),
  meta: JSON.stringify(
    {
      schemaVersion: { major: 2, minor: 0 },
      mediaType: 'movie',
      itemID: 'tt1254207',
    },
    null,
    2,
  ),
  stream: JSON.stringify(
    {
      schemaVersion: { major: 2, minor: 0 },
      mediaType: 'movie',
      itemID: 'tt1254207',
    },
    null,
    2,
  ),
  subtitles: JSON.stringify(
    {
      schemaVersion: { major: 2, minor: 0 },
      mediaType: 'movie',
      itemID: 'tt1254207',
      languagePreferences: ['en'],
    },
    null,
    2,
  ),
  plugin_catalog: JSON.stringify(
    {
      schemaVersion: { major: 2, minor: 0 },
      catalogID: 'featured',
      pluginKind: 'catalog',
    },
    null,
    2,
  ),
};

interface Manifest {
  plugin: {
    id: string;
    name: string;
    version: string;
    description?: string;
  };
  capabilities: Array<{ kind: string }>;
}

interface StudioConfig {
  manifestPath: string;
  deeplink: {
    enabled: boolean;
    scheme: string;
    manifestPath: string;
  };
}

function makeBaseUrl(): URL {
  const pathname = window.location.pathname.endsWith('/') ? window.location.pathname : `${window.location.pathname}/`;
  return new URL(pathname, window.location.origin);
}

export function App(): JSX.Element {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [config, setConfig] = useState<StudioConfig | null>(null);
  const [resource, setResource] = useState<ResourceKey>('meta');
  const [requestBody, setRequestBody] = useState(SAMPLE_REQUESTS.meta);
  const [traceId, setTraceId] = useState('');
  const [responseText, setResponseText] = useState('Waiting for request...');
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const baseUrl = useMemo(makeBaseUrl, []);

  useEffect(() => {
    void (async () => {
      try {
        const configResponse = await fetch(new URL('studio-config.json', baseUrl));
        const loadedConfig = (await configResponse.json()) as StudioConfig;
        setConfig(loadedConfig);

        const manifestResponse = await fetch(loadedConfig.manifestPath);
        const data = (await manifestResponse.json()) as Manifest;
        setManifest(data);
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : 'Failed to load manifest');
      }
    })();
  }, [baseUrl]);

  const resources = useMemo(() => {
    const fromManifest = manifest?.capabilities?.map((capability) => capability.kind as ResourceKey) ?? [];
    return fromManifest.length > 0 ? fromManifest : (['catalog', 'meta', 'stream', 'subtitles', 'plugin_catalog'] as ResourceKey[]);
  }, [manifest]);

  useEffect(() => {
    if (resource in SAMPLE_REQUESTS) {
      setRequestBody(SAMPLE_REQUESTS[resource]);
    }
  }, [resource]);

  const manifestPath = useMemo(() => {
    const target = config?.deeplink.manifestPath ?? config?.manifestPath ?? new URL('manifest.json', baseUrl).pathname;
    return target.startsWith('/') ? target : `/${target}`;
  }, [baseUrl, config]);

  const installHref = useMemo(() => {
    if (config?.deeplink.enabled === false) {
      return null;
    }

    const scheme = config?.deeplink.scheme ?? 'stremio';
    return `${scheme}://${window.location.host}${manifestPath}`;
  }, [config, manifestPath]);

  const sendRequest = async (): Promise<void> => {
    try {
      setErrorText(null);
      const parsed = JSON.parse(requestBody) as unknown;

      const response = await fetch(new URL(resource, baseUrl), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(traceId ? { 'x-trace-id': traceId } : {}),
        },
        body: JSON.stringify(parsed),
      });

      const body = await response.json();
      setResponseStatus(response.status);
      setResponseText(JSON.stringify(body, null, 2));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Failed to send request');
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f5fbfc] via-[#eef7f8] to-[#e9f0ec] px-4 py-8 text-foreground sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card className="shadow-glow">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{manifest?.plugin.name ?? 'Plugin Studio'}</CardTitle>
              <Badge>v{manifest?.plugin.version ?? '0.0.0'}</Badge>
            </div>
            <CardDescription>
              {manifest?.plugin.description ?? 'Elegant request playground for your media plugin.'}
            </CardDescription>
            <div className="flex flex-wrap gap-2 pt-2">
              {(manifest?.capabilities ?? []).map((capability) => (
                <Badge key={capability.kind}>{capability.kind}</Badge>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              {installHref ? (
                <a href={installHref}>
                  <Button variant="default" size="sm">Install Addon</Button>
                </a>
              ) : null}
              <a href={manifestPath} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="sm">Open Manifest</Button>
              </a>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Resource</label>
              <Select value={resource} onChange={(event) => setResource(event.target.value as ResourceKey)}>
                {resources.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Trace ID (optional)</label>
              <Input value={traceId} onChange={(event) => setTraceId(event.target.value)} placeholder="trace-123" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Request JSON</label>
              <Textarea
                className="min-h-[280px] font-mono text-xs"
                value={requestBody}
                onChange={(event) => setRequestBody(event.target.value)}
              />
            </div>

            <Button onClick={() => void sendRequest()} className="w-full">
              Send {resource} request
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-glow">
          <CardHeader>
            <CardTitle>Response</CardTitle>
            <CardDescription>Typed response preview with status and protocol errors.</CardDescription>
            {responseStatus !== null ? <Badge>Status: {responseStatus}</Badge> : null}
          </CardHeader>
          <CardContent>
            {errorText ? (
              <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{errorText}</div>
            ) : null}
            <pre className="max-h-[560px] overflow-auto rounded-md border border-border bg-[#0d1f24] p-4 text-xs text-[#bde7f2]">
              {responseText}
            </pre>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
