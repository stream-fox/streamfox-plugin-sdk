import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type InstallerFieldType = 'text' | 'password' | 'number' | 'checkbox' | 'select' | 'multi_select' | 'textarea';
type FormValue = string | boolean | string[];
type ThemePreference = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'streamfox.installer.theme';

interface InstallerFieldOption {
  label: string;
  value: string;
}

interface InstallerField {
  key: string;
  label: string;
  type?: InstallerFieldType;
  description?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string | number | boolean | string[];
  min?: number;
  max?: number;
  step?: number;
  options?: InstallerFieldOption[];
  searchable?: boolean;
  maxSelected?: number;
  queryParam?: string;
}

interface Manifest {
  plugin: {
    id: string;
    name: string;
    version: string;
    description?: string;
    logo?: string;
    homepage?: string;
    author?: {
      name: string;
      website?: string;
    };
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
  installer: {
    enabled: boolean;
    title: string;
    subtitle: string;
    description: string;
    logo?: string;
    installButtonText: string;
    openManifestButtonText: string;
    copyManifestButtonText: string;
    fields: InstallerField[];
  };
}

function makeBaseUrl(): URL {
  const pathname = window.location.pathname.endsWith('/') ? window.location.pathname : `${window.location.pathname}/`;
  return new URL(pathname, window.location.origin);
}

function readStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system';
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function toCheckboxValue(rawValue: string | null, defaultValue: boolean): boolean {
  if (rawValue === null) {
    return defaultValue;
  }

  const normalized = rawValue.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function asString(value: InstallerField['defaultValue']): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return '';
}

function normalizeMultiValues(value: FormValue): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function buildInitialValues(fields: InstallerField[]): Record<string, FormValue> {
  const params = new URLSearchParams(window.location.search);
  const values: Record<string, FormValue> = {};

  for (const field of fields) {
    const queryKey = field.queryParam ?? field.key;
    const rawValue = params.get(queryKey);
    const fieldType = field.type ?? 'text';

    if (fieldType === 'checkbox') {
      values[field.key] = toCheckboxValue(rawValue, field.defaultValue === true);
      continue;
    }

    if (fieldType === 'multi_select') {
      const selected = params
        .getAll(queryKey)
        .flatMap((entry) => entry.split(','))
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

      if (selected.length > 0) {
        values[field.key] = selected;
      } else if (Array.isArray(field.defaultValue)) {
        values[field.key] = field.defaultValue.filter((entry): entry is string => typeof entry === 'string');
      } else {
        values[field.key] = [];
      }
      continue;
    }

    values[field.key] = rawValue ?? asString(field.defaultValue);
  }

  return values;
}

function buildQuery(fields: InstallerField[], values: Record<string, FormValue>): URLSearchParams {
  const params = new URLSearchParams();

  for (const field of fields) {
    const queryKey = field.queryParam ?? field.key;
    const fieldType = field.type ?? 'text';
    const value = values[field.key];

    if (fieldType === 'checkbox') {
      if (value === true) {
        params.set(queryKey, '1');
      }
      continue;
    }

    if (fieldType === 'multi_select') {
      for (const selected of normalizeMultiValues(value)) {
        const trimmed = selected.trim();
        if (trimmed.length > 0) {
          params.append(queryKey, trimmed);
        }
      }
      continue;
    }

    const stringValue = typeof value === 'string' ? value.trim() : '';
    if (stringValue.length > 0) {
      params.set(queryKey, stringValue);
    }
  }

  return params;
}

function MultiSelectDropdown({
  field,
  value,
  onChange,
}: {
  field: InstallerField;
  value: FormValue;
  onChange: (next: FormValue) => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const selected = useMemo(() => normalizeMultiValues(value), [value]);
  const options = field.options ?? [];
  const queryText = query.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      options.filter((option) => {
        if (queryText.length === 0) {
          return true;
        }

        return option.label.toLowerCase().includes(queryText) || option.value.toLowerCase().includes(queryText);
      }),
    [options, queryText],
  );

  const toggleValue = (nextValue: string): void => {
    const current = new Set(selected);
    if (current.has(nextValue)) {
      current.delete(nextValue);
    } else {
      if (typeof field.maxSelected === 'number' && selected.length >= field.maxSelected) {
        return;
      }
      current.add(nextValue);
    }

    onChange(Array.from(current));
  };

  const preview =
    selected.length === 0 ? 'Select options' : selected.length <= 3 ? selected.join(', ') : `${selected.length} selected`;

  return (
    <details className="rounded-xl border bg-card p-3">
      <summary className="cursor-pointer list-none text-sm font-medium text-foreground">{preview}</summary>
      <div className="mt-3 space-y-3">
        {field.searchable !== false ? (
          <Input value={query} placeholder="Search options..." onChange={(event) => setQuery(event.target.value)} />
        ) : null}

        <div className="max-h-52 space-y-1 overflow-auto rounded-xl border border-border/80 bg-muted/35 p-2">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">No options match your search.</p>
          ) : (
            filtered.map((option) => {
              const checked = selected.includes(option.value);
              return (
                <label key={option.value} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleValue(option.value)}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                  <span>{option.label}</span>
                </label>
              );
            })
          )}
        </div>

        {selected.length > 0 ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => onChange([])}>
            Clear selection
          </Button>
        ) : null}
      </div>
    </details>
  );
}

