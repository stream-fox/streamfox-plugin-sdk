import { ProtocolError } from "./errors";

export type SettingPrimitive = string | number | boolean | string[];
export type SettingFieldType =
  | "text"
  | "password"
  | "number"
  | "checkbox"
  | "select"
  | "multi_select"
  | "textarea";

export interface SettingFieldOption {
  label: string;
  value: string;
}

interface BaseSettingField<K extends string, T extends SettingFieldType> {
  key: K;
  type?: T;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  queryParam?: string;
}

export interface TextSettingField<K extends string = string> extends BaseSettingField<K, "text"> {
  defaultValue?: string;
}

export interface PasswordSettingField<K extends string = string> extends BaseSettingField<K, "password"> {
  defaultValue?: string;
}

export interface TextareaSettingField<K extends string = string> extends BaseSettingField<K, "textarea"> {
  defaultValue?: string;
}

export interface NumberSettingField<K extends string = string> extends BaseSettingField<K, "number"> {
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface CheckboxSettingField<K extends string = string> extends BaseSettingField<K, "checkbox"> {
  defaultValue?: boolean;
}

export interface SelectSettingField<K extends string = string> extends BaseSettingField<K, "select"> {
  options: SettingFieldOption[];
  defaultValue?: string;
}

export interface MultiSelectSettingField<K extends string = string> extends BaseSettingField<K, "multi_select"> {
  options: SettingFieldOption[];
  defaultValue?: string[];
  searchable?: boolean;
  maxSelected?: number;
}

export type SettingField<K extends string = string> =
  | TextSettingField<K>
  | PasswordSettingField<K>
  | TextareaSettingField<K>
  | NumberSettingField<K>
  | CheckboxSettingField<K>
  | SelectSettingField<K>
  | MultiSelectSettingField<K>;

export type AnySettingField = SettingField<string>;

type ValueForField<F extends AnySettingField> = F extends NumberSettingField
  ? number
  : F extends CheckboxSettingField
    ? boolean
    : F extends MultiSelectSettingField
      ? string[]
    : string;

export type InferSettings<TFields extends readonly AnySettingField[]> = {
  [Field in TFields[number] as Field["key"]]: ValueForField<Field>;
};

export interface InstallOptions<TFields extends readonly AnySettingField[] = readonly AnySettingField[]> {
  enabled?: boolean;
  title?: string;
  subtitle?: string;
  description?: string;
  installButtonText?: string;
  openManifestButtonText?: string;
  copyManifestButtonText?: string;
  fields?: TFields;
}

type TextLikeBuilderOptions = Omit<TextSettingField<string>, "key" | "type" | "label"> & { label?: string };
type PasswordBuilderOptions = Omit<PasswordSettingField<string>, "key" | "type" | "label"> & { label?: string };
type NumberBuilderOptions = Omit<NumberSettingField<string>, "key" | "type" | "label"> & { label?: string };
type CheckboxBuilderOptions = Omit<CheckboxSettingField<string>, "key" | "type" | "label"> & { label?: string };
type SelectBuilderOptions = Omit<SelectSettingField<string>, "key" | "type" | "label"> & { label?: string };
type MultiSelectBuilderOptions = Omit<MultiSelectSettingField<string>, "key" | "type" | "label"> & {
  label?: string;
};

function labelForKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function parseBoolean(input: string, key: string, traceId?: string): boolean {
  const normalized = input.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }

  throw ProtocolError.requestInvalid(
    `setting '${key}' expects a boolean value`,
    { key, value: input },
    traceId,
  );
}

function parseNumber(input: string, field: NumberSettingField, traceId?: string): number {
  const value = Number.parseFloat(input.trim());
  if (!Number.isFinite(value)) {
    throw ProtocolError.requestInvalid(
      `setting '${field.key}' expects a number`,
      { key: field.key, value: input },
      traceId,
    );
  }

  if (typeof field.min === "number" && value < field.min) {
    throw ProtocolError.requestInvalid(
      `setting '${field.key}' must be >= ${field.min}`,
      { key: field.key, value },
      traceId,
    );
  }

  if (typeof field.max === "number" && value > field.max) {
    throw ProtocolError.requestInvalid(
      `setting '${field.key}' must be <= ${field.max}`,
      { key: field.key, value },
      traceId,
    );
  }

  if (typeof field.step === "number" && field.step > 0) {
    const base = typeof field.min === "number" ? field.min : 0;
    const quotient = (value - base) / field.step;
    const nearestInteger = Math.round(quotient);
    if (Math.abs(quotient - nearestInteger) > 1e-9) {
      throw ProtocolError.requestInvalid(
        `setting '${field.key}' must align to step ${field.step}`,
        { key: field.key, value },
        traceId,
      );
    }
  }

  return value;
}

