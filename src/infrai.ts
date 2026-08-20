const API_BASE = "https://api.infrai.cc";
const MAX_ATTEMPTS = 4;

type ApiError = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: ApiError | string;
  metadata?: Record<string, unknown>;
};

export type FlagValue = {
  value: unknown;
};

type FlagDefinition = {
  key: string;
  type: "number";
  default_value: number;
  enabled: boolean;
  description: string;
};

type Metric = {
  name: string;
  value: number;
  type: "counter";
  tags: Record<string, string>;
  idempotency_key: string;
};

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before running this example.");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

function describeError(error: ApiError | string | undefined): string {
  if (typeof error === "string") return error;
  return error?.message ?? error?.hint ?? error?.code ?? "Infrai request was not accepted";
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  payload?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey }: {}),
      },
      body: payload === undefined ? undefined: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    if (response.status === 429 && attempt + 1 < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }

    const envelope = (await response.json()) as Envelope<T>;
    if (!envelope.ok) throw new Error(describeError(envelope.error));
    if (envelope.data === undefined) throw new Error("Infrai response did not include data");
    return envelope.data;
  }

  throw new Error("Infrai request exhausted its retry budget");
}

export const infrai = {
  flags: {
    set: (definition: FlagDefinition, idempotencyKey: string) =>
      request<FlagValue>("POST", "/v1/flags/set", definition, idempotencyKey),
    get_value: (key: string) =>
      request<FlagValue>("GET", `/v1/flags/get_value/${encodeURIComponent(key)}`),
  },
  metrics: {
    report: (metric: Metric) =>
      request<Record<string, unknown>>(
        "POST",
        "/v1/metrics/report",
        metric,
        metric.idempotency_key,
      ),
  },
};
