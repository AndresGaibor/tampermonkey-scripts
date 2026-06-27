import { scripts } from '../scripts.manifest.ts';

for (const [name, config] of Object.entries(scripts)) {
  console.log(`${name}`);
  console.log(`  archivo: dist/${config.fileName}`);
  console.log(`  entry:   ${config.entry}`);
  console.log(`  match:   ${config.userscript.match?.join(', ') || '-'}`);
}
