const DEFAULT_SITE_URL = "https://dubbl.dev";
const DEFAULT_APP_URL = "https://dubbl.dev";

function trimTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function joinUrl(baseUrl: string, path = "") {
  const normalizedPath = path ? `/${path.replace(/^\/+/, "")}` : "";
  return `${trimTrailingSlash(baseUrl)}${normalizedPath}`;
}

export function getPublicAppUrl() {
  return trimTrailingSlash(process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL);
}

export function getPublicSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return trimTrailingSlash(process.env.NEXT_PUBLIC_SITE_URL);
  }

  const appUrl = getPublicAppUrl();
  if (appUrl.endsWith("/app")) {
    return appUrl.slice(0, -4);
  }

  return appUrl;
}

export function toAppUrl(path = "") {
  return joinUrl(getPublicAppUrl(), path);
}

export function toSiteUrl(path = "") {
  return joinUrl(getPublicSiteUrl(), path);
}
