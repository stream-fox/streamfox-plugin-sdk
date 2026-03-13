import { ProtocolError } from "./errors";

export interface JsonParseLimits {
  maxPayloadBytes?: number;
  maxDepth?: number;
  traceId?: string;
}

const DEFAULT_MAX_PAYLOAD_BYTES = 1_048_576;
const DEFAULT_MAX_DEPTH = 64;

export function maximumJsonNestingDepth(payload: string): number {
  let maxDepth = 0;
  let currentDepth = 0;
  let insideString = false;
  let escaped = false;

  for (let i = 0; i < payload.length; i += 1) {
    const code = payload.charCodeAt(i);

    if (insideString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (code === 0x5c) {
        escaped = true;
      } else if (code === 0x22) {
        insideString = false;
      }
      continue;
    }

    switch (code) {
      case 0x22:
        insideString = true;
        break;
      case 0x7b:
      case 0x5b:
        currentDepth += 1;
        if (currentDepth > maxDepth) {
          maxDepth = currentDepth;
        }
        break;
      case 0x7d:
      case 0x5d:
        currentDepth -= 1;
        if (currentDepth < 0) {
          throw ProtocolError.invalidJson("Malformed JSON payload");
        }
        break;
      default:
        break;
    }
  }

  if (insideString || currentDepth !== 0) {
    throw ProtocolError.invalidJson("Malformed JSON payload");
  }

  return maxDepth;
}

export function parseJsonWithLimits<T>(
  input: string | Uint8Array,
  limits: JsonParseLimits = {},
): T {
  const maxPayloadBytes = limits.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  const maxDepth = limits.maxDepth ?? DEFAULT_MAX_DEPTH;

  if (maxPayloadBytes <= 0) {
    throw ProtocolError.invalidJson(
      "maxPayloadBytes must be greater than 0",
      limits.traceId,
    );
  }
  if (maxDepth <= 0) {
    throw ProtocolError.invalidJson(
      "maxDepth must be greater than 0",
      limits.traceId,
    );
  }

  const text =
    typeof input === "string" ? input : Buffer.from(input).toString("utf8");
  const byteLength = Buffer.byteLength(text, "utf8");

  if (byteLength > maxPayloadBytes) {
    throw ProtocolError.payloadTooLarge(maxPayloadBytes, limits.traceId);
  }

  const depth = maximumJsonNestingDepth(text);
  if (depth > maxDepth) {
    throw ProtocolError.payloadTooDeep(maxDepth, limits.traceId);
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    throw ProtocolError.invalidJson(message, limits.traceId);
  }
}
