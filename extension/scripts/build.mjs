import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outdir = join(root, 'dist');
// Mirror the final build to a stable, non-OneDrive path. Chrome/Brave revalidate
// unpacked extensions at startup; if the registered path lives inside OneDrive
// and is briefly unavailable/not hydrated when the browser starts, Chromium
// uninstalls the unpacked registration (cleanup of unresolvable paths).
// Loading from LOCALAPPDATA removes that race entirely.
const mirrorDir = join(process.env.LOCALAPPDATA || root, 'LifeLensIQ-dist');

function copyTree(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dst, name);
    if (statSync(s).isDirectory()) copyTree(s, d);
    else copyFileSync(s, d);
  }
}

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
await build({ ...common, entryPoints: { 'content-youtube-title-watcher': 'src/content/youtube-title-watcher.js' } });
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
try {
  rmSync(mirrorDir, { recursive: true, force: true });
  copyTree(outdir, mirrorDir);
  console.log('Stable mirror published ->', mirrorDir);
} catch (err) {
  console.warn('Mirror publish failed (extension/dist still valid):', err.message);
}
