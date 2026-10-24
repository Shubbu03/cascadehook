import xior, { isXiorError, type XiorRequestConfig } from "xior";

type Problem = { code?: string };
type GetToken = () => Promise<string | null>;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status = 0,
    public readonly code?: string,
    public readonly retryAt = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const api = xior.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
  timeout: 10_000,
  credentials: "omit",
  cache: "no-store",
});

function problemMessage(status: number, code?: string) {
  const endpointMessages: Record<string, string> = {
    invalid_endpoint_url:
      "Use an HTTPS URL without credentials or a fragment, up to 2,048 bytes.",
    invalid_event_types:
      "Choose 1–100 unique event types, using lowercase letters, numbers, dots, hyphens, or underscores.",
    endpoint_not_verified:
      "Verify ownership of this endpoint before enabling delivery.",
    signing_secret_required:
      "Set up a signing secret before verifying or enabling this endpoint.",
    signing_secret_rotation_in_progress:
      "The previous signing secret is still in its five-minute grace period. Wait before rotating again.",
    endpoint_verification_changed:
      "The endpoint changed during verification. Refresh and verify its current configuration.",
    endpoint_verification_rate_limited:
      "Wait 30 seconds between verification attempts.",
    endpoint_verification_failed:
      "The receiver didn't complete verification. Check its HTTPS response and challenge handler.",
    invalid_verification_proof:
      "The receiver returned an invalid proof. Check the signing secret and verification handler.",
    unsafe_endpoint_destination:
      "This destination isn't allowed. Use a public HTTPS receiver without redirects.",
    project_suspended:
      "This project is paused. New endpoints, verification, and activation are unavailable.",
    request_timeout:
      "The request timed out. Refresh to check the current state before trying again.",
  };
  if (code && endpointMessages[code]) return endpointMessages[code];
  if (status === 401)
    return "We couldn't verify your session. Please sign out and sign in again.";
  if (status === 403)
    return "You don't have permission for this action. Your access may have changed.";
  if (status === 429)
    return "Too many requests. Please wait a moment before trying again.";
  if (code === "invalid_name")
    return "Use a name with 1–100 characters and no control characters.";
  if (code === "quota_exceeded")
    return "Your organization has reached its limit for this resource.";
  if (status === 409)
    return "This action conflicts with a recent change. Refresh and try again.";
  if (status === 404)
    return "This resource is no longer available to your account.";
  return "We couldn't reach your workspace. Please try again shortly.";
}

export async function apiRequest<T>(
  path: string,
  getToken: GetToken,
  options: Pick<
    XiorRequestConfig,
    "method" | "data" | "params" | "signal"
  > = {},
): Promise<T> {
  if (!process.env.NEXT_PUBLIC_API_BASE_URL) {
    throw new ApiError(
      "Your workspace connection isn't available right now. Please try again later.",
      0,
      "api_not_configured",
    );
  }
  let token: string | null;
  try {
    token = await getToken();
  } catch {
    throw new ApiError(
      "Your session couldn't be refreshed. Check your connection and try again.",
    );
  }
  if (!token) throw new ApiError("Please sign in again to continue.", 401);

  try {
    const response = await api.request<T>({
      ...options,
      url: path,
      headers: { Authorization: "Bearer " + token },
    });
    return response.data;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (isXiorError<Problem>(error)) {
      const status = error.response?.status ?? 0;
      const code = error.response?.data?.code;
      const retryAfter = error.response?.headers.get("Retry-After");
      const retryAt = retryAfter
        ? /^\d+$/.test(retryAfter)
          ? Date.now() + Number(retryAfter) * 1000
          : Date.parse(retryAfter)
        : 0;
      throw new ApiError(
        problemMessage(status, code),
        status,
        code,
        Number.isFinite(retryAt) ? retryAt : 0,
      );
    }
    throw new ApiError("Your connection was interrupted. Please try again.");
  }
}
