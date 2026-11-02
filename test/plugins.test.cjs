'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const portable = require('../src/portable.cjs');
const { registerJoplin } = require('../src/index.cjs');

const note = () => ({ id: 'ABCDEF0123456789ABCDEF0123456789', title: '합성 기록 "Example"', body: '# 원문\n- [x] written checkbox\n![source](:/0123456789abcdef0123456789abcdef)', markup_language: 1, encryption_applied: 0, created_time: 1793613600000, updated_time: 1793615400000 });
const page = () => ({ uuid: '01234567-89ab-cdef-0123-456789abcdef', name: 'example', originalName: '예시 & Example', format: 'markdown', type: 'page', createdAt: 1793613600000, updatedAt: 1793615400000 });
const blocks = () => [{ uuid: 'aaaaaaaa-1111-2222-3333-444444444444', content: 'TODO 합성 글\ncontinued **original**', children: [{ uuid: 'bbbbbbbb-1111-2222-3333-444444444444', content: '- [x] 원문 체크박스 ((source))' }] }];
const graph = () => ({ name: 'Synthetic graph' });

test('native identity, true source timestamps and exact Joplin body survive export', () => {
  const original = note(), before = JSON.stringify(original), result = portable.fromJoplinNote(original, 42);
  assert.equal(result.id, original.id.toLowerCase());
  assert.ok(result.markdown.endsWith('\n\n' + original.body));
  assert.ok(result.markdown.includes('habitude_source: joplin\n'));
  assert.ok(result.markdown.includes('title: ' + JSON.stringify(original.title)));
  assert.ok(result.markdown.includes('created: "2026-11-02T10:00:00.000Z"'));
  assert.equal(result.filename, `habitude-joplin-${original.id.toLowerCase()}-42.md`);
  assert.equal(JSON.stringify(original), before);
});
test('export time never becomes an unknown source creation time', () => {
  const original = page(); delete original.createdAt; delete original.updatedAt;
  const result = portable.fromLogseqPage(original, blocks(), graph(), 99);
  assert.ok(!result.markdown.includes('\ncreated:'));
  assert.ok(!result.markdown.includes('\nupdated:'));
  assert.ok(result.filename.endsWith('-99.md'));
});
test('Logseq exports a deterministic block outline and preserves block contents and stable UUID', () => {
  const data = blocks(), before = JSON.stringify(data);
  const result = portable.fromLogseqPage(page(), data, graph(), 1);
  assert.equal(result.body, '- TODO 합성 글\n  continued **original**\n  - - [x] 원문 체크박스 ((source))');
  assert.ok(result.markdown.includes('habitude_source_id: "01234567-89ab-cdef-0123-456789abcdef"'));
  assert.ok(result.markdown.includes('source_url: "logseq://graph/Synthetic%20graph?page='));
  assert.equal(JSON.stringify(data), before);
});
test('unsupported or incomplete sources fail before output exists', () => {
  for (const original of [{ ...note(), id: '../../bad' }, { ...note(), markup_language: 2 }, { ...note(), encryption_applied: 1 }, { ...note(), title: 'bad\ntitle' }]) assert.throws(() => portable.fromJoplinNote(original));
  for (const original of [{ ...page(), format: 'org' }, { ...page(), type: 'whiteboard' }, { ...page(), uuid: '' }]) assert.throws(() => portable.fromLogseqPage(original, blocks(), graph()));
  assert.throws(() => portable.fromLogseqPage(page(), [[1, 'unresolved-child']], graph()));
});
test('bounded Unicode bytes, lines, trees and cycles reject partial export', () => {
  assert.throws(() => portable.fromJoplinNote({ ...note(), body: '가'.repeat(400000) }));
  assert.throws(() => portable.fromJoplinNote({ ...note(), body: '\r'.repeat(30000) }));
  const cyclic = blocks(); cyclic[0].children = cyclic;
  assert.throws(() => portable.serializeBlocks(cyclic));
  assert.throws(() => portable.serializeBlocks(Array(2001).fill(blocks()[0])));
  assert.equal(portable.escapeHtml('<img onerror="x"> &'), '&lt;img onerror=&quot;x&quot;&gt; &amp;');
});

