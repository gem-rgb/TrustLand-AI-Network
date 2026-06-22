import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const distRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.test-dist');
const packageJsonPath = path.join(distRoot, 'package.json');
const runnerPath = path.join(distRoot, 'tests', 'payments.test.js');

fs.mkdirSync(distRoot, { recursive: true });
fs.writeFileSync(packageJsonPath, JSON.stringify({ type: 'module' }, null, 2));

function rewriteImportSpecifiers(source) {
  return source
    .replace(/^import\s+['"]server-only['"];\s*$/gm, '')
    .replace(/from\s+(['"])(\.\.?\/[^'"]+)\1/g, (match, quote, specifier) => {
      if (/\.[cm]?js$/i.test(specifier)) return match;
      return `from ${quote}${specifier}.js${quote}`;
    })
    .replace(/import\((['"])(\.\.?\/[^'"]+)\1\)/g, (match, quote, specifier) => {
      if (/\.[cm]?js$/i.test(specifier)) return match;
      return `import(${quote}${specifier}.js${quote})`;
    });
}

function rewriteDistImports(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      rewriteDistImports(fullPath);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const original = fs.readFileSync(fullPath, 'utf8');
    const rewritten = rewriteImportSpecifiers(original);
    if (rewritten !== original) {
      fs.writeFileSync(fullPath, rewritten);
    }
  }
}

rewriteDistImports(distRoot);

try {
  await import(pathToFileURL(runnerPath).href);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
