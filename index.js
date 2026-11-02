// Habitude local export plugin. No source-note writes or automated network calls.
(()=>{const portable=(()=>{const module={exports:{}};const exports=module.exports;
'use strict';

// This export envelope is shared with Habitude's explicit local file importer.
const MAX_BYTES = 1024 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
class ExportError extends Error {
  constructor(code) { super(code); this.code = code; }
}
function fail(code) { throw new ExportError(code); }
function bytes(text) {
  if (text.length > MAX_BYTES) fail('CONTENT_LIMIT');
  let length = 0;
  for (const character of text) {
    const point = character.codePointAt(0);
    if (point >= 0xd800 && point <= 0xdfff) fail('UNSUPPORTED_CONTENT');
    length += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (length > MAX_BYTES) fail('CONTENT_LIMIT');
  }
  return length;
}
function bodyText(value) {
  if (typeof value !== 'string' || value.includes('\0') || bytes(value) > MAX_BYTES || value.split(/\r\n|\r|\n/).length > 30000) fail('CONTENT_LIMIT');
  return value;
}
function titleText(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000 || /[\x00-\x1f\x7f\u2028\u2029]/.test(value)) fail('UNSUPPORTED_CONTENT');
  return value;
}
function isoDate(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}
function document(source, id, title, body, created, updated, sourceUrl, nonce) {
  const metadata = [
    '---', 'habitude_import_schema: 1', `habitude_source: ${source}`,
    `habitude_source_id: ${JSON.stringify(id)}`, `title: ${JSON.stringify(titleText(title))}`,
  ];
  if (created) metadata.push(`created: ${JSON.stringify(created)}`);
  if (updated) metadata.push(`updated: ${JSON.stringify(updated)}`);
  if (sourceUrl) metadata.push(`source_url: ${JSON.stringify(sourceUrl)}`);
  const exactBody = bodyText(body);
  const markdown = metadata.join('\n') + '\n---\n\n' + exactBody;
  if (bytes(markdown) > MAX_BYTES) fail('CONTENT_LIMIT');
  if (!Number.isSafeInteger(nonce) || nonce < 0) fail('UNSUPPORTED_CONTENT');
  return { source, id, title, body: exactBody, markdown, filename: `habitude-${source}-${id}-${nonce}.md` };
}
function fromJoplinNote(note, nonce = Date.now()) {
  if (!note || typeof note.id !== 'string' || !/^[a-f0-9]{32}$/i.test(note.id)) fail('NO_SELECTION');
  if (note.encryption_applied || note.markup_language !== 1) fail('UNSUPPORTED_CONTENT');
  const id = note.id.toLowerCase();
  return document('joplin', id, note.title, note.body, isoDate(note.created_time), isoDate(note.updated_time), `joplin://x-callback-url/openNote?id=${id}`, nonce);
}
function serializeBlocks(blocks) {
  if (!Array.isArray(blocks)) fail('UNSUPPORTED_CONTENT');
  const seen = new Set(), lines = [], pending = blocks.map(block => ({ block, depth: 0 })).reverse();
  let count = 0, length = 0;
  while (pending.length) {
    const { block, depth } = pending.pop();
    if (!block || typeof block !== 'object' || !UUID.test(block.uuid) || seen.has(block.uuid) || depth > 40 || ++count > 2000) fail('UNSUPPORTED_CONTENT');
    seen.add(block.uuid);
    if (block.format && block.format !== 'markdown') fail('UNSUPPORTED_CONTENT');
    const content = bodyText(block.content);
    const parts = content.split('\n');
    lines.push(`${'  '.repeat(depth)}- ${parts[0]}`);
    for (const part of parts.slice(1)) lines.push(`${'  '.repeat(depth + 1)}${part}`);
    length += bytes(content) + parts.length * (depth * 2 + 4);
    if (length > MAX_BYTES) fail('CONTENT_LIMIT');
    if (block.children !== undefined && !Array.isArray(block.children)) fail('UNSUPPORTED_CONTENT');
    for (const child of [...(block.children || [])].reverse()) pending.push({ block: child, depth: depth + 1 });
  }
  return bodyText(lines.join('\n'));
}
function fromLogseqPage(page, blocks, graph, nonce = Date.now()) {
  if (!page || !UUID.test(page.uuid) || typeof page.name !== 'string') fail('NO_SELECTION');
  if (page.format !== 'markdown' || ['whiteboard', 'property', 'hidden', 'class'].includes(page.type)) fail('UNSUPPORTED_CONTENT');
  if (!graph || typeof graph.name !== 'string' || !graph.name.trim() || graph.name.length > 1000) fail('UNSUPPORTED_CONTENT');
  const id = page.uuid.toLowerCase();
  const title = page.originalName || page.name;
  const url = `logseq://graph/${encodeURIComponent(graph.name)}?page=${encodeURIComponent(title)}`;
  return document('logseq', id, title, serializeBlocks(blocks), isoDate(page.createdAt), isoDate(page.updatedAt), url, nonce);
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
module.exports = { ExportError, MAX_BYTES, fromJoplinNote, fromLogseqPage, serializeBlocks, escapeHtml };

return module.exports;})();const {registerJoplin}=(()=>{const module={exports:{}};const exports=module.exports;
'use strict';

const TEXT = {
  ko: {
    none: '먼저 Markdown 기록 하나를 선택해 주세요.',
    unsupported: '이 기록은 내보낼 수 없는 형식이거나 크기 제한을 초과했습니다. 원본은 유지됩니다.',
    title: 'Habitude로 기록 내보내기', cancel: '취소', confirm: '폴더 선택 및 내보내기',
    note: '선택한 기록의 저장된 Markdown 내용을 파일로 만듭니다. 현재 Habitude 파일 가져오기는 텍스트 전용이며 첨부 참조가 있으면 미리보기에서 중단됩니다. 내보낸 파일의 원래 첨부 링크는 유지하고 원본 파일은 복사하지 않습니다. 체크박스는 글로 보존됩니다.',
    next: 'Habitude 설정 → 데이터 → 파일 가져오기에서 Joplin을 선택해 이 파일을 가져오세요.',
    folder: 'Habitude Markdown 파일을 저장할 폴더', saved: '파일을 저장했습니다. ',
    exists: '같은 파일이 이미 있습니다. 다른 폴더를 선택하거나 이전 파일을 이동한 뒤 다시 내보내세요.',
    failed: '파일을 내보내지 못했습니다. 원본은 그대로 유지됩니다. 폴더 권한을 확인하고 다시 시도해 주세요.',
  },
  en: {
    none: 'Select one Markdown note first.',
    unsupported: 'This note has an unsupported format or exceeds the export limit. The original is kept.',
    title: 'Export a note for Habitude', cancel: 'Cancel', confirm: 'Choose folder and export',
    note: 'Exports the saved Markdown of the selected note. Habitude file import currently accepts text only and stops at preview if attachment references are present. The export keeps original attachment links without copying their files. Checkboxes remain writing.',
    next: 'In Habitude, open Settings → Data → File import, select Joplin, and choose this file.',
    folder: 'Folder for the Habitude Markdown file', saved: 'File saved. ',
    exists: 'That export file already exists. Choose another folder or move the previous file, then retry.',
    failed: 'Could not export the file. The original note is kept. Check folder permissions and retry.',
  },
};

function registerJoplin(joplin, portable) {
  return joplin.plugins.register({
    onStart: async () => {
      let busy = false;
      await joplin.settings.registerSection('habitude', { label: 'Habitude', iconName: 'fas fa-book' });
      await joplin.settings.registerSettings({ language: { value: 'ko', type: 2, section: 'habitude', public: true, isEnum: true, options: { ko: '한국어', en: 'English' }, label: '언어 / Language' } });
      const dialog = await joplin.views.dialogs.create('habitudeExportReview');
      await joplin.commands.register({
        name: 'habitudeExportSelected', label: 'Habitude: 선택 기록 내보내기 / Export selected note', iconName: 'fas fa-file-export', enabledCondition: 'oneNoteSelected',
        execute: async () => {
          if (busy) return;
          busy = true;
          let text = TEXT.ko;
          try {
            text = TEXT[await joplin.settings.value('language')] || TEXT.ko;
            const note = await joplin.workspace.selectedNote();
            if (!note) { await joplin.views.dialogs.showMessageBox(text.none); return; }
            const exported = portable.fromJoplinNote(note);
            await joplin.views.dialogs.setHtml(dialog, `<h2>${text.title}</h2><h3>${portable.escapeHtml(exported.title)}</h3><p>${text.note}</p><p>${text.next}</p>`);
            await joplin.views.dialogs.setButtons(dialog, [{ id: 'cancel', title: text.cancel }, { id: 'ok', title: text.confirm }]);
            const decision = await joplin.views.dialogs.open(dialog);
            if (!decision || decision.id !== 'ok') return;
            const folders = await joplin.views.dialogs.showOpenDialog({ title: text.folder, properties: ['openDirectory', 'createDirectory'] });
            if (!folders || folders.length !== 1) return;
            const folder = folders[0];
            if (typeof folder !== 'string' || /[\x00-\x1f]/.test(folder) || folder.length > 4096 || !(/^(?:\/|[a-z]:[\\/])/i.test(folder))) throw new Error('INVALID_EXPORT_FOLDER');
            const separator = folder.includes('\\') && !folder.includes('/') ? '\\' : '/';
            const path = folder.replace(/[\\/]+$/, '') + separator + exported.filename;
            const fs = joplin.require('fs-extra');
            await fs.writeFile(path, exported.markdown, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
            await joplin.views.dialogs.showMessageBox(text.saved + text.next);
          } catch (error) {
            const message = error instanceof portable.ExportError ? (error.code === 'NO_SELECTION' ? text.none : text.unsupported)
              : error && error.code === 'EEXIST' ? text.exists : text.failed;
            await joplin.views.dialogs.showMessageBox(message);
          } finally {
            // The private note title is not retained in the hidden review dialog.
            await joplin.views.dialogs.setHtml(dialog, '').catch(() => undefined);
            busy = false;
          }
        },
      });
      await joplin.commands.register({ name: 'habitudeOpen', label: 'Habitude 열기 / Open Habitude', iconName: 'fas fa-external-link-alt', execute: async () => { await joplin.commands.execute('openItem', 'https://habitude.ai'); } });
      await joplin.views.menuItems.create('habitudeExportSelectedMenu', 'habitudeExportSelected', 'tools');
      await joplin.views.menuItems.create('habitudeOpenMenu', 'habitudeOpen', 'tools');
      await joplin.views.toolbarButtons.create('habitudeExportSelectedToolbar', 'habitudeExportSelected', 'noteToolbar');
    },
  });
}
module.exports = { registerJoplin };

return module.exports;})();registerJoplin(joplin,portable);})();
