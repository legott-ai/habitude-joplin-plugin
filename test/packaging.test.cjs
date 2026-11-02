'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function fixture(fn) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'habitude-joplin-registry-test-'));
  try {
    for (const name of ['build.cjs', 'verify.cjs', 'package.json', 'manifest.json', 'README.md', 'LICENSE']) fs.copyFileSync(path.join(root, name), path.join(temporary, name));
    fs.cpSync(path.join(root, 'src'), path.join(temporary, 'src'), { recursive: true });
    fn(temporary);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
const build = dir => execFileSync(process.execPath, [path.join(dir, 'build.cjs')], { cwd: dir });
const verify = dir => spawnSync(process.execPath, [path.join(dir, 'verify.cjs')], { cwd: dir });
test('registry pair contains the exact versioned archive and matching SHA-256 metadata', () => fixture(dir => {
  build(dir);
  assert.equal(verify(dir).status, 0);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json')));
  const archive = fs.readFileSync(path.join(dir, 'publish', `${manifest.id}.jpl`));
  const metadata = JSON.parse(fs.readFileSync(path.join(dir, 'publish', `${manifest.id}.json`)));
  assert.equal(metadata._publish_hash, 'sha256:' + crypto.createHash('sha256').update(archive).digest('hex'));
  assert.equal(metadata._publish_commit, '');
  build(dir);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'publish', `${manifest.id}.jpl`)), archive);
}));
test('builder takes output version from the matching manifests and keeps older release bytes', () => fixture(dir => {
  fs.mkdirSync(path.join(dir, 'dist'));
  const stable = path.join(dir, 'dist/habitude-joplin-0.1.0.jpl');
  fs.writeFileSync(stable, 'Synthetic earlier release');
  build(dir);
  assert.equal(fs.readFileSync(stable, 'utf8'), 'Synthetic earlier release');
  const version = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'))).version;
  assert.ok(fs.existsSync(path.join(dir, 'dist', `habitude-joplin-${version}.jpl`)));
}));
test('registry verification rejects modified archive bytes and ambiguous manifest selection', () => fixture(dir => {
  build(dir);
  const id = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'))).id;
  fs.appendFileSync(path.join(dir, 'publish', `${id}.jpl`), 'corrupted');
  assert.notEqual(verify(dir).status, 0);
  build(dir);
  fs.writeFileSync(path.join(dir, 'publish/other.json'), '{}');
  assert.notEqual(verify(dir).status, 0);
}));
test('mismatched versions stop before registry artifacts or compiled runtime are written', () => fixture(dir => {
  const file = path.join(dir, 'package.json'), pkg = JSON.parse(fs.readFileSync(file));
  pkg.version = '99.0.0'; fs.writeFileSync(file, JSON.stringify(pkg));
  assert.notEqual(spawnSync(process.execPath, [path.join(dir, 'build.cjs')], { cwd: dir }).status, 0);
  assert.equal(fs.existsSync(path.join(dir, 'publish')), false);
  assert.equal(fs.existsSync(path.join(dir, 'index.js')), false);
}));
