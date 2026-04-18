import 'server-only'

import net from 'net'
import { randomUUID } from 'crypto'
import tls from 'tls'

export type SmtpSecurity = 'tls' | 'starttls' | 'none'

export interface SmtpSendInput {
  host: string
  port: number
  security: SmtpSecurity
  username?: string | null
  password?: string | null
  from: string
  fromName?: string | null
  replyTo?: string | null
  to: string[]
  subject: string
  html: string
  text?: string
}

type Socket = net.Socket | tls.TLSSocket

function encodeHeader(value: string) {
  return /[^\x20-\x7e]/.test(value)
    ? `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
    : value.replaceAll(/\r|\n/g, ' ')
}

function formatAddress(email: string, name?: string | null) {
  const cleanEmail = email.trim()
  if (!name?.trim()) return `<${cleanEmail}>`
  return `"${name.trim().replaceAll('"', '\\"')}" <${cleanEmail}>`
}

function htmlToText(html: string) {
  return html
    .replaceAll(/<br\s*\/?>/gi, '\n')
    .replaceAll(/<\/p>/gi, '\n\n')
    .replaceAll(/<[^>]+>/g, '')
    .replaceAll(/&nbsp;/g, ' ')
    .replaceAll(/&amp;/g, '&')
    .replaceAll(/&lt;/g, '<')
    .replaceAll(/&gt;/g, '>')
    .trim()
}

function dotStuff(value: string) {
  return value.replaceAll(/\r?\n\./g, '\r\n..')
}

function buildMessage(input: SmtpSendInput) {
  const boundary = `medguard-${randomUUID()}`
  const text = input.text ?? htmlToText(input.html)

  return [
    `From: ${formatAddress(input.from, input.fromName)}`,
    `To: ${input.to.map((email) => formatAddress(email)).join(', ')}`,
    input.replyTo ? `Reply-To: ${formatAddress(input.replyTo)}` : null,
    `Subject: ${encodeHeader(input.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.html,
    '',
    `--${boundary}--`,
    '',
  ].filter((line): line is string => line !== null).join('\r\n')
}

class SmtpConnection {
  private socket: Socket
  private buffer = ''

  constructor(socket: Socket) {
    this.socket = socket
    this.socket.setEncoding('utf8')
    this.socket.on('data', (chunk) => {
      this.buffer += chunk
    })
  }

  static connect(input: SmtpSendInput) {
    return new Promise<SmtpConnection>((resolve, reject) => {
      const onError = (error: Error) => reject(error)
      const socket = input.security === 'tls'
        ? tls.connect(input.port, input.host, { servername: input.host }, () => {
            socket.off('error', onError)
            resolve(new SmtpConnection(socket))
          })
        : net.connect(input.port, input.host, () => {
            socket.off('error', onError)
            resolve(new SmtpConnection(socket))
          })

      socket.once('error', onError)
      socket.setTimeout(20_000, () => {
        socket.destroy(new Error('SMTP connection timed out.'))
      })
    })
  }

  upgradeToTls(host: string) {
    return new Promise<void>((resolve, reject) => {
      const upgraded = tls.connect({
        socket: this.socket,
        servername: host,
      }, () => {
        this.socket = upgraded
        this.socket.setEncoding('utf8')
        this.socket.on('data', (chunk) => {
          this.buffer += chunk
        })
        upgraded.off('error', reject)
        resolve()
      })

      upgraded.once('error', reject)
    })
  }

  write(command: string) {
    this.socket.write(`${command}\r\n`)
  }

  async read(expected: number[]) {
    const startedAt = Date.now()
    while (!this.hasCompleteResponse()) {
      await new Promise((resolve) => setTimeout(resolve, 10))
      if (Date.now() - startedAt > 20_000) {
        throw new Error('SMTP server response timed out.')
      }
    }

    const response = this.takeResponse()
    const code = Number(response.slice(0, 3))
    if (!expected.includes(code)) {
      throw new Error(`SMTP server rejected command: ${response.trim()}`)
    }
    return response
  }

  async command(command: string, expected: number[]) {
    this.write(command)
    return this.read(expected)
  }

  close() {
    this.socket.end()
  }

  private hasCompleteResponse() {
    const lines = this.buffer.split(/\r?\n/).filter(Boolean)
    if (lines.length === 0) return false
    const last = lines[lines.length - 1]
    return /^\d{3} /.test(last)
  }

  private takeResponse() {
    const response = this.buffer
    this.buffer = ''
    return response
  }
}

export async function sendSmtpMail(input: SmtpSendInput) {
  if (input.to.length === 0) return

  const connection = await SmtpConnection.connect(input)
  try {
    await connection.read([220])
    await connection.command(`EHLO ${input.host}`, [250])

    if (input.security === 'starttls') {
      await connection.command('STARTTLS', [220])
      await connection.upgradeToTls(input.host)
      await connection.command(`EHLO ${input.host}`, [250])
    }

    if (input.username && input.password) {
      const auth = Buffer.from(`\u0000${input.username}\u0000${input.password}`, 'utf8').toString('base64')
      await connection.command(`AUTH PLAIN ${auth}`, [235])
    }

    await connection.command(`MAIL FROM:<${input.from}>`, [250])
    for (const recipient of input.to) {
      await connection.command(`RCPT TO:<${recipient}>`, [250, 251])
    }
    await connection.command('DATA', [354])
    connection.write(`${dotStuff(buildMessage(input))}\r\n.`)
    await connection.read([250])
    await connection.command('QUIT', [221])
  } finally {
    connection.close()
  }
}
