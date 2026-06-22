const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const distRoot = path.join(__dirname, '..', '.test-dist');
const packageJsonPath = path.join(distRoot, 'package.json');
const runnerPath = path.join(distRoot, 'tests', 'payments.test.js');

fs.mkdirSync(distRoot, { recursive: true });
fs.writeFileSync(packageJsonPath, JSON.stringify({ type: 'module' }, null, 2));

(async () => {
  try {
    await import(pathToFileURL(runnerPath).href);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
})();
