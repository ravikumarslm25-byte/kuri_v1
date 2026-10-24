// Copies the card layout renderer from the kiosk (canonical) to the admin panel, so the admin
// preview draws exactly what the kiosk prints.   Usage: node tools/sync-card-layout.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'kiosk/src/lib/print/cardLayout.ts');
const dst = path.join(root, 'admin/src/app/lib/cardLayout.ts');
fs.copyFileSync(src, dst);
console.log(`copied ${path.relative(root, src)} -> ${path.relative(root, dst)}`);
