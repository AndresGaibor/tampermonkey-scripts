import { scripts } from '../scripts.manifest.mjs';

for (const [name, config] of Object.entries(scripts)) {
  console.log(`${name}`);
  console.log(`  archivo: dist/${config.fileName}`);
  console.log(`  entry:   ${config.entry}`);
  console.log(`  match:   ${config.userscript.match?.join(', ') || '-'}`);
}