function normalizeSettingValue(
  field: AnySettingField,
  rawValue: string | null,
  traceId?: string,
): SettingPrimitive | undefined {
  if (rawValue === null || rawValue.length === 0) {
    return field.defaultValue as SettingPrimitive | undefined;
  }

  switch (field.type) {
    case "text":
    case "password":
    case "textarea":
      return rawValue;
    case "checkbox":
      return parseBoolean(rawValue, field.key, traceId);
    case "number":
      return parseNumber(rawValue, field, traceId);
    case "select": {
      const allowed = new Set(field.options.map((option) => option.value));
      if (!allowed.has(rawValue)) {
        throw ProtocolError.requestInvalid(
          `setting '${field.key}' has unsupported value '${rawValue}'`,
          { key: field.key, value: rawValue },
          traceId,
        );
      }
      return rawValue;
    }
    case "multi_select":
      return field.defaultValue as SettingPrimitive | undefined;
    default:
      return rawValue;
  }
}

function parseMultiSelectValues(
  field: MultiSelectSettingField,
  searchParams: URLSearchParams,
  queryKey: string,
  traceId?: string,
): string[] | undefined {
  const directValues = searchParams
    .getAll(queryKey)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const values = directValues.length > 0 ? directValues : (field.defaultValue ?? []);
  if (values.length === 0) {
    return undefined;
  }

  const allowed = new Set(field.options.map((option) => option.value));
  const deduped: string[] = [];

  for (const value of values) {
    if (!allowed.has(value)) {
      throw ProtocolError.requestInvalid(
        `setting '${field.key}' has unsupported value '${value}'`,
        { key: field.key, value },
        traceId,
      );
    }

    if (!deduped.includes(value)) {
      deduped.push(value);
    }
  }

  if (typeof field.maxSelected === "number" && deduped.length > field.maxSelected) {
    throw ProtocolError.requestInvalid(
      `setting '${field.key}' supports at most ${field.maxSelected} values`,
      { key: field.key, count: deduped.length },
      traceId,
    );
  }

  return deduped;
}

export function parseInstallSettings<TFields extends readonly AnySettingField[]>(
  fields: TFields | undefined,
  searchParams: URLSearchParams,
  traceId?: string,
): Partial<InferSettings<TFields>> {
  const normalizedFields = fields ?? ([] as unknown as TFields);
  const result: Record<string, SettingPrimitive> = {};

  for (const field of normalizedFields) {
    const queryKey = field.queryParam ?? field.key;
    if (field.type === "multi_select") {
      const value = parseMultiSelectValues(field, searchParams, queryKey, traceId);

      if (!value || value.length === 0) {
        if (field.required) {
          throw ProtocolError.requestInvalid(
            `missing required setting '${field.key}'`,
            { key: field.key, queryParam: queryKey },
            traceId,
          );
        }
        continue;
      }

      result[field.key] = value;
      continue;
    }

    const rawValue = searchParams.get(queryKey);
    const value = normalizeSettingValue(field, rawValue, traceId);

    if (value === undefined || value === "") {
      if (field.required) {
        throw ProtocolError.requestInvalid(
          `missing required setting '${field.key}'`,
          { key: field.key, queryParam: queryKey },
          traceId,
        );
      }
      continue;
    }

    result[field.key] = value;
  }

  return result as Partial<InferSettings<TFields>>;
}

export function text<K extends string>(key: K, options: TextLikeBuilderOptions = {}): TextSettingField<K> {
  return {
    key,
    type: "text",
    label: options.label ?? labelForKey(key),
    ...options,
  };
}

export function password<K extends string>(key: K, options: PasswordBuilderOptions = {}): PasswordSettingField<K> {
  return {
    key,
    type: "password",
    label: options.label ?? labelForKey(key),
    ...options,
  };
}

export function number<K extends string>(key: K, options: NumberBuilderOptions = {}): NumberSettingField<K> {
  return {
    key,
    type: "number",
    label: options.label ?? labelForKey(key),
    ...options,
  };
}

export function checkbox<K extends string>(key: K, options: CheckboxBuilderOptions = {}): CheckboxSettingField<K> {
  return {
    key,
    type: "checkbox",
    label: options.label ?? labelForKey(key),
    ...options,
  };
}

export function select<K extends string>(key: K, options: SelectBuilderOptions): SelectSettingField<K> {
  return {
    key,
    type: "select",
    label: options.label ?? labelForKey(key),
    ...options,
  };
}

export function multiSelect<K extends string>(key: K, options: MultiSelectBuilderOptions): MultiSelectSettingField<K> {
  return {
    key,
    type: "multi_select",
    label: options.label ?? labelForKey(key),
    searchable: options.searchable ?? true,
    ...options,
  };
}

export function textarea<K extends string>(key: K, options: TextLikeBuilderOptions = {}): TextareaSettingField<K> {
  return {
    key,
    type: "textarea",
    label: options.label ?? labelForKey(key),
    ...options,
  };
}

export const settings = {
  text,
  password,
  number,
  checkbox,
  select,
  multiSelect,
  textarea,
} as const;
