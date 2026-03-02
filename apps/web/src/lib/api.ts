/**
 * Parse error message from API response.
 * API returns { detail: string } for normalized errors.
 */
export async function getErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    const detail = data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail.map((d: { msg?: string }) => d?.msg ?? "Invalid").join("; ") || fallback;
    }
  } catch {
    // Response may not be JSON (e.g. 502 from proxy)
  }
  return fallback;
}