function renderField(field: InstallerField, value: FormValue, onChange: (next: FormValue) => void): JSX.Element {
  const fieldType = field.type ?? 'text';

  if (fieldType === 'checkbox') {
    return (
      <label className="flex items-center gap-3 rounded-xl border bg-muted/50 px-4 py-3">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 accent-[hsl(var(--primary))]"
        />
        <span className="text-sm font-medium">{field.label}</span>
      </label>
    );
  }

  if (fieldType === 'textarea') {
    return (
      <Textarea
        className="min-h-[108px]"
        value={typeof value === 'string' ? value : ''}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (fieldType === 'select') {
    return (
      <Select value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select option</option>
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    );
  }

  if (fieldType === 'multi_select') {
    return <MultiSelectDropdown field={field} value={value} onChange={onChange} />;
  }

  return (
    <Input
      type={fieldType === 'number' ? 'number' : fieldType === 'password' ? 'password' : 'text'}
      value={typeof value === 'string' ? value : ''}
      placeholder={field.placeholder}
      min={field.min}
      max={field.max}
      step={field.step}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function App(): JSX.Element {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [config, setConfig] = useState<StudioConfig | null>(null);
  const [values, setValues] = useState<Record<string, FormValue>>({});
  const [errorText, setErrorText] = useState<string | null>(null);
  const [themePreference, setThemePreference] = useState<ThemePreference>(readStoredTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  const baseUrl = useMemo(makeBaseUrl, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = (event?: MediaQueryListEvent): void => {
      setSystemTheme(event?.matches ?? media.matches ? 'dark' : 'light');
    };

    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    const resolved = themePreference === 'system' ? systemTheme : themePreference;
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [systemTheme, themePreference]);

  useEffect(() => {
    void (async () => {
      try {
        const configResponse = await fetch(new URL('studio-config', baseUrl));
        if (!configResponse.ok) {
          throw new Error(`Failed to load installer config (${configResponse.status})`);
        }

        const loadedConfig = (await configResponse.json()) as StudioConfig;
        setConfig(loadedConfig);

        const manifestResponse = await fetch(loadedConfig.manifestPath);
        if (!manifestResponse.ok) {
          throw new Error(`Failed to load manifest (${manifestResponse.status})`);
        }

        const loadedManifest = (await manifestResponse.json()) as Manifest;
        setManifest(loadedManifest);

        setValues(buildInitialValues(loadedConfig.installer?.fields ?? []));
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : 'Failed to load installer config');
      }
    })();
  }, [baseUrl]);

  const fields = config?.installer?.fields ?? [];
  const activeTheme = themePreference === 'system' ? systemTheme : themePreference;
  const installerTitle = config?.installer.title ?? manifest?.plugin.name ?? 'Plugin Installer';
  const installerDescription =
    config?.installer.description ?? manifest?.plugin.description ?? 'Configure this plugin before installation.';
  const installerSubtitle = config?.installer.subtitle ?? '';
  const pluginVersion = manifest?.plugin.version ?? config?.installer.subtitle ?? '1.0.0';
  const brandingLogo = config?.installer.logo ?? manifest?.plugin.logo ?? null;
  const pluginSummaryText = manifest?.plugin.description ?? installerDescription;

  const configuredManifestUrl = useMemo(() => {
    const manifestPath = config?.deeplink.manifestPath ?? config?.manifestPath ?? '/manifest';
    const target = new URL(manifestPath, window.location.origin);
    const query = buildQuery(fields, values);

    if ([...query.keys()].length > 0) {
      target.search = query.toString();
    }

    return target;
  }, [config, fields, values]);

  const installHref = useMemo(() => {
    if (config?.deeplink.enabled === false || config?.installer?.enabled === false) {
      return null;
    }

    const scheme = config?.deeplink.scheme ?? 'streamfox';
    return `${scheme}://${window.location.host}${configuredManifestUrl.pathname}${configuredManifestUrl.search}`;
  }, [config, configuredManifestUrl]);

  const capabilityKinds = useMemo(
    () => (manifest?.capabilities ?? []).map((capability) => capability.kind.replace('_', ' ')),
    [manifest],
  );

  const onFieldChange = (key: string, nextValue: FormValue): void => {
    setValues((previous) => ({
      ...previous,
      [key]: nextValue,
    }));
  };

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">StreamFox Installer</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{installerTitle}</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{installerDescription}</p>
          </div>

          <div className="inline-flex rounded-full border bg-muted/40 p-1">
              {(['system', 'light', 'dark'] as const).map((option) => {
                const selected = themePreference === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setThemePreference(option)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                      selected ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <Card className="overflow-hidden shadow-sm">
            <CardHeader className="space-y-5 border-b pb-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-background">
                      {brandingLogo ? (
                        <img src={brandingLogo} alt={`${manifest?.plugin.name ?? installerTitle} logo`} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-2xl font-semibold text-primary">SF</span>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-2xl">{manifest?.plugin.name ?? installerTitle}</CardTitle>
                        <Badge>v{pluginVersion}</Badge>
                      </div>

                      {installerSubtitle && installerSubtitle !== pluginVersion ? (
                        <p className="text-sm font-medium text-muted-foreground">{installerSubtitle}</p>
                      ) : null}

                      <CardDescription className="max-w-[26rem] truncate text-sm" title={pluginSummaryText}>
                        {pluginSummaryText}
                      </CardDescription>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {installHref ? (
                      <a href={installHref}>
                        <Button variant="default" size="sm">{config?.installer.installButtonText ?? 'Install Plugin'}</Button>
                      </a>
                    ) : null}
                    <a href={configuredManifestUrl.toString()} target="_blank" rel="noreferrer">
                      <Button variant="secondary" size="sm">{config?.installer.openManifestButtonText ?? 'Open Manifest'}</Button>
                    </a>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {capabilityKinds.map((kind) => (
                    <Badge key={kind}>{kind}</Badge>
                  ))}
                </div>

                {errorText ? (
                  <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
                    {errorText}
                  </div>
                ) : null}
              </CardHeader>

              <CardContent className="space-y-5 pt-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Configuration</h2>
                    <p className="text-sm text-muted-foreground">
                      {fields.length === 0 ? 'This plugin installs without extra configuration.' : 'Adjust the settings that should be encoded into the manifest URL.'}
                    </p>
                  </div>
                  <Badge>{fields.length} field{fields.length === 1 ? '' : 's'}</Badge>
                </div>

                {fields.length === 0 ? (
                  <div className="rounded-xl border bg-muted/35 px-4 py-4 text-sm text-muted-foreground">
                    No configuration fields are required for this plugin.
                  </div>
                ) : (
                  fields.map((field) => (
                    <div key={field.key} className="space-y-2.5">
                      {field.type !== 'checkbox' ? (
                        <label className="text-sm font-medium">
                          {field.label}
                          {field.required ? <span className="text-primary"> *</span> : null}
                        </label>
                      ) : null}

                      {renderField(field, values[field.key] ?? '', (nextValue) => onFieldChange(field.key, nextValue))}

                      {field.description ? <p className="text-xs leading-5 text-muted-foreground">{field.description}</p> : null}
                    </div>
                  ))
                )}
              </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="overflow-hidden shadow-sm">
                <CardHeader className="space-y-5">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Plugin Summary</p>
                    <CardTitle className="text-xl">Installation snapshot</CardTitle>
                    <CardDescription>
                      Branded summary for what the client will install, with raw links available only when needed.
                    </CardDescription>
                  </div>
                </CardHeader>

                <CardContent className="space-y-5">
                  <div className="rounded-xl border bg-background p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-card">
                        {brandingLogo ? (
                          <img src={brandingLogo} alt={`${manifest?.plugin.name ?? installerTitle} logo`} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xl font-semibold text-primary">SF</span>
                        )}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-lg font-semibold">{manifest?.plugin.name ?? installerTitle}</p>
                        <p className="truncate text-sm text-muted-foreground">{manifest?.plugin.id ?? 'Loading plugin id...'}</p>
                        <p className="text-sm text-muted-foreground">Version {pluginVersion}</p>
                      </div>
                    </div>
                  </div>

                  <dl className="space-y-3 rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-sm text-muted-foreground">Theme</dt>
                      <dd className="text-right text-sm font-medium capitalize">{themePreference === 'system' ? `system (${systemTheme})` : activeTheme}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-sm text-muted-foreground">Deeplink</dt>
                      <dd className="text-right text-sm font-medium">{installHref ? config?.deeplink.scheme ?? 'streamfox' : 'disabled'}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-sm text-muted-foreground">Capabilities</dt>
                      <dd className="text-right text-sm font-medium">{capabilityKinds.length > 0 ? capabilityKinds.join(', ') : 'Loading...'}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-sm text-muted-foreground">Settings</dt>
                      <dd className="text-right text-sm font-medium">{fields.length === 0 ? 'none' : `${fields.length} configurable`}</dd>
                    </div>
                    {manifest?.plugin.author?.name ? (
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-sm text-muted-foreground">Author</dt>
                        <dd className="text-right text-sm font-medium">{manifest.plugin.author.name}</dd>
                      </div>
                    ) : null}
                    {manifest?.plugin.homepage ? (
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-sm text-muted-foreground">Homepage</dt>
                        <dd className="text-right text-sm font-medium">
                          <a href={manifest.plugin.homepage} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                            Open
                          </a>
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  <details className="group rounded-xl border bg-card p-4">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
                      Advanced install details
                    </summary>
                    <div className="mt-4 space-y-4">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Manifest URL</p>
                        <Textarea readOnly className="min-h-[104px] font-mono text-xs" value={configuredManifestUrl.toString()} />
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Deep Link</p>
                        <Textarea readOnly className="min-h-[104px] font-mono text-xs" value={installHref ?? 'Deeplink is disabled'} />
                      </div>
                    </div>
                  </details>
                </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
