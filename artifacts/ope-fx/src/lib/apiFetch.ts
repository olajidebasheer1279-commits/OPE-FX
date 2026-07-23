type AuthTokenGetter = () => Promise<string | null> | string | null;

let authTokenGetter: AuthTokenGetter | null = null;

export function setApiAuthTokenGetter(getter: AuthTokenGetter | null): void {
  authTokenGetter = getter;
}

/**
 * Fetch an application API endpoint with the current Clerk session token.
 *
 * The generated API client has the same transport behavior, but a few
 * existing features use native fetch for endpoints that are not generated.
 * Keeping this wrapper scoped to application API calls avoids sending a
 * user's Clerk token to third-party upload destinations.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(
    typeof Request !== "undefined" && input instanceof Request
      ? input.headers
      : undefined,
  );
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));

  if (!headers.has("authorization") && authTokenGetter) {
    const token = await authTokenGetter();
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: init.credentials ?? "include",
  });
}