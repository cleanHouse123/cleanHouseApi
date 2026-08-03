export function joinUrl(baseUrl: string, path: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.replace(/^\/+/, '');

  return `${normalizedBaseUrl}/${normalizedPath}`;
}