async function joplinHarness(options = {}) {
  const commands = new Map(), writes = [], dialogs = [], messages = [], external = [], calls = { selected: 0 };
  const source = options.source === undefined ? note() : options.source;
  const host = {
    plugins: { register: ({ onStart }) => onStart() },
    settings: { registerSection: async () => {}, registerSettings: async () => {}, value: async () => options.language || 'en' },
    workspace: { selectedNote: async () => { calls.selected++; return source; } },
    commands: { register: async command => { commands.set(command.name, command); }, execute: async (...args) => { external.push(args); } },
    views: { dialogs: { create: async () => 'review', setHtml: async (_id, html) => { dialogs.push(html); }, setButtons: async () => {}, open: async () => options.open ? options.open() : ({ id: options.confirm === false ? 'cancel' : 'ok' }), showOpenDialog: async () => options.folders === undefined ? ['/synthetic'] : options.folders, showMessageBox: async text => { messages.push(text); } }, menuItems: { create: async () => {} }, toolbarButtons: { create: async () => {} } },
    require: name => { assert.equal(name, 'fs-extra'); return { writeFile: async (...args) => { writes.push(args); if (options.writeError) throw options.writeError; } }; },
  };
  await registerJoplin(host, portable);
  return { source, commands, writes, dialogs, messages, external, calls, export: () => commands.get('habitudeExportSelected').execute() };
}
test('Joplin does not read notes until the export command and cancellation writes nothing', async () => {
  const h = await joplinHarness({ confirm: false });
  assert.equal(h.calls.selected, 0); await h.export();
  assert.equal(h.calls.selected, 1); assert.equal(h.writes.length, 0);
  assert.equal(h.dialogs.at(-1), '');
});
test('Joplin requires a folder and uses exclusive private UTF-8 file creation without editing notes', async () => {
  const h = await joplinHarness(), before = JSON.stringify(h.source);
  await h.export(); assert.equal(h.writes.length, 1);
  const [target, contents, options] = h.writes[0];
  assert.ok(target.startsWith('/synthetic/habitude-joplin-abcdef'));
  assert.deepEqual(options, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  assert.ok(contents.endsWith(h.source.body)); assert.equal(JSON.stringify(h.source), before);
  assert.equal(h.external.length, 0);
  const cancelled = await joplinHarness({ folders: null }); await cancelled.export(); assert.equal(cancelled.writes.length, 0);
});
test('Joplin review escapes the title and never keeps it in the hidden dialog', async () => {
  const h = await joplinHarness({ source: { ...note(), title: '<img src=x onerror=bad()>' } });
  await h.export(); assert.ok(h.dialogs[0].includes('&lt;img')); assert.ok(!h.dialogs[0].includes('<img'));
  assert.equal(h.dialogs.at(-1), '');
});
test('Joplin emits finite errors, handles no selection, blocks traversal folder and never overwrites', async () => {
  const raw = new Error('private original body or path'); raw.code = 'EEXIST';
  const h = await joplinHarness({ writeError: raw }); await h.export();
  assert.ok(h.messages.at(-1).includes('already exists')); assert.ok(!h.messages.join().includes('private original'));
  const no = await joplinHarness({ source: null }); await no.export(); assert.equal(no.writes.length, 0);
  const path = await joplinHarness({ folders: ['relative-folder'] }); await path.export(); assert.equal(path.writes.length, 0);
});
test('Joplin rejects a second action while review is pending and opens Habitude with no note parameters', async () => {
  let resolve; const h = await joplinHarness({ open: () => new Promise(done => { resolve = done; }) });
  const first = h.export();
  while (!resolve) await new Promise(done => setImmediate(done));
  await h.export(); assert.equal(h.calls.selected, 1);
  resolve({ id: 'cancel' }); await first;
  await h.commands.get('habitudeOpen').execute();
  assert.deepEqual(h.external, [['openItem', 'https://habitude.ai']]);
});

