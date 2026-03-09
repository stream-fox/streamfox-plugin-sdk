import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type InstallerFieldType = 'text' | 'password' | 'number' | 'checkbox' | 'select' | 'multi_select' | 'textarea';
type FormValue = string | boolean | string[];

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

        return (
          option.label.toLowerCase().includes(queryText) ||
          option.value.toLowerCase().includes(queryText)
        );
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
    selected.length === 0
      ? 'Select options'
      : selected.length <= 3
        ? selected.join(', ')
        : `${selected.length} selected`;

  return (
    <details className="rounded-xl border border-border bg-card p-3">
      <summary className="cursor-pointer list-none text-sm font-medium text-foreground">{preview}</summary>
      <div className="mt-3 space-y-3">
        {field.searchable !== false ? (
          <Input
            value={query}
            placeholder="Search options..."
            onChange={(event) => setQuery(event.target.value)}
          />
        ) : null}

        <div className="max-h-52 space-y-1 overflow-auto rounded-lg border border-border bg-muted/30 p-2">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">No options match your search.</p>
          ) : (
            filtered.map((option) => {
              const checked = selected.includes(option.value);
              return (
                <label key={option.value} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/60">
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

function renderField(
  field: InstallerField,
  value: FormValue,
  onChange: (next: FormValue) => void,
): JSX.Element {
  const fieldType = field.type ?? 'text';

  if (fieldType === 'checkbox') {
    return (
      <label className="flex items-center gap-3 rounded-xl border border-border bg-muted/45 px-3 py-3">
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
        className="min-h-[96px]"
        value={typeof value === 'string' ? value : ''}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (fieldType === 'select') {
    return (
      <Select
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      >
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
  const [copyState, setCopyState] = useState<string | null>(null);

  const baseUrl = useMemo(makeBaseUrl, []);

  useEffect(() => {
    void (async () => {
      try {
        const configResponse = await fetch(new URL('studio-config', baseUrl));
        const loadedConfig = (await configResponse.json()) as StudioConfig;
        setConfig(loadedConfig);

        const manifestResponse = await fetch(loadedConfig.manifestPath);
        const loadedManifest = (await manifestResponse.json()) as Manifest;
        setManifest(loadedManifest);

        setValues(buildInitialValues(loadedConfig.installer?.fields ?? []));
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : 'Failed to load installer config');
      }
    })();
  }, [baseUrl]);

  const fields = config?.installer?.fields ?? [];

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

    const scheme = config?.deeplink.scheme ?? 'stremio';
    return `${scheme}://${window.location.host}${configuredManifestUrl.pathname}${configuredManifestUrl.search}`;
  }, [config, configuredManifestUrl]);

  const onFieldChange = (key: string, nextValue: FormValue): void => {
    setValues((previous) => ({
      ...previous,
      [key]: nextValue,
    }));
  };

  const copyManifest = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(configuredManifestUrl.toString());
      setCopyState('Manifest URL copied');
      window.setTimeout(() => setCopyState(null), 2000);
    } catch {
      setCopyState('Copy failed');
      window.setTimeout(() => setCopyState(null), 2000);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f4fbfc] via-[#e9f6f8] to-[#e4efee] px-4 py-8 text-foreground sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.15fr_1fr]">
        <Card className="shadow-glow">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{config?.installer.title ?? manifest?.plugin.name ?? 'Plugin Installer'}</CardTitle>
              <Badge>v{manifest?.plugin.version ?? config?.installer.subtitle ?? '1.0.0'}</Badge>
            </div>
            <CardDescription>
              {config?.installer.description ?? manifest?.plugin.description ?? 'Configure this add-on before installation.'}
            </CardDescription>
            <div className="flex flex-wrap gap-2 pt-2">
              {(manifest?.capabilities ?? []).map((capability) => (
                <Badge key={capability.kind}>{capability.kind}</Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {installHref ? (
                <a href={installHref}>
                  <Button variant="default" size="sm">{config?.installer.installButtonText ?? 'Install Addon'}</Button>
                </a>
              ) : null}
              <a href={configuredManifestUrl.toString()} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="sm">{config?.installer.openManifestButtonText ?? 'Open Manifest'}</Button>
              </a>
              <Button variant="secondary" size="sm" onClick={() => void copyManifest()}>
                {config?.installer.copyManifestButtonText ?? 'Copy Manifest URL'}
              </Button>
            </div>
            {copyState ? <p className="pt-1 text-xs text-muted-foreground">{copyState}</p> : null}
          </CardHeader>

          <CardContent className="space-y-4">
            {fields.length === 0 ? (
              <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                No configuration fields are required for this add-on.
              </div>
            ) : (
              fields.map((field) => (
                <div key={field.key} className="space-y-2">
                  {field.type !== 'checkbox' ? (
                    <label className="text-sm font-medium">
                      {field.label}
                      {field.required ? <span className="text-[#0f7a8b]"> *</span> : null}
                    </label>
                  ) : null}

                  {renderField(field, values[field.key] ?? '', (nextValue) => onFieldChange(field.key, nextValue))}

                  {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="shadow-glow">
          <CardHeader>
            <CardTitle>Install Preview</CardTitle>
            <CardDescription>The generated URL below is what your app will install and call.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Manifest URL</p>
              <Textarea readOnly className="min-h-[132px] font-mono text-xs" value={configuredManifestUrl.toString()} />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Deep Link</p>
              <Textarea readOnly className="min-h-[132px] font-mono text-xs" value={installHref ?? 'Deeplink is disabled'} />
            </div>

            {errorText ? (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{errorText}</div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
