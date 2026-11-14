import type { Session } from '@bg/proto';

declare global {
	namespace App {
		interface Locals {
			session: Session;
		}
	}
}

export {};
