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
