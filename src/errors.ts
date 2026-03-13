export type ProtocolErrorCode =
  | "MANIFEST_INVALID"
  | "REQUEST_INVALID"
  | "RESPONSE_INVALID"
  | "NO_HANDLER"
  | "INVALID_JSON"
  | "PAYLOAD_TOO_LARGE"
  | "PAYLOAD_TOO_DEEP"
  | "INTERNAL_ERROR";

export interface ProtocolErrorPayload {
  code: ProtocolErrorCode;
  message: string;
  details: unknown | undefined;
  traceId: string | undefined;
}

export class ProtocolError extends Error {
  public readonly code: ProtocolErrorCode;
  public readonly status: number;
  public readonly details: unknown | undefined;
  public readonly traceId: string | undefined;

  constructor(payload: ProtocolErrorPayload, status: number) {
    super(payload.message);
    this.name = "ProtocolError";
    this.code = payload.code;
    this.status = status;
    this.details = payload.details;
    this.traceId = payload.traceId;
  }

  toJSON(): {
    error: {
      code: ProtocolErrorCode;
      message: string;
      details?: unknown;
      traceId?: string;
    };
  } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
        ...(this.traceId === undefined ? {} : { traceId: this.traceId }),
      },
    };
  }

  static manifestInvalid(message: string, details?: unknown): ProtocolError {
    return new ProtocolError(
      { code: "MANIFEST_INVALID", message, details, traceId: undefined },
      400,
    );
  }

  static requestInvalid(
    message: string,
    details?: unknown,
    traceId?: string,
  ): ProtocolError {
    return new ProtocolError(
      { code: "REQUEST_INVALID", message, details, traceId },
      400,
    );
  }

  static responseInvalid(
    message: string,
    details?: unknown,
    traceId?: string,
  ): ProtocolError {
    return new ProtocolError(
      { code: "RESPONSE_INVALID", message, details, traceId },
      500,
    );
  }

  static noHandler(resource: string, traceId?: string): ProtocolError {
    return new ProtocolError(
      {
        code: "NO_HANDLER",
        message: `No handler registered for resource '${resource}'`,
        details: undefined,
        traceId,
      },
      404,
    );
  }

  static invalidJson(message: string, traceId?: string): ProtocolError {
    return new ProtocolError(
      { code: "INVALID_JSON", message, details: undefined, traceId },
      400,
    );
  }

  static payloadTooLarge(maxBytes: number, traceId?: string): ProtocolError {
    return new ProtocolError(
      {
        code: "PAYLOAD_TOO_LARGE",
        message: `Payload size exceeds maxPayloadBytes ${maxBytes}`,
        details: undefined,
        traceId,
      },
      400,
    );
  }

  static payloadTooDeep(maxDepth: number, traceId?: string): ProtocolError {
    return new ProtocolError(
      {
        code: "PAYLOAD_TOO_DEEP",
        message: `Payload nesting depth exceeds maxDepth ${maxDepth}`,
        details: undefined,
        traceId,
      },
      400,
    );
  }

  static internal(
    message: string,
    details?: unknown,
    traceId?: string,
  ): ProtocolError {
    return new ProtocolError(
      { code: "INTERNAL_ERROR", message, details, traceId },
      500,
    );
  }
}

export function normalizeError(
  error: unknown,
  fallbackTraceId?: string,
): ProtocolError {
  if (error instanceof ProtocolError) {
    return error;
  }

  if (error instanceof Error) {
    return ProtocolError.internal(error.message, undefined, fallbackTraceId);
  }

  return ProtocolError.internal("Unknown error", error, fallbackTraceId);
}
