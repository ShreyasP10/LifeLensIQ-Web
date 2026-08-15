import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outdir = join(root, 'dist');

rmSync(outdir, { recursive: true, force: true });
mkdirSync(join(outdir, 'popup'), { recursive: true });
mkdirSync(join(outdir, 'options'), { recursive: true });
mkdirSync(join(outdir, 'icons'), { recursive: true });

const common = {
  bundle: true,
  outdir,
  format: 'iife',
  target: ['chrome110'],
  logLevel: 'info',
  minify: false,
};

await build({ ...common, entryPoints: { background: 'src/background.js' } });
await build({ ...common, entryPoints: { 'content-shorts': 'src/content/shorts.js' } });
await build({ ...common, entryPoints: { 'content-writing': 'src/content/writing.js' } });
await build({ ...common, entryPoints: { 'content-youtube-focus': 'src/content/youtube-focus.js' } });
await build({ ...common, entryPoints: { focus: 'src/focus.js' } });
await build({ ...common, entryPoints: { 'popup/popup': 'src/popup/popup.js' } });
await build({ ...common, entryPoints: { 'options/options': 'src/options/options.js' } });

copyFileSync(join(root, 'manifest.json'), join(outdir, 'manifest.json'));
copyFileSync(join(root, 'src/focus.html'), join(outdir, 'focus.html'));
copyFileSync(join(root, 'src/focus.css'), join(outdir, 'focus.css'));
copyFileSync(join(root, 'src/popup/popup.html'), join(outdir, 'popup/popup.html'));
copyFileSync(join(root, 'src/popup/popup.css'), join(outdir, 'popup/popup.css'));
copyFileSync(join(root, 'src/options/options.html'), join(outdir, 'options/options.html'));
copyFileSync(join(root, 'src/options/options.css'), join(outdir, 'options/options.css'));
for (const f of readdirSync(join(root, 'assets', 'icons'))) {
  copyFileSync(join(root, 'assets', 'icons', f), join(outdir, 'icons', f));
}

console.log('Extension build complete ->', outdir);
