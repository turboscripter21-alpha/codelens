/* Focus mode: double-click a building (or a file in the tree). The file opens
   on the left in a read-only Monaco editor themed like VS Code Light Modern;
   the building floats alone on the right. The source is the imported project's real file. */
import { createLevitator } from './levitate.js';

/* Wiring: the workspace hands us the real source, the building and the project name. */
let sourceOf = async () => ({ kind: 'missing', message: 'No source.' });
let buildingOf = () => null;
let projectName = '';
export function setSourceProvider(fn) { sourceOf = fn; }
export function setBuildingProvider(fn) { buildingOf = fn; }
export function setProjectName(n) { projectName = n; }
const EXT = { js: ['javascript', 'JavaScript'], css: ['css', 'CSS'], html: ['html', 'HTML'], svg: ['xml', 'SVG'], yml: ['yaml', 'YAML'], yaml: ['yaml', 'YAML'],
  json: ['json', 'JSON'], md: ['markdown', 'Markdown'], gitignore: ['plaintext', 'Ignore'], ts: ['typescript', 'TypeScript'], tsx: ['typescript', 'TypeScript JSX'], mts: ['typescript', 'TypeScript'], cts: ['typescript', 'TypeScript'],
  jsx: ['javascript', 'JavaScript JSX'], mjs: ['javascript', 'JavaScript'], cjs: ['javascript', 'JavaScript'], py: ['python', 'Python'], scss: ['scss', 'SCSS'], less: ['less', 'Less'],
  htm: ['html', 'HTML'], xml: ['xml', 'XML'], sh: ['shell', 'Shell Script'], bash: ['shell', 'Shell Script'], go: ['go', 'Go'], rs: ['rust', 'Rust'], java: ['java', 'Java'],
  kt: ['kotlin', 'Kotlin'], swift: ['swift', 'Swift'], c: ['c', 'C'], h: ['c', 'C'], cpp: ['cpp', 'C++'], cc: ['cpp', 'C++'], hpp: ['cpp', 'C++'], cs: ['csharp', 'C#'],
  php: ['php', 'PHP'], rb: ['ruby', 'Ruby'], sql: ['sql', 'SQL'], toml: ['ini', 'TOML'], ini: ['ini', 'Ini'], vue: ['html', 'Vue'], svelte: ['html', 'Svelte'],
  graphql: ['graphql', 'GraphQL'], lua: ['lua', 'Lua'], r: ['r', 'R'], dart: ['dart', 'Dart'], scala: ['scala', 'Scala'], txt: ['plaintext', 'Plain Text'] };
const LANG = p => {
  const n = p.split('/').pop().toLowerCase(), e = n.includes('.') ? n.split('.').pop() : '';
  if (n === 'dockerfile') return ['dockerfile', 'Dockerfile'];
  if (n.startsWith('.env')) return ['ini', 'Properties'];
  return (Object.prototype.hasOwnProperty.call(EXT, e) && EXT[e]) || ['plaintext', 'Plain Text'];
};

const $ = (s, r = document) => r.querySelector(s);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MONACO = 'app/vendor/monaco/vs';

/* ---- Monaco, loaded on first use from the local copy (works offline) ---- */
let monacoP = null;
function loadMonaco() {
  if (monacoP) return monacoP;
  monacoP = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = MONACO + '/loader.js';
    s.onload = () => {
      window.require.config({ paths: { vs: MONACO } });
      window.require(['vs/editor/editor.main'], () => res(window.monaco), rej);
    };
    s.onerror = rej;
    document.head.appendChild(s);
  }).then(setupMonaco);
  return monacoP;
}

