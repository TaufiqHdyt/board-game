/**
 * Minimal HMAC-SHA256 signed tokens (payload.signature, both base64url).
 * Uses WebCrypto, so it runs unchanged in Workers, browsers and Node 22+.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
	const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

async function importKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);
}

export async function signToken(payload: unknown, secret: string): Promise<string> {
	if (!secret) throw new Error('signing secret is not configured');
	const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
	const signature = await crypto.subtle.sign('HMAC', await importKey(secret), encoder.encode(body));
	return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Returns the decoded payload, or null when the token is malformed or forged. */
export async function verifyToken(token: string, secret: string): Promise<unknown> {
	if (!secret) return null;
	const [body, signature, extra] = token.split('.');
	if (!body || !signature || extra !== undefined) return null;
	try {
		const valid = await crypto.subtle.verify(
			'HMAC',
			await importKey(secret),
			fromBase64Url(signature),
			encoder.encode(body)
		);
		if (!valid) return null;
		return JSON.parse(decoder.decode(fromBase64Url(body)));
	} catch {
		return null;
	}
}
