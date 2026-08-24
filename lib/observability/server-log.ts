type ServerLogLevel = 'error' | 'warn';

type SafeServerLogOptions = {
  failure?: unknown;
  requestId?: string | null;
  attempt?: number;
};

const SAFE_CODE = /^[a-z0-9][a-z0-9_.:-]{0,79}$/iu;
const SAFE_REQUEST_ID = /^[a-z0-9][a-z0-9_.:-]{0,127}$/iu;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/iu;
const EGYPT_PHONE = /(?:\+?20|0)?1[0125][0-9]{8}/u;
const JWT = /eyJ[a-z0-9_-]{16,}\.[a-z0-9_-]{16,}\.[a-z0-9_-]{8,}/iu;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu;
const HIGH_ENTROPY_SEGMENT = /[a-z0-9]{33,}/iu;
const SECRET_PREFIX = /^(?:sk|pk|rk|secret|bearer|api[_-]?key)[_.:-]/iu;
const AWS_ACCESS_KEY = /(?:A3T[A-Z0-9]|AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASCA)[A-Z0-9]{16}/u;

function safeToken(value: unknown, pattern: RegExp): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (
    EMAIL.test(candidate)
    || EGYPT_PHONE.test(candidate)
    || JWT.test(candidate)
    || UUID.test(candidate)
    || HIGH_ENTROPY_SEGMENT.test(candidate)
    || SECRET_PREFIX.test(candidate)
    || AWS_ACCESS_KEY.test(candidate)
  ) return null;
  return pattern.test(candidate) ? candidate.toLowerCase() : null;
}

/**
 * Returns an operational failure code without serializing an Error, a
 * Supabase response, user input, SQL details, or credentials into platform
 * logs.
 */
export function safeServerFailureCode(failure: unknown): string {
  if (failure && typeof failure === 'object') {
    const record = failure as Record<string, unknown>;
    const explicitCode = safeToken(record.code, SAFE_CODE);
    if (explicitCode) return explicitCode;

    const safeMessage = safeToken(record.message, SAFE_CODE);
    if (safeMessage) return safeMessage;

    const errorName = safeToken(record.name, SAFE_CODE);
    if (errorName && errorName !== 'error') return errorName;
  }

  return safeToken(failure, SAFE_CODE) ?? 'unknown_error';
}

/** Log a deliberately narrow, JSON-structured event at the Vercel boundary. */
export function logSafeServerFailure(
  level: ServerLogLevel,
  event: string,
  options: SafeServerLogOptions = {},
): void {
  const payload: Record<string, string | number> = {
    level,
    event: safeToken(event, SAFE_CODE) ?? 'invalid_log_event',
  };

  if (options.failure !== undefined) {
    payload.failureCode = safeServerFailureCode(options.failure);
  }

  const requestId = safeToken(options.requestId, SAFE_REQUEST_ID);
  if (requestId) payload.requestId = requestId;

  if (Number.isSafeInteger(options.attempt) && (options.attempt ?? 0) >= 0) {
    payload.attempt = options.attempt!;
  }

  const serialized = JSON.stringify(payload);
  if (level === 'error') console.error(serialized);
  else console.warn(serialized);
}
