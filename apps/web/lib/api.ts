import xior, { isXiorError, type XiorRequestConfig } from "xior";

type Problem = { code?: string };
type GetToken = () => Promise<string | null>;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status = 0,
    public readonly code?: string,
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
      throw new ApiError(problemMessage(status, code), status, code);
    }
    throw new ApiError("Your connection was interrupted. Please try again.");
  }
}
