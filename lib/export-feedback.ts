export async function getExportErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  const text = (await response.text().catch(() => '')).trim()

  if (text) return text

  if (response.status === 422) {
    return `${fallbackMessage} Complete the required review outcome, save it, and then try exporting again.`
  }

  return fallbackMessage
}
