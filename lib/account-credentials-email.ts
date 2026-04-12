const TEMP_PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function generateTemporaryPassword(length = 16) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => TEMP_PASSWORD_CHARS[byte % TEMP_PASSWORD_CHARS.length]).join('')
}

async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL

  if (!apiKey || !from) {
    throw new Error('RESEND_API_KEY or RESEND_FROM_EMAIL is missing.')
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Resend error: ${message}`)
  }
}

export async function sendTemporaryPasswordEmail({
  to,
  displayName,
  roleLabel,
  temporaryPassword,
  loginUrl,
}: {
  to: string
  displayName: string
  roleLabel: string
  temporaryPassword: string
  loginUrl: string
}) {
  const safeName = escapeHtml(displayName || 'there')
  const safeRole = escapeHtml(roleLabel)
  const safePassword = escapeHtml(temporaryPassword)
  const safeLoginUrl = escapeHtml(loginUrl)

  await sendEmail({
    to,
    subject: 'Your MedGuard sign-in details',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
        <p>Hello ${safeName},</p>
        <p>Your MedGuard ${safeRole} account has been created.</p>
        <p>
          Sign in at <a href="${safeLoginUrl}">${safeLoginUrl}</a> using this temporary password:
        </p>
        <p style="font-family: monospace; font-size: 18px; font-weight: 700; padding: 12px; background: #f1f5f9; border-radius: 8px;">
          ${safePassword}
        </p>
        <p>Please change this password from Account Settings after you sign in.</p>
        <p style="color: #475569;">Sent automatically by MedGuard.</p>
      </div>
    `,
  })
}
