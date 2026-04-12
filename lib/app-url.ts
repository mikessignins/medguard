export function getAppBaseUrl(requestUrl?: string) {
  const configuredUrl = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL
  if (configuredUrl) return configuredUrl.replace(/\/+$/, '')

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }

  if (requestUrl) {
    const url = new URL(requestUrl)
    return url.origin
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  return 'http://localhost:3000'
}

export function getAccountSetupUrl(requestUrl?: string) {
  return `${getAppBaseUrl(requestUrl)}/account?setup=password`
}

export function getLoginUrl(requestUrl?: string) {
  return `${getAppBaseUrl(requestUrl)}/login`
}
