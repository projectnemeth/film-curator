const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return bytesToBase64Url(new Uint8Array(signature))
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export async function signSession(secret: string, issuedAt: number = Date.now()): Promise<string> {
  const payload = JSON.stringify({ issuedAt })
  const payloadB64 = bytesToBase64Url(encoder.encode(payload))
  const signatureB64 = await hmacSign(secret, payloadB64)
  return `${payloadB64}.${signatureB64}`
}

export async function verifySession(cookieValue: string, secret: string, maxAgeMs: number): Promise<boolean> {
  const parts = cookieValue.split('.')
  if (parts.length !== 2) return false
  const [payloadB64, signatureB64] = parts

  const expectedSignatureB64 = await hmacSign(secret, payloadB64)
  if (!constantTimeEqual(signatureB64, expectedSignatureB64)) return false

  let payload: unknown
  try {
    payload = JSON.parse(decoder.decode(base64UrlToBytes(payloadB64)))
  } catch {
    return false
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as { issuedAt?: unknown }).issuedAt !== 'number'
  ) {
    return false
  }

  const age = Date.now() - (payload as { issuedAt: number }).issuedAt
  return age >= 0 && age <= maxAgeMs
}
