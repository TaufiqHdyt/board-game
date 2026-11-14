// Creates local .dev.vars files from the examples (never overwrites).
import { copyFileSync, existsSync } from 'node:fs';

for (const app of ['apps/game', 'apps/web']) {
	const target = `${app}/.dev.vars`;
	if (existsSync(target)) {
		console.log(`${target} already exists, skipped`);
	} else {
		copyFileSync(`${app}/.dev.vars.example`, target);
		console.log(`created ${target}`);
	}
}
