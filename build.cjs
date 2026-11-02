'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(manifest.id) ||
    !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(manifest.version) || pkg.version !== manifest.version ||
    pkg.name !== 'joplin-plugin-habitude' || !pkg.keywords?.includes('joplin-plugin')) {
  throw new Error('Invalid or inconsistent registry package identity');
}
function close(source) {
  return '(()=>{const module={exports:{}};const exports=module.exports;\n' + source + '\nreturn module.exports;})()';
}
const portable = fs.readFileSync(path.join(root, 'src/portable.cjs'), 'utf8');
const plugin = fs.readFileSync(path.join(root, 'src/index.cjs'), 'utf8');
fs.writeFileSync(path.join(root, 'index.js'), '// Habitude local export plugin. No source-note writes or automated network calls.\n(()=>{const portable=' + close(portable) + ';const {registerJoplin}=' + close(plugin) + ';registerJoplin(joplin,portable);})();\n');
const dist = path.join(root, 'dist');
const publish = path.join(root, 'publish');
fs.mkdirSync(dist, { recursive: true });
fs.mkdirSync(publish, { recursive: true });
const archive = path.join(dist, `habitude-joplin-${manifest.version}.jpl`);
execFileSync('python3', ['-c', 'import tarfile,pathlib,sys\nr=pathlib.Path(sys.argv[1])\nwith tarfile.open(sys.argv[2],"w",format=tarfile.USTAR_FORMAT) as a:\n for n in ["index.js","manifest.json","package.json","README.md","LICENSE"]:\n  p=r/n;x=a.gettarinfo(str(p),n);x.uid=x.gid=0;x.uname=x.gname="";x.mtime=0;x.mode=0o644\n  with p.open("rb") as f:a.addfile(x,f)', root, archive]);
const archiveHash = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
let gitInfo = '';
try {
  // Do not claim that an older commit represents an uncommitted packaging patch.
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (!dirty) {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    gitInfo = `${branch === 'HEAD' ? 'master' : branch}:${commit}`;
  }
} catch { /* Git information is optional, as in the official generator. */ }
fs.copyFileSync(archive, path.join(publish, `${manifest.id}.jpl`));
fs.writeFileSync(path.join(publish, `${manifest.id}.json`), JSON.stringify({ ...manifest, _publish_hash: `sha256:${archiveHash}`, _publish_commit: gitInfo }, null, '\t') + '\n');
console.log(JSON.stringify({ version: manifest.version, archive: path.relative(root, archive), publishArchive: `publish/${manifest.id}.jpl`, sha256: archiveHash }));
