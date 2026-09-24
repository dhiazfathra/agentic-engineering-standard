/** True when `url` is an absolute `http(s)://` URL. Undefined/empty is never capturable. */
export function isHttpUrl(url: string | undefined): url is string {
  return url !== undefined && /^https?:\/\//.test(url);
}