const CTRL = ['import', 'export', 'from', 'default', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'await', 'as'];
async function setupMonaco(monaco) {
  // VS Code "Light Modern" look: editor chrome + Light+ token colours.
  monaco.editor.defineTheme('codelens-light-modern', {
    base: 'vs', inherit: true,
    rules: [
      { token: '', foreground: '3B3B3B' },
      { token: 'keyword', foreground: '0000FF' },
      { token: 'keyword.control', foreground: 'AF00DB' },
      { token: 'entity.name.function', foreground: '795E26' },
      { token: 'identifier', foreground: '001080' },
      { token: 'type.identifier', foreground: '267F99' },
      { token: 'string', foreground: 'A31515' },
      { token: 'string.escape', foreground: 'EE0000' },
      { token: 'comment', foreground: '008000' },
      { token: 'number', foreground: '098658' },
      { token: 'delimiter', foreground: '3B3B3B' },
      { token: 'tag', foreground: '800000' },
      { token: 'metatag', foreground: '800000' },
      { token: 'attribute.name', foreground: 'E50000' },
      { token: 'attribute.value', foreground: '0000FF' },
      { token: 'attribute.value.html', foreground: '0000FF' },
      { token: 'attribute.name.css', foreground: 'E50000' },
      { token: 'attribute.value.css', foreground: '0451A5' },
      { token: 'attribute.value.number.css', foreground: '098658' },
      { token: 'attribute.value.unit.css', foreground: '098658' },
      { token: 'attribute.value.hex.css', foreground: 'A31515' },
      { token: 'tag.css', foreground: '800000' },
      { token: 'string.key.json', foreground: '0451A5' },
      { token: 'string.value.json', foreground: 'A31515' },
      { token: 'number.json', foreground: '098658' },
      { token: 'keyword.json', foreground: '0000FF' },
      { token: 'type.yaml', foreground: '800000' },
      { token: 'keyword.md', foreground: '800000' },
      { token: 'variable.md', foreground: '0451A5' },
      { token: 'key.ini', foreground: '0451A5' },
      { token: 'comment.ini', foreground: '008000' },
    ],
    colors: {
      'editor.background': '#FFFFFF',
      'editor.foreground': '#3B3B3B',
      'editorLineNumber.foreground': '#6E7681',
      'editorLineNumber.activeForeground': '#171184',
      'editor.lineHighlightBackground': '#00000000',
      'editor.lineHighlightBorder': '#EEEEEE',
      'editor.selectionBackground': '#ADD6FF',
      'editor.inactiveSelectionBackground': '#E5EBF1',
      'editorIndentGuide.background1': '#D3D3D3',
      'editorIndentGuide.activeBackground1': '#939393',
      'editorGutter.background': '#FFFFFF',
      'editorCursor.foreground': '#000000',
      'editorWhitespace.foreground': '#D3D3D3',
      'editorBracketMatch.border': '#B9B9B9',
      'minimap.background': '#FFFFFF',
      'scrollbarSlider.background': '#64646466',
      'editorOverviewRuler.border': '#E5E5E5',
      'focusBorder': '#005FB8',
    },
  });
  // JavaScript with VS Code-style colours, tokenised in the page (no language
  // worker needed): control keywords purple, calls brown, the rest as Light+.
  const js = monaco.languages.getLanguages().find(l => l.id === 'javascript');
  const mod = js && js.loader ? await js.loader() : null;
  if (mod && mod.language) {
    const lang = JSON.parse(JSON.stringify(mod.language, (k, v) => v instanceof RegExp ? { __re: v.source, __f: v.flags } : v),
      (k, v) => v && v.__re !== undefined ? new RegExp(v.__re, v.__f) : v);
    lang.ctrl = CTRL; lang.keywords = (lang.keywords || []).filter(k => !CTRL.includes(k));
    const t = lang.tokenizer;
    const ident = [/#?[a-z_$][\w$]*(?=\s*\()/, { cases: { '@ctrl': 'keyword.control', '@keywords': 'keyword', '@default': 'entity.name.function' } }];
    const plain = [/#?[a-z_$][\w$]*/, { cases: { '@ctrl': 'keyword.control', '@keywords': 'keyword', '@default': 'identifier' } }];
    const caps = [/[A-Z][\w$]*/, 'type.identifier'];
    (t.common || t.root).unshift(ident, plain, caps);
    monaco.languages.register({ id: 'js-lm' });
    monaco.languages.setMonarchTokensProvider('js-lm', lang);
    if (mod.conf) monaco.languages.setLanguageConfiguration('js-lm', mod.conf);
  }
  return monaco;
}

/* ---- the panel ---- */
let editor = null, lev = null, open = false, current = null;
const el = () => $('.ws-focus');

function crumbs(p) {
  const parts = [projectName, ...p.split('/')];
  $('[data-crumbs]').replaceChildren(...parts.flatMap((x, i) => {
    const s = document.createElement('span'); s.textContent = x; if (i === parts.length - 1) s.className = 'is-file';
    if (i === 0) return [s];
    const sep = document.createElement('i'); sep.setAttribute('aria-hidden', 'true'); return [sep, s];
  }));
}

function status(line, col, langName) {
  $('[data-pos]').textContent = `Ln ${line}, Col ${col}`;
  $('[data-lang]').textContent = langName;
}

async function showCode(p) {
  const [lang, langName] = LANG(p);
  $('[data-ftab]').textContent = p.split('/').pop();
  $('.vsc-tab').dataset.kind = lang;
  crumbs(p);
  const host = $('[data-editor]'), none = $('[data-binary]');
  const src = await sourceOf(p);
  if (current !== p) return;
  if (src.kind !== 'text') {
    host.hidden = true; none.hidden = false; status(1, 1, src.kind === 'secret' ? 'Secret' : src.kind === 'binary' ? 'Binary' : 'Not available');
    $('[data-binary-msg]').textContent = src.kind === 'secret' ? 'Vault: contents never read. ' + src.message : src.message;
    $('[data-vscnote]').textContent = 'Read only';
    return;
  }
  const code = src.text;
  $('[data-vscnote]').textContent = 'Read only' + (src.note ? ' · ' + src.note.toLowerCase() : '') + (src.truncated ? ' · first ' + code.split('\n').length + ' lines' : '');
  host.hidden = false; none.hidden = true;
  status(1, 1, langName);
  let monaco;
  try { monaco = await loadMonaco(); } catch (err) { console.warn('[codelens] Monaco did not load', err); return; }
  if (current !== p) return;                               // user moved on while loading
  const id = lang === 'javascript' && monaco.languages.getLanguages().some(l => l.id === 'js-lm') ? 'js-lm' : lang;
  const model = monaco.editor.createModel(code, id);
  if (!editor) {
    editor = monaco.editor.create(host, {
      model, theme: 'codelens-light-modern', readOnly: true, domReadOnly: true, automaticLayout: true,
      fontFamily: "Consolas, 'Cascadia Mono', 'Courier New', 'Geist Mono', monospace", fontSize: 14, lineHeight: 19,
      minimap: { enabled: true, renderCharacters: false, scale: 1 }, scrollBeyondLastLine: false, renderLineHighlight: 'line',
      tabSize: 2, guides: { indentation: true }, scrollbar: { verticalScrollbarSize: 14, horizontalScrollbarSize: 10 },
      padding: { top: 4 }, contextmenu: false, quickSuggestions: false, occurrencesHighlight: 'off', links: false,
      renderValidationDecorations: 'off', stickyScroll: { enabled: false },
    });
    editor.onDidChangeCursorPosition(e => status(e.position.lineNumber, e.position.column, LANG(current)[1]));
  } else {
    const old = editor.getModel(); editor.setModel(model); old && old.dispose();
  }
  const line = 1;
  editor.setPosition({ lineNumber: line, column: 1 }); editor.revealLineInCenterIfOutsideViewport(line);
  status(line, 1, langName);
}

export function enterFocus(p, file) {
  current = p;
  const f = el(); f.hidden = false; document.body.classList.add('is-focus'); open = true;
  if (!lev) { lev = createLevitator($('[data-lev]'), { reduce }); window.__codelensLev = lev; }
  lev.show(p, buildingOf(p)); lev.start();
  $('[data-ftitle]').textContent = p.split('/').pop();
  showCode(p);
  $('.ws-focus__back').focus({ preventScroll: true });
}
export function exitFocus() {
  if (!open) return;
  open = false; el().hidden = true; document.body.classList.remove('is-focus');
  lev && lev.stop();
  const sel = document.querySelector('.ws-spot[aria-current]'); sel && sel.focus({ preventScroll: true });
}
export function isFocus() { return open; }
export const _review = { at: t => lev && lev.at(t), monaco: () => monacoP };

addEventListener('keydown', e => { if (e.key === 'Escape' && open && !document.querySelector('dialog[open]') && !(e.target.closest && e.target.closest('.ws-talk, .ws-bar'))) exitFocus(); });
