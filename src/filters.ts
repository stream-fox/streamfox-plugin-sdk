import type {
  FilterControl,
  FilterDefaultValue,
  FilterOption,
  FilterSpec,
} from "./types";

interface BaseFilterBuilderOptions<TDefaultValue> {
  isRequired?: boolean;
  label?: string;
  description?: string;
  placeholder?: string;
  group?: string;
  defaultValue?: TDefaultValue;
}

type TextFilterBuilderOptions = BaseFilterBuilderOptions<string>;
type SelectFilterBuilderOptions = BaseFilterBuilderOptions<string> & {
  options: FilterOption[];
};
type MultiSelectFilterBuilderOptions = BaseFilterBuilderOptions<string[]> & {
  options: FilterOption[];
};
type NumberFilterBuilderOptions = BaseFilterBuilderOptions<number>;
type RangeFilterBuilderOptions = BaseFilterBuilderOptions<FilterDefaultValue>;
type IntOrRangeFilterBuilderOptions = BaseFilterBuilderOptions<
  number | FilterDefaultValue
>;
type ToggleFilterBuilderOptions = BaseFilterBuilderOptions<boolean>;

function labelForKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function buildFilterSpec(
  key: string,
  valueType: FilterSpec["valueType"],
  control: FilterControl,
  options: BaseFilterBuilderOptions<FilterDefaultValue> & {
    options?: FilterOption[];
  },
): FilterSpec {
  return {
    key,
    valueType,
    control,
    label: options.label ?? labelForKey(key),
    ...(options.description !== undefined
      ? { description: options.description }
      : {}),
    ...(options.placeholder !== undefined
      ? { placeholder: options.placeholder }
      : {}),
    ...(options.group !== undefined ? { group: options.group } : {}),
    ...(options.isRequired !== undefined
      ? { isRequired: options.isRequired }
      : {}),
    ...(options.defaultValue !== undefined
      ? { defaultValue: options.defaultValue }
      : {}),
    ...(options.options !== undefined ? { options: options.options } : {}),
  };
}

export const filters = {
  text(key: string, options: TextFilterBuilderOptions = {}): FilterSpec {
    return buildFilterSpec(key, "string", "text", options);
  },
  select(key: string, options: SelectFilterBuilderOptions): FilterSpec {
    return buildFilterSpec(key, "string", "select", options);
  },
  multiSelect(
    key: string,
    options: MultiSelectFilterBuilderOptions,
  ): FilterSpec {
    return buildFilterSpec(key, "stringList", "multi_select", options);
  },
  number(key: string, options: NumberFilterBuilderOptions = {}): FilterSpec {
    return buildFilterSpec(key, "int", "number", options);
  },
  range(key: string, options: RangeFilterBuilderOptions = {}): FilterSpec {
    return buildFilterSpec(key, "intRange", "range", options);
  },
  intOrRange(
    key: string,
    options: IntOrRangeFilterBuilderOptions = {},
  ): FilterSpec {
    return buildFilterSpec(key, "intOrRange", "range", options);
  },
  toggle(key: string, options: ToggleFilterBuilderOptions = {}): FilterSpec {
    return buildFilterSpec(key, "bool", "toggle", options);
  },
};
