import type { SortDirection, SortSpec } from "./types";

interface SortBuilderOptions {
  label?: string;
  description?: string;
  group?: string;
  aliases?: string[];
  directions?: SortDirection[];
  defaultDirection?: SortDirection;
}

function labelForKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function buildSortSpec(
  key: string,
  options: SortBuilderOptions = {},
): SortSpec {
  return {
    key,
    label: options.label ?? labelForKey(key),
    ...(options.description !== undefined
      ? { description: options.description }
      : {}),
    ...(options.group !== undefined ? { group: options.group } : {}),
    ...(options.aliases !== undefined ? { aliases: options.aliases } : {}),
    directions: options.directions ?? ["descending"],
    ...(options.defaultDirection !== undefined
      ? { defaultDirection: options.defaultDirection }
      : {}),
  };
}

export const sorts = {
  choice(key: string, options: SortBuilderOptions = {}): SortSpec {
    return buildSortSpec(key, options);
  },
  asc(
    key: string,
    options: Omit<SortBuilderOptions, "directions" | "defaultDirection"> = {},
  ): SortSpec {
    return buildSortSpec(key, {
      ...options,
      directions: ["ascending"],
      defaultDirection: "ascending",
    });
  },
  desc(
    key: string,
    options: Omit<SortBuilderOptions, "directions" | "defaultDirection"> = {},
  ): SortSpec {
    return buildSortSpec(key, {
      ...options,
      directions: ["descending"],
      defaultDirection: "descending",
    });
  },
};
