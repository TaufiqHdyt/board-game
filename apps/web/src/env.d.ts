// Secrets are not part of wrangler.jsonc, so declare them for `wrangler types`.
declare namespace Cloudflare {
	interface Env {
		TICKET_SECRET: string;
	}
}
