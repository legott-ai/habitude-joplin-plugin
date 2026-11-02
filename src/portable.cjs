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
