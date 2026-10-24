/* building.html: REAL import progress. Reads the pending import (set on the landing page),
   runs it (GitHub through the API route; .zip / folder parsed in this browser), stores the
   project in IndexedDB and opens workspace.html. With nothing pending it says so and links back to the import plate (no sample). */
(function () {
  'use strict';
  var CL = window.CodeLens;
  var q = new URLSearchParams(location.search);
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s) { return document.querySelector(s); };
  var srcEl = $('[data-src]'), nameEl = $('[data-name]');
  var steps = [].slice.call(document.querySelectorAll('[data-step]'));
  var bar = $('.bd__bar'), fill = bar.firstElementChild, fileEl = $('[data-file]'), full = $('.bd__full'), errEl = $('[data-err]');
  var shown = 0, target = 0, step = 0, failed = false;
  function setStep(k) { step = Math.max(step, k); steps.forEach(function (s, i) { s.classList.toggle('is-done', i < step); s.classList.toggle('is-on', i === step && !failed); }); }
  function setDetail(i, text, html) { var el = $('[data-d' + i + ']'); if (!el) return; if (html) el.innerHTML = text; else el.textContent = text; }
  function frame() {
    shown += (target - shown) * (reduce ? 1 : 0.12);
    fill.style.transform = 'scaleX(' + shown.toFixed(4) + ')';
    bar.setAttribute('aria-valuenow', Math.round(shown * 100));
    var r = Math.max(0, Math.min(1, (shown - 0.55) / 0.4));
    full.style.clipPath = reduce ? 'none' : 'inset(0 ' + ((1 - r) * 100).toFixed(2) + '% 0 0)';
    full.style.opacity = reduce ? r : 1;
    if (!failed) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var base = function (p) { return p.split('/').pop(); };

  // stage -> [step, share of the bar]
  var RANGE = { repo: [0, 0, 0.06], tree: [0, 0.06, 0.16], download: [0, 0.16, 0.42], read: [0, 0.16, 0.5], analyze: [2, 0.5, 0.72], city: [3, 0.72, 0.8] };
  function onProgress(e) {
    var r = RANGE[e.stage] || [0, 0, 0.1];
    setStep(r[0]);
    target = Math.max(target, r[1] + (r[2] - r[1]) * Math.max(0, Math.min(1, e.ratio == null ? 0.5 : e.ratio)));
    var txt = { repo: 'Checking ', tree: 'File tree: ', download: 'Downloading the source: ', read: 'Reading ', analyze: 'Analyzing: ', city: '' }[e.stage] || '';
    if (e.detail) { fileEl.textContent = txt + e.detail; if (r[0] === 0) setDetail(0, e.detail); else setDetail(2, e.detail); }
  }
  function fail(err) {
    failed = true;
    steps.forEach(function (s, i) { s.classList.toggle('is-on', false); s.classList.toggle('is-bad', i === step); });
    var msg = err && err.message ? err.message : String(err);
    if (err && err.resetAt) msg += ' The limit resets at ' + new Date(err.resetAt * (err.resetAt < 1e12 ? 1000 : 1)).toLocaleTimeString() + '.';
    errEl.hidden = false; errEl.textContent = msg;
    fileEl.textContent = 'Import failed.';
    $('[data-chip]').textContent = 'Import failed';
    var back = $('[data-back]'); back.textContent = 'Back to import';
  }
  // signed-in users: add the import to their history (contents never sent); guests get the note in the workspace
  function saveHistory(project) {
    var done = function (r) { try { sessionStorage.setItem('codelens.saved', JSON.stringify({ saved: !!(r && r.saved) })); } catch (e) { /* private mode */ } };
    if (!CL.recordHistory) return Promise.resolve();
    return Promise.race([CL.recordHistory(project), new Promise(function (r) { setTimeout(function () { r({ saved: false }); }, 5000); })]).then(done, function () { done(null); });
  }
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, reduce ? 0 : ms); }); };

  CL.getPending().catch(function () { return null; }).then(function (p) {
    if (!p) {
      failed = true;
      nameEl.textContent = 'nothing yet'; srcEl.textContent = 'No import';
      var body = $('[data-body]'); if (body) body.textContent = 'There is no project to build yet. CodeLens only builds cities from your own code: a public GitHub link, a .zip or a folder.';
      document.title = 'Nothing to build · CodeLens';
      steps.forEach(function (s) { s.classList.remove('is-on'); });
      errEl.hidden = false; errEl.textContent = 'Nothing to build. Import a repo first: paste a GitHub link, or drop a .zip or folder.';
      fileEl.textContent = 'Nothing imported.'; $('[data-chip]').textContent = 'Nothing to build';
      var back = $('[data-back]'); back.textContent = 'Go to the import plate'; back.setAttribute('href', 'index.html#your-repo');
      return;
    }
    var okShape = typeof p === 'object' && typeof p.name === 'string' &&
      ((p.src === 'github' && typeof p.url === 'string') || (p.src === 'zip' && p.file instanceof Blob) ||
       (p.src === 'folder' && Array.isArray(p.files) && p.files.every(function (f) { return f && f.file instanceof Blob && typeof f.path === 'string'; })));
    if (!okShape) {
      CL.clearPending().catch(function () {});
      throw new Error('The saved import could not be read. Go back and import the repo again.');
    }
    nameEl.textContent = p.name;
    srcEl.textContent = p.src === 'github' ? 'From github.com/' + p.name : p.src === 'zip' ? 'From ' + p.name + ', read in your browser' : 'From your folder, ' + p.files.length.toLocaleString() + ' files, read in your browser';
    setStep(0);
    return CL.runImport(p, onProgress).then(function (project) {
      var st = project.stats;
      setDetail(0, st.filesCounted.toLocaleString() + ' files' + (st.filesSkipped ? ', ' + st.filesSkipped.toLocaleString() + ' skipped (node_modules, builds, binaries...)' : ''));
      setStep(1);
      var secrets = project.files.filter(function (f) { return f.secret; });
      setDetail(1, secrets.length ? secrets.slice(0, 3).map(function (f) { return '<code>' + esc(base(f.path)) + '</code>'; }).join(', ') + (secrets.length > 3 ? ' and ' + (secrets.length - 3) + ' more' : '') + ' never opened. ' + (secrets.length === 1 ? 'It becomes' : 'They become') + ' the vault: names only.' : 'No secrets files found. Nothing to lock away.', true);
      return wait(450).then(function () {
        setStep(2);
        var top = project.files.filter(function (f) { return f.uses.length; }).sort(function (a, b) { return b.usedBy.length - a.usedBy.length || b.uses.length - a.uses.length; })[0];
        setDetail(2, top ? '<code>' + esc(base(top.path)) + '</code> uses ' + top.uses.slice(0, 3).map(function (u) { return '<code>' + esc(base(u)) + '</code>'; }).join(', ') + (top.uses.length > 3 ? ' and ' + (top.uses.length - 3) + ' more' : '') + ' · ' + st.imports.toLocaleString() + ' imports in total' : 'No imports between files found (JS/TS/Python/CSS are read).', true);
        target = Math.max(target, 0.76);
        return wait(450);
      }).then(function () {
        setStep(3);
        var plan = CL.plan(project);
        setDetail(3, plan.stats.districts + ' blocks on a ' + (plan.XL.length - 1) + ' × ' + (plan.ZL.length - 1) + ' road grid' + (plan.stats.aggregatedFiles ? ', ' + plan.stats.aggregatedFiles.toLocaleString() + ' small files grouped' : ''));
        target = 0.88;
        return wait(450).then(function () { return plan; });
      }).then(function (plan) {
        setStep(4);
        var tall = plan.buildings.filter(function (b) { return !b.members; }).sort(function (a, b) { return b.score - a.score; })[0];
        var f = tall && project.files.find(function (x) { return x.path === tall.id; });
        setDetail(4, f ? 'Tallest: <code>' + esc(base(f.path)) + '</code>, ' + f.lines.toLocaleString() + ' lines · ' + plan.stats.buildings.toLocaleString() + ' buildings' : plan.stats.buildings + ' buildings', true);
        return CL.saveProject(project).then(function () { return saveHistory(project); });
      }).then(function () { return CL.clearPending(); }).then(function () {
        target = 1; setStep(5); fileEl.textContent = 'Done. Opening the workspace.';
        return wait(700);
      }).then(function () { if (!q.has('hold')) location.replace('workspace.html'); });
    });
  }).catch(fail);
})();
