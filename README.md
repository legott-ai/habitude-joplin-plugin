# Habitude for Joplin · 0.1.0 preview

한국어: Joplin의 선택한 Markdown 기록을 Habitude에서 가져올 수 있는 파일로 내보냅니다. **Tools → Habitude: 선택 기록 내보내기** 또는 기록 도구 모음의 내보내기를 누른 뒤 제목을 확인하고 저장할 폴더를 고르세요. Habitude의 **설정 → 데이터 → 파일 가져오기 → Joplin**에서 파일을 선택하고 미리 본 뒤 가져옵니다. **Tools → Habitude 열기**는 본문을 전송하지 않고 Habitude 웹사이트를 엽니다. 플러그인 설정의 언어에서 한국어·English를 선택합니다.

English: Select one Markdown note and choose **Tools → Habitude: Export selected note**, or the note toolbar export button. Review the title and choose a destination folder. In Habitude, use **Settings → Data → File import → Joplin**, preview the file and confirm import. **Tools → Open Habitude** opens the Habitude website without including note content. Choose Korean or English in the plugin's settings.

## Install / 설치

Joplin desktop → Settings/Preferences → Plugins → Advanced settings → Install from file → choose `habitude-joplin-0.1.0.jpl`, then restart Joplin. This is a manually installable preview. A downloadable release is separate from acceptance into Joplin's plugin directory.

데스크톱 Joplin의 설정 → 플러그인 → 고급 설정 → 파일에서 설치에서 `.jpl`을 선택하고 Joplin을 다시 시작합니다. 모바일 플러그인으로 등록하지 않습니다.

## What is preserved

- Reads only the selected note after the export command. The current saved Markdown is exported; finish typing and let Joplin save before exporting.
- Uses the native note ID plus real creation/modification timestamps for repeat imports. Local notes are never edited or deleted.
- Creates a new UTF-8 file exclusively (`wx`, mode `0600`). An existing destination is never overwritten.
- Attachment/resource links remain original Joplin links. Their binary originals are **not** copied; this export is not an attachment backup.
- Habitude's file importer currently accepts text only. A note containing local/resource attachment references is refused at import preview; the original export stays available. This preview does not claim those notes were imported.
- No account, analytics, automatic network request, background graph scan or habit-completion mapping.
- Export limit: 1 MiB and 30,000 lines. Encrypted placeholders, HTML notes and unsupported input stop with a fixed message.

이 기능은 명시적으로 파일을 교환하는 연결입니다. 자동·실시간·양방향 동기화가 아닙니다. 첨부 원본이 필요하면 Joplin의 원본 내보내기도 함께 보관하세요.

## Verification

Host API contract and package contents are tested with synthetic notes. Joplin itself was not installed in the build environment, so an actual Joplin GUI smoke test is not claimed. Treat this release as a preview until that test is recorded.

Official APIs used: [workspace.selectedNote](https://joplinapp.org/api/references/plugin_api/classes/joplinworkspace.html#selectednote), [dialogs](https://joplinapp.org/api/references/plugin_api/classes/joplinviewsdialogs.html), [commands](https://joplinapp.org/api/references/plugin_api/classes/joplincommands.html), [plugin manifest](https://joplinapp.org/help/api/references/plugin_manifest/). The package is an uncompressed portable tar with `manifest.json` and `index.js`, matching the [official generator's package format](https://github.com/laurent22/joplin/blob/dev/packages/generator-joplin/generators/app/templates/webpack.config.js).

## Build this source repository

Run `npm test`, then `npm run build`. No npm dependencies are required. The builder regenerates `index.js` and a portable `.jpl` in `dist/`. The public source package metadata contains developer scripts; release packages are pinned separately by their published SHA-256.
