/**
 * Get the base URL for the web application.
 * Configurable via NEXT_PUBLIC_SANTRA_WEB_BASE_URL environment variable.
 * Defaults to http://localhost:3000 for local development.
 */
export function getWebBaseUrl(): string {
  return (
    process.env["NEXT_PUBLIC_SANTRA_WEB_BASE_URL"] ?? "http://localhost:3000"
  );
}

/**
 * Build a full URL path relative to the web base.
 */
export function buildWebUrl(path: string): string {
  const base = getWebBaseUrl();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base.replace(/\/$/, "")}${normalized}`;
}
