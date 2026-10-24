/* CodeLens prototype: page-local behaviour. The engine is untouched; everything
   here reads scroll position or pointer state and writes transforms, opacity,
   clip-path or attributes on this page's own markup. The import plate hands the
   user's GitHub link / .zip / folder to building.html (via window.CodeLens). */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  ScrollCraft.mount(document.body);

  /* ---------------------------------------------------------- the line -- */
  var stops = $$('[data-cl-stop]');
  var links = $$('.cl-line__stops a');
  var nowEl = $('.cl-line__now');
  var stopsList = $('.cl-line__stops');
  var current = '';
  function updateLine() {
    var y = innerHeight * 0.42, idx = 0;
    for (var i = 0; i < stops.length; i++) if (stops[i].getBoundingClientRect().top <= y) idx = i;
    var id = stops[idx].id;
    var doc = document.documentElement, max = doc.scrollHeight - innerHeight;
    stopsList.style.setProperty('--line-fill', (max > 0 ? scrollY / max : 0).toFixed(4));
    if (id === current) return;
    current = id;
    links.forEach(function (a, k) {
      if (k === idx) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
      a.classList.toggle('is-past', k < idx);
    });
    if (nowEl) nowEl.textContent = links[idx].textContent.trim();
  }

  /* ---------------------------------------------------- hero pointer depth -- */
  var hero = $('.cl-hero'), px = 0, py = 0, tx = 0, ty = 0;
  if (fine && !reduce && hero) {
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * 2 - 1; ty = ((e.clientY - r.top) / r.height) * 2 - 1;
    });
    hero.addEventListener('pointerleave', function () { tx = 0; ty = 0; });
  }

  /* ------------------------------------- BUILD: the tree builds the city -- */
  // The pile and the build are one act (#pile): the first stretch is the pile's
  // question, then the tree lights line by line and the city builds beside it.
  var build = $('#pile.cl-merge'), stage = build && $('.cl-build__stage', build), city = $('.cl-city', build);
  var lines = $$('[data-file]', build);
  var B0 = 0.18;                                  // act progress where the build begins
  function buildP(P) { return clamp((P - B0) / (1 - B0), 0, 1); }
  var bimg = {}, bbox = {};
  $$('.cl-bw', build).forEach(function (w) {
    var k = w.getAttribute('data-b'), im = $('.cl-b', w); bbox[k] = w; bimg[k] = im;
    function check() { if (im.complete && !im.naturalWidth) console.warn('[codelens] building image did not load:', im.currentSrc || im.src); }
    im.addEventListener('error', function () { console.warn('[codelens] building image failed:', im.src); });
    if (im.complete) check(); else im.addEventListener('load', check);
  });
  var order = lines.map(function (li) { return li.getAttribute('data-file'); });
  var artery = $('.cl-city__artery', build), traffic = $('.cl-city__traffic', build);
  var lead = $('.cl-city__lead path', build), dot = $('.cl-city__lead circle', build);
  var chipFile = $('.cl-build__chip-file', build), chipKind = $('.cl-build__chip-kind', build);
  var KIND = { 'src/App.js': 'tall · core', 'src/index.js': 'tall · core', 'src/components/Navbar/Navbar.js': 'medium', 'src/hooks/useAuth.js': 'medium', 'src/utils/helpers.js': 'medium', '.github/workflows/main.yml': 'medium', 'package.json': 'medium', '.env.example': 'vault' };
  var START = 0.03, END = 0.76, N = order.length, STEP = (END - START) / N, DUR = STEP * 1.8;
  var lastBuildP = -1, lastNow = -2;
  function actP(el) { var r = el.getBoundingClientRect(); return clamp(-r.top / Math.max(r.height - innerHeight, 1), 0, 1); }
  function renderBuild(P) {
    var p = buildP(P), now = -1, done = 0;
    city.style.opacity = clamp((P - 0.1) / 0.1, 0, 1).toFixed(3);
    for (var i = 0; i < N; i++) {
      var u = clamp((p - (START + i * STEP)) / DUR, 0, 1), e = ease(u), im = bimg[order[i]];
      if (u >= 1) done++;
      if (u > 0) now = i;
      if (u >= 1) { im.style.opacity = ''; im.style.transform = ''; }   // finished: plain CSS, nothing inline
      else if (reduce) { im.style.opacity = u > 0 ? '' : '0'; im.style.transition = 'opacity 300ms'; im.style.transform = ''; }
      else if (u <= 0) { im.style.opacity = '0'; im.style.transform = 'translateY(100%)'; }
      else {
        im.style.opacity = clamp(e * 2.4, 0, 1).toFixed(3);
        im.style.transform = 'translateY(' + ((1 - e) * 100).toFixed(2) + '%)';
      }
      lines[i].classList.toggle('is-done', u > 0);
    }
    var glow = clamp((p - 0.8) / 0.06, 0, 1), traf = clamp((p - 0.86) / 0.07, 0, 1);
    if (reduce) { glow = glow > 0 ? 1 : 0; traf = traf > 0 ? 1 : 0; }
    artery.style.opacity = glow.toFixed(3); traffic.style.opacity = traf.toFixed(3);
    if (p > END + DUR) now = -1;
    if (now !== lastNow) {
      lines.forEach(function (li, k) { li.classList.toggle('is-now', k === now); });
      if (chipFile) { chipFile.textContent = now < 0 ? (p < START ? 'my-app/' : 'my-app/ built') : order[now]; chipKind.textContent = now < 0 ? (p < START ? 'empty plots' : '19 buildings') : (KIND[order[now]] || 'small shop'); }
      lastNow = now;
    }
    // leader line from the lit tree line to the rising building's plot
    if (now >= 0 && !reduce && innerWidth > 860) {
      var cr = city.getBoundingClientRect(), lr = (lines[now].querySelector('b') || lines[now]).getBoundingClientRect(), im2 = bbox[order[now]];
      var bx = parseFloat(im2.style.getPropertyValue('--bx')) / 100 * cr.width, by = parseFloat(im2.style.getPropertyValue('--by')) / 100 * cr.height;
      var sx = lr.right - cr.left + 6, sy = lr.top + lr.height / 2 - cr.top;
      var mx = sx + (bx - sx) * 0.55;
      lead.setAttribute('d', 'M' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ' C ' + mx.toFixed(1) + ' ' + sy.toFixed(1) + ', ' + mx.toFixed(1) + ' ' + by.toFixed(1) + ', ' + bx.toFixed(1) + ' ' + by.toFixed(1));
      dot.setAttribute('cx', bx.toFixed(1)); dot.setAttribute('cy', by.toFixed(1));
      lead.parentNode.style.opacity = '1';
    } else lead.parentNode.style.opacity = '0';
    // mobile: pan the wide city so the rising building stays in view
    if (innerWidth <= 860) {
      var target = now >= 0 ? order[now] : 'src/App.js';
      var bxp = parseFloat(bbox[target].style.getPropertyValue('--bx'));
      city.style.setProperty('--pan', (-(bxp / 100) * 100 + (100 / 2.35) * 0.5 * 1).toFixed(2) + '%');
    }
    stage.setAttribute('data-sc-verify-state', done + '/' + (now + 1) + '/' + glow.toFixed(2) + '/' + traf.toFixed(2));
  }

  /* --------------------------------------------- TRAFFIC: settle index -- */
  $$('.cl-traffic .cl-obj').forEach(function (el, i) { el.style.setProperty('--i', i); });

  /* -------------------------------------------- TALK: buildings answer -- */
  var SAY = {
    'src/App.js': ['Tall building · core', "I'm App.js, the tallest tower in town. I lay out the page, pull in the Navbar and Buttons, and ask useAuth who's logged in."],
    'src/index.js': ['Tall building · core', "I'm index.js, the front door. I wake React up, mount <App /> into #root, and that's my whole job."],
    'src/components/Navbar/Navbar.js': ['Medium building · ui', "I'm Navbar.js. I draw the top bar, show Login or Logout depending on useAuth, and reuse Button so we all look the same."],
    'src/hooks/useAuth.js': ['Medium building · api', "I'm useAuth.js. I talk to the login API through the gateway, keep the user in state, and lean on helpers for token parsing."],
    'src/components/Button/Button.css': ['Small shop · ui', "I'm Button.css. Rounded corners, hover colour, disabled state. I only work for Button.js."],
    'src/utils/helpers.js': ['Medium building · utility', "I'm helpers.js, the toolbox: formatDate, parseToken, classNames. useAuth relies on me and I have my own tests."]
  };
  var say = $('.cl-say'), spots = $$('.cl-spot');
  spots.forEach(function (b) {
    b.addEventListener('click', function () {
      var f = b.getAttribute('data-talk'), d = SAY[f];
      spots.forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
      $('.cl-say__file', say).textContent = f; $('.cl-say__tier', say).textContent = d[0]; $('.cl-say__q', say).textContent = d[1];
      if (!reduce) { say.classList.remove('is-swap'); void say.offsetWidth; say.classList.add('is-swap'); }
    });
  });

  /* ---------------------------------------------- READ: highlight walks -- */
  var read = $('#read'), hl = read && $('.cl-editor__hl', read);
  var HL = [[0, 4], [5, 1], [6, 1], [10, 1], [12, 5]], lastHl = -1;
  function renderRead(p) {
    var i = p < 0.22 ? 0 : p < 0.41 ? 1 : p < 0.60 ? 2 : p < 0.79 ? 3 : 4;
    if (i === lastHl) return; lastHl = i;
    hl.style.setProperty('--hl-at', HL[i][0]); hl.style.setProperty('--hl-n', HL[i][1]);
  }

  /* ------------------------------------- END: import (wired to the backend) -- */
  // GitHub link -> building.html runs POST /api/import/github. A .zip or folder is kept
  // in this browser (IndexedDB) and parsed here by building.html; nothing is uploaded.
  var CL = window.CodeLens;
  var form = $('.cl-form'), gh = form && $('.cl-gh', form), status = form && $('.cl-form__status', form);
  var READY = 'Public repos only. Your link goes to GitHub through CodeLens; nothing is stored on a server.';
  if (status) status.textContent = READY;
  function go() { location.href = 'building.html'; }
  function fail(msg) { if (status) { status.classList.add('is-bad'); status.textContent = msg; } }
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var url = gh.value.trim(), r = CL ? CL.checkGithubUrl(url) : { ok: false, message: 'CodeLens did not load. Reload the page.' };
    if (!url || !r.ok) {
      gh.classList.add('is-bad'); status.classList.add('is-bad');
      status.textContent = url ? (r.message || 'That does not look like github.com/owner/repo.') : 'Paste a link like github.com/owner/repo first.';
      gh.focus(); return;
    }
    CL.setPending({ src: 'github', url: url, name: r.owner + '/' + r.repo }).then(go, function () { fail('This browser blocked local storage, so the import cannot start.'); });
  });
  if (gh) gh.addEventListener('input', function () { gh.classList.remove('is-bad'); status.classList.remove('is-bad'); status.textContent = READY; });

  var drop = $('.cl-drop'), picked = null;
  function mb(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function setPicked(p, bytes) {
    picked = p;
    var n = p.src === 'folder' ? p.files.length : 1;
    $('.cl-drop__file', drop).textContent = p.name;
    $('.cl-drop__count', drop).textContent = p.src === 'zip' ? mb(bytes || 0) + ', read in your browser' : n.toLocaleString() + (n === 1 ? ' file' : ' files');
    $('.cl-drop__empty', drop).hidden = true; $('.cl-drop__picked', drop).hidden = false;
    drop.classList.add('is-picked');
  }
  function clearPicked() {
    picked = null;
    drop.classList.remove('is-picked'); $('.cl-drop__empty', drop).hidden = false; $('.cl-drop__picked', drop).hidden = true;
    drop.querySelectorAll('input[type=file]').forEach(function (i) { i.value = ''; });
  }
  if (drop) {
    drop.querySelectorAll('input[type=file]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var f = inp.files; if (!f || !f.length) return;
        if (inp.dataset.pick === 'dir') {
          var list = [].slice.call(f).map(function (x) { return { file: x, path: x.webkitRelativePath || x.name }; });
          setPicked({ src: 'folder', name: (f[0].webkitRelativePath || f[0].name).split('/')[0], files: list });
        } else setPicked({ src: 'zip', name: f[0].name, file: f[0] }, f[0].size);
      });
    });
    var depth = 0;
    drop.addEventListener('dragenter', function (e) { e.preventDefault(); depth++; drop.classList.add('is-over'); });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
    drop.addEventListener('dragleave', function () { if (--depth <= 0) { depth = 0; drop.classList.remove('is-over'); } });
    drop.addEventListener('drop', function (e) {
      e.preventDefault(); depth = 0; drop.classList.remove('is-over');
      var dt = e.dataTransfer; if (!dt) return;
      var it = dt.items && dt.items[0], entry = it && it.webkitGetAsEntry && it.webkitGetAsEntry();
      if (entry && entry.isDirectory) CL.filesFromEntry(entry).then(function (list) { setPicked({ src: 'folder', name: entry.name, files: list }); });
      else if (dt.files.length && /\.zip$/i.test(dt.files[0].name)) setPicked({ src: 'zip', name: dt.files[0].name, file: dt.files[0] }, dt.files[0].size);
      else if (dt.files.length) fail('Drop a .zip file or a project folder.');
    });
    $('.cl-drop__clear', drop).addEventListener('click', clearPicked);
    $('.cl-drop__picked a', drop).addEventListener('click', function (e) {
      e.preventDefault(); if (!picked) return;
      CL.setPending(picked).then(go, function () { fail('This browser blocked local storage, so the import cannot start.'); });
    });
    window.CodeLensImport = { setPicked: setPicked, clear: clearPicked,
      dragOver: function (on) { drop.classList.toggle('is-over', on !== false); } };
  }
  // Pages outside the scroll page jump straight to the import plate.
  document.querySelectorAll('a[href="#import"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var end = document.getElementById('your-repo'); if (!end) return;
      e.preventDefault();
      var top = end.getBoundingClientRect().top + scrollY;
      scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
      setTimeout(function () { gh && gh.focus({ preventScroll: true }); }, reduce ? 0 : 900);
    });
  });

  // "Watch a city get built" lands partway into the merged act, where the first
  // buildings already stand (landing at the very start reads as an empty plot).
  $$('a[data-cl-land]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var sec = document.querySelector(a.getAttribute('href')); if (!sec) return; e.preventDefault();
      var top = sec.getBoundingClientRect().top + scrollY, span = sec.offsetHeight - innerHeight;
      scrollTo({ top: top + Math.max(0, span) * parseFloat(a.getAttribute('data-cl-land')), behavior: reduce ? 'auto' : 'smooth' });
      history.replaceState(null, '', a.getAttribute('href'));
    });
  });

  /* ------------------------------------------------------------ loop -- */
  function near(el) { var r = el.getBoundingClientRect(); return r.bottom > -innerHeight && r.top < innerHeight * 2; }
  // The loop schedules itself first and guards each step, so one failure can
  // never freeze the Build act; scroll and resize also repaint it directly.
  function safe(fn) { try { fn(); } catch (err) { if (window.console) console.warn('[codelens]', err); } }
  function paintBuild() { if (build && near(build)) { var p = actP(build); if (p !== lastBuildP) { renderBuild(p); lastBuildP = p; } } }
  function tick() {
    requestAnimationFrame(tick);
    safe(updateLine);
    if (hero && fine && !reduce) safe(function () {
      px += (tx - px) * 0.08; py += (ty - py) * 0.08;
      if (Math.abs(tx - px) + Math.abs(ty - py) > 0.0005) { hero.style.setProperty('--px', px.toFixed(4)); hero.style.setProperty('--py', py.toFixed(4)); }
    });
    safe(paintBuild);
    if (read && near(read)) safe(function () { renderRead(actP(read)); });
  }
  addEventListener('scroll', function () { safe(paintBuild); }, { passive: true });
  addEventListener('resize', function () { lastBuildP = -1; lastNow = -2; });
  safe(function () { renderBuild(actP(build)); }); safe(function () { renderRead(actP(read)); }); safe(updateLine);
  requestAnimationFrame(tick);
})();
