import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from './token';

describe('signed tokens', () => {
	it('round-trips a payload', async () => {
		const token = await signToken({ pid: 'p1', n: 'Zoë ✓' }, 'secret');
		expect(await verifyToken(token, 'secret')).toEqual({ pid: 'p1', n: 'Zoë ✓' });
	});

	it('rejects a wrong secret, tampering and garbage', async () => {
		const token = await signToken({ pid: 'p1' }, 'secret');
		expect(await verifyToken(token, 'other')).toBeNull();
		const [body, sig] = token.split('.');
		const forged = `${btoa(JSON.stringify({ pid: 'p2' })).replace(/=+$/, '')}.${sig}`;
		expect(await verifyToken(forged, 'secret')).toBeNull();
		expect(await verifyToken(`${body}.`, 'secret')).toBeNull();
		expect(await verifyToken('nonsense', 'secret')).toBeNull();
		expect(await verifyToken('', 'secret')).toBeNull();
	});
});
