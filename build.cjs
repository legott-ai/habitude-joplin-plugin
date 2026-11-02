'use strict';
/* global __dirname */
const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');const root=__dirname;
function close(source){return '(()=>{const module={exports:{}};const exports=module.exports;\n'+source+'\nreturn module.exports;})()';}
const portable=fs.readFileSync(path.join(root,'src/portable.cjs'),'utf8');const plugin=fs.readFileSync(path.join(root,'src/index.cjs'),'utf8');
fs.writeFileSync(path.join(root,'index.js'),'// Habitude local export plugin. No source-note writes or automated network calls.\n(()=>{const portable='+close(portable)+';const {registerJoplin}='+close(plugin)+';registerJoplin(joplin,portable);})();\n');
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
execFileSync('python3',['-c','import tarfile,pathlib,sys\nr=pathlib.Path(sys.argv[1])\nwith tarfile.open(r/"dist/habitude-joplin-0.1.0.jpl","w",format=tarfile.USTAR_FORMAT) as a:\n for n in ["index.js","manifest.json","package.json","README.md","LICENSE"]:\n  p=r/n;x=a.gettarinfo(str(p),n);x.uid=x.gid=0;x.uname=x.gname="";x.mtime=0;x.mode=0o644\n  with p.open("rb") as f:a.addfile(x,f)',root]);
