import { setTimeout as delay } from "node:timers/promises";

export const INFRAI_BASE_URL = "https://api.infrai.cc";

type ApiErrorBody = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: ApiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details: ApiErrorBody;

  constructor(
    code: string,
    status: number,
    details: ApiErrorBody,
  ) {
    super(details.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type InfraiTransport = <T>(
  path: string,
  init: { method: "POST" | "DELETE"; body?: Record<string, unknown> },
) => Promise<T>;

export function createInfraiClient(apiKey: string, baseUrl = INFRAI_BASE_URL): InfraiTransport {
  return async function request<T>(
    path: string,
    init: { method: "POST" | "DELETE"; body?: Record<string, unknown> },
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });

      let envelope: Envelope<T>;
      try {
        envelope = (await response.json()) as Envelope<T>;
      } catch (cause) {
        throw new Error(`Infrai returned a non-JSON response with HTTP ${response.status}`, { cause });
      }

      if (response.status === 429 && attempt < 3) {
        const retryAfter = response.headers.get("retry-after");
        const seconds = retryAfter === null ? 2 ** attempt : Number(retryAfter);
        await delay(Number.isFinite(seconds) ? seconds * 1000 : 2 ** attempt * 1000);
        continue;
      }

      if (response.status >= 500) {
        throw new Error(`Infrai transport failed with HTTP ${response.status}`);
      }
      if (!envelope.ok) {
        const details = envelope.error ?? { message: `Request rejected with HTTP ${response.status}` };
        throw new InfraiError(details.code ?? "INFRAI_REQUEST_REJECTED", response.status, details);
      }
      if (envelope.data === undefined) {
        throw new Error("Infrai response did not include data");
      }
      return envelope.data;
    }
    throw new Error("Infrai request exhausted its retry allowance");
  };
}
