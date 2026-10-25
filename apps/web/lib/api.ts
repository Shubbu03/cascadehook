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
    delivery_cycle_changed:
      "This delivery changed while you were reviewing it. Check its current cycle before replaying.",
    delivery_not_replayable:
      "Only completed failed or successful deliveries can be replayed.",
    replay_endpoint_not_ready:
      "Enable and verify the endpoint with a signing secret before replaying.",
    delivery_cycle_limit_reached:
      "This delivery has reached its replay cycle limit.",
    invalid_filter: "One of the filters is invalid. Clear it and try again.",
    invalid_cursor: "This page is no longer available. Refresh the list.",
    invalid_api_key_name:
      "Use a key name with 1–100 characters and no control characters.",
    invalid_api_key_environment: "Choose Development or Live.",
    invalid_api_key_expiry: "The key expiry must be in the future.",
    api_key_inactive: "This key is no longer active. Refresh the key list.",
    api_key_rotation_pending:
      "This key already has a replacement. Use the replacement or create a new key.",
    last_usable_api_key:
      "Create a usable replacement before revoking this key.",
    invalid_invitation_email: "Enter a plain email address.",
    invitation_pending:
      "An invitation for this email is already pending. Revoke it before creating another.",
    invitation_unavailable:
      "This invitation has expired, been revoked, or is unavailable.",
    invitation_email_mismatch:
      "Sign in with the verified email address this invitation was sent to.",
    invitation_lookup_rate_limited:
      "Wait a moment before checking this invitation again.",
    invitation_identity_lookup_not_configured:
      "Invitation verification is unavailable. Please try again later.",
    invitation_identity_lookup_unavailable:
      "Invitation verification is temporarily unavailable. Please try again later.",
    last_organization_owner:
      "The organization must keep at least one owner. Promote another member first.",
    already_member: "This account is already an organization member.",
    invalid_role: "Choose a valid organization role.",
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
    project_suspended: "This project is paused. This action is unavailable.",
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
