/** True when `url` is an absolute `http(s)://` URL. Undefined/empty is never capturable. */
export function isHttpUrl(url: string | undefined): url is string {
  if (url === undefined) return false;
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
