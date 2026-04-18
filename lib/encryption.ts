import 'server-only'

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const VERSION = 'v1'

function getEncryptionKey() {
  const secret = process.env.EMAIL_SETTINGS_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) {
    throw new Error('EMAIL_SETTINGS_ENCRYPTION_KEY is missing.')
  }

  return createHash('sha256').update(secret).digest()
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':')
}

export function decryptSecret(value: string) {
  const [version, ivText, tagText, encryptedText] = value.split(':')
  if (version !== VERSION || !ivText || !tagText || !encryptedText) {
    throw new Error('Encrypted secret is not in a supported format.')
  }

  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivText, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'))

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
