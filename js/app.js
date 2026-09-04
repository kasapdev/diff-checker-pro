/* =====================================================================
   Diff Checker Pro — app.js
   Line/word diff with unified and side-by-side views, powered by a
   self-written LCS diff. Classic script (no modules). Depends on WUS.
   ===================================================================== */
(function () {
  'use strict';

  var WUS = window.WUS;
  var STORE_KEY = 'diffchecker.state';
  var MAX_CELLS = 2000000; // guard against pathological LCS table sizes

  /* ----------------------------- DOM refs ---------------------------- */
  var inputA = document.getElementById('inputA');
  var inputB = document.getElementById('inputB');
  var statsA = document.getElementById('statsA');
  var statsB = document.getElementById('statsB');

  var statusBadge = document.getElementById('statusBadge');
  var statusText  = document.getElementById('statusText');

  var modeLineBtn = document.getElementById('modeLine');
  var modeWordBtn = document.getElementById('modeWord');
  var viewUnifiedBtn = document.getElementById('viewUnified');
  var viewSideBtn = document.getElementById('viewSide');

  var summaryBar = document.getElementById('summaryBar');
  var statAdded = document.getElementById('statAdded');
  var statRemoved = document.getElementById('statRemoved');
  var statChanged = document.getElementById('statChanged');
  var statUnchanged = document.getElementById('statUnchanged');

  var diffMeta = document.getElementById('diffMeta');
  var diffScroll = document.getElementById('diffScroll');
  var diffUnified = document.getElementById('diffUnified');
  var diffSide = document.getElementById('diffSide');
  var diffSideA = document.getElementById('diffSideA');
  var diffSideB = document.getElementById('diffSideB');
  var emptyState = document.getElementById('emptyState');
  var tooLarge = document.getElementById('tooLarge');

  var mode = 'line'; // 'line' | 'word'
  var view = 'unified'; // 'unified' | 'side'
  var lastOps = null; // cached diff ops for the current mode
  var lastTooLarge = false;

  /* =================================================================
     TOKENIZERS
     ================================================================= */
  function tokenizeLine(text) {
    if (text === '') return [];
    return text.split('\n');
  }
  function tokenizeWord(text) {
    if (text === '') return [];
    return text.split(/(\s+)/).filter(function (t) { return t.length > 0; });
  }
  function tokenize(text, m) {
    return m === 'word' ? tokenizeWord(text) : tokenizeLine(text);
  }

  /* =================================================================
     LCS DIFF — returns an ordered list of {type: 'equal'|'add'|'del', value}
     or null if the input is too large for a live diff.
     ================================================================= */
  function diffArrays(a, b) {
    var n = a.length, m = b.length;
    if ((n + 1) * (m + 1) > MAX_CELLS) return null;

    var w = m + 1;
    var dp = new Int32Array((n + 1) * w);

    for (var i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        if (a[i] === b[j]) {
          dp[i * w + j] = dp[(i + 1) * w + (j + 1)] + 1;
        } else {
          var up = dp[(i + 1) * w + j];
          var left = dp[i * w + (j + 1)];
          dp[i * w + j] = up >= left ? up : left;
        }
      }
    }

    var ops = [];
    var i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        ops.push({ type: 'equal', value: a[i] });
        i++; j++;
      } else if (dp[(i + 1) * w + j] >= dp[i * w + (j + 1)]) {
        ops.push({ type: 'del', value: a[i] });
        i++;
      } else {
        ops.push({ type: 'add', value: b[j] });
        j++;
      }
    }
    while (i < n) { ops.push({ type: 'del', value: a[i] }); i++; }
    while (j < m) { ops.push({ type: 'add', value: b[j] }); j++; }
    return ops;
  }

  function mergeConsecutive(ops) {
    var out = [];
    for (var k = 0; k < ops.length; k++) {
      var op = ops[k];
      var prev = out[out.length - 1];
      if (prev && prev.type === op.type) prev.value += op.value;
      else out.push({ type: op.type, value: op.value });
    }
    return out;
  }

  /* =================================================================
     RENDERERS
     ================================================================= */
  function renderUnifiedLine(ops) {
    var html = '';
    for (var k = 0; k < ops.length; k++) {
      var op = ops[k];
      var marker = op.type === 'add' ? '+' : op.type === 'del' ? '-' : ' ';
      var cls = op.type === 'add' ? ' --add' : op.type === 'del' ? ' --del' : '';
      html += '<span class="diff-line' + cls + '"><span class="diff-marker">' + marker + '</span>' +
        WUS.escapeHtml(op.value) + '</span>\n';
    }
    return html;
  }

  function renderUnifiedWord(ops) {
    var html = '';
    for (var k = 0; k < ops.length; k++) {
      var op = ops[k];
      var text = WUS.escapeHtml(op.value);
      if (op.type === 'add') html += '<span class="tok-add">' + text + '</span>';
      else if (op.type === 'del') html += '<span class="tok-del">' + text + '</span>';
      else html += text;
    }
    return html;
  }

  function renderSideLine(ops) {
    var htmlA = '', htmlB = '';
    for (var k = 0; k < ops.length; k++) {
      var op = ops[k];
      if (op.type === 'equal') {
        var t = WUS.escapeHtml(op.value) || '&nbsp;';
        htmlA += '<span class="side-row">' + t + '</span>\n';
        htmlB += '<span class="side-row">' + t + '</span>\n';
      } else if (op.type === 'del') {
        htmlA += '<span class="side-row --del">' + (WUS.escapeHtml(op.value) || '&nbsp;') + '</span>\n';
        htmlB += '<span class="side-row --empty">&nbsp;</span>\n';
      } else {
        htmlA += '<span class="side-row --empty">&nbsp;</span>\n';
        htmlB += '<span class="side-row --add">' + (WUS.escapeHtml(op.value) || '&nbsp;') + '</span>\n';
      }
    }
    return { a: htmlA, b: htmlB };
  }

  function renderSideWord(ops) {
    var htmlA = '', htmlB = '';
    for (var k = 0; k < ops.length; k++) {
      var op = ops[k];
      var text = WUS.escapeHtml(op.value);
      if (op.type === 'equal') { htmlA += text; htmlB += text; }
      else if (op.type === 'del') { htmlA += '<span class="tok-del">' + text + '</span>'; }
      else { htmlB += '<span class="tok-add">' + text + '</span>'; }
    }
    return { a: htmlA, b: htmlB };
  }

  function buildPlainDiffText(ops, m) {
    var merged = m === 'word' ? mergeConsecutive(ops) : ops;
    return merged.map(function (o) {
      var prefix = o.type === 'add' ? '+ ' : o.type === 'del' ? '- ' : '  ';
      return prefix + o.value;
    }).join('\n');
  }

  /* =================================================================
     SUMMARY
     ================================================================= */
  function hasContent(v) { return /\S/.test(v); }

  function computeSummary(ops) {
    var added = 0, removed = 0, unchanged = 0, changed = 0;
    var k = 0;
    while (k < ops.length) {
      var op = ops[k];
      if (op.type === 'equal') {
        if (hasContent(op.value)) unchanged++;
        k++;
        continue;
      }
      // Collect a hunk of consecutive add/del ops and pair them up as "changed".
      var dels = 0, adds = 0;
      while (k < ops.length && ops[k].type !== 'equal') {
        if (ops[k].type === 'del') { if (hasContent(ops[k].value)) dels++; }
        else { if (hasContent(ops[k].value)) adds++; }
        k++;
      }
      var pair = Math.min(dels, adds);
      changed += pair;
      removed += dels - pair;
      added += adds - pair;
    }
    return { added: added, removed: removed, unchanged: unchanged, changed: changed };
  }

  /* =================================================================
     CORE — run diff + render current view
     ================================================================= */
  function updateInputMeta() {
    statsA.textContent = inputA.value.length.toLocaleString() + (inputA.value.length === 1 ? ' char' : ' chars');
    statsB.textContent = inputB.value.length.toLocaleString() + (inputB.value.length === 1 ? ' char' : ' chars');
  }

  function setStatus(cls, text) {
    statusBadge.classList.remove('has-changes', 'is-same');
    if (cls) statusBadge.classList.add(cls);
    statusText.textContent = text;
  }

  function showEmpty() {
    emptyState.hidden = false;
    tooLarge.hidden = true;
    diffUnified.hidden = true;
    diffSide.classList.remove('is-active');
    diffMeta.textContent = '';
    summaryBar.hidden = true;
    setStatus('', 'Ready');
  }

  function showTooLarge() {
    emptyState.hidden = true;
    tooLarge.hidden = false;
    diffUnified.hidden = true;
    diffSide.classList.remove('is-active');
    diffMeta.textContent = '';
    summaryBar.hidden = true;
    setStatus('', 'Too large');
  }

  function renderCurrentView() {
    if (lastTooLarge) { showTooLarge(); return; }
    if (!lastOps) { showEmpty(); return; }

    emptyState.hidden = true;
    tooLarge.hidden = true;

    if (view === 'unified') {
      diffUnified.hidden = false;
      diffSide.classList.remove('is-active');
      diffUnified.innerHTML = mode === 'word' ? renderUnifiedWord(lastOps) : renderUnifiedLine(lastOps);
    } else {
      diffUnified.hidden = true;
      diffSide.classList.add('is-active');
      var sides = mode === 'word' ? renderSideWord(lastOps) : renderSideLine(lastOps);
      diffSideA.innerHTML = sides.a;
      diffSideB.innerHTML = sides.b;
    }

    var s = computeSummary(lastOps);
    statAdded.textContent = String(s.added);
    statRemoved.textContent = String(s.removed);
    statChanged.textContent = String(s.changed);
    statUnchanged.textContent = String(s.unchanged);
    summaryBar.hidden = false;

    var total = s.added + s.removed + s.changed;
    if (total === 0) setStatus('is-same', 'Identical');
    else setStatus('has-changes', total + ' change' + (total === 1 ? '' : 's'));

    var aTokens = tokenize(inputA.value, mode).filter(hasContent).length;
    var bTokens = tokenize(inputB.value, mode).filter(hasContent).length;
    diffMeta.textContent = aTokens + ' → ' + bTokens + (mode === 'word' ? ' words' : ' lines');
  }

  function runDiff() {
    var a = inputA.value, b = inputB.value;
    if (a === '' && b === '') {
      lastOps = null;
      lastTooLarge = false;
      renderCurrentView();
      persistDebounced();
      return;
    }
    var ta = tokenize(a, mode);
    var tb = tokenize(b, mode);
    var ops = diffArrays(ta, tb);
    if (ops === null) {
      lastOps = null;
      lastTooLarge = true;
    } else {
      lastOps = ops;
      lastTooLarge = false;
    }
    renderCurrentView();
    persistDebounced();
  }

  /* =================================================================
     ACTIONS
     ================================================================= */
  function copyDiff() {
    if (!lastOps || lastTooLarge) { WUS.toast('Nothing to copy yet', 'error'); return; }
    WUS.copy(buildPlainDiffText(lastOps, mode), 'Diff copied to clipboard');
  }

  function downloadDiff() {
    if (!lastOps || lastTooLarge) { WUS.toast('Nothing to download yet', 'error'); return; }
    var content = buildPlainDiffText(lastOps, mode);
    var name = 'diff-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.diff';
    WUS.download(name, content, 'text/plain;charset=utf-8');
    WUS.toast('Downloaded ' + name);
  }

  var SAMPLE_A = 'The quick brown fox jumps over the lazy dog.\nWeb Utility Suite ships free, offline developer tools.\nNo build step, no frameworks, no tracking.\nThis line will be removed in the sample.\nContact: hello@example.com';
  var SAMPLE_B = 'The quick brown fox leaps over the lazy dog.\nWeb Utility Suite ships free, offline developer tools.\nNo build step, no frameworks, ever.\nThis line was added in the sample.\nContact: support@example.com';

  function loadSample() {
    inputA.value = SAMPLE_A;
    inputB.value = SAMPLE_B;
    updateInputMeta();
    runDiff();
    WUS.toast('Sample loaded');
  }

  function clearAll() {
    inputA.value = '';
    inputB.value = '';
    updateInputMeta();
    lastOps = null;
    lastTooLarge = false;
    renderCurrentView();
    WUS.store.remove(STORE_KEY);
    inputA.focus();
  }

  function swapInputs() {
    var tmp = inputA.value;
    inputA.value = inputB.value;
    inputB.value = tmp;
    updateInputMeta();
    runDiff();
    WUS.toast('Swapped Text A and Text B');
  }

  /* -------------------------- Mode / view toggles --------------------------- */
  function setMode(next) {
    if (mode === next) return;
    mode = next;
    modeLineBtn.classList.toggle('is-active', mode === 'line');
    modeLineBtn.setAttribute('aria-selected', String(mode === 'line'));
    modeWordBtn.classList.toggle('is-active', mode === 'word');
    modeWordBtn.setAttribute('aria-selected', String(mode === 'word'));
    runDiff();
  }
  function setView(next) {
    if (view === next) return;
    view = next;
    viewUnifiedBtn.classList.toggle('is-active', view === 'unified');
    viewUnifiedBtn.setAttribute('aria-selected', String(view === 'unified'));
    viewSideBtn.classList.toggle('is-active', view === 'side');
    viewSideBtn.setAttribute('aria-selected', String(view === 'side'));
    renderCurrentView();
    persist();
  }

  /* =================================================================
     PERSISTENCE
     ================================================================= */
  function persist() {
    WUS.store.set(STORE_KEY, { a: inputA.value, b: inputB.value, mode: mode, view: view });
  }
  var persistDebounced = WUS.debounce(persist, 400);

  function restore() {
    var saved = WUS.store.get(STORE_KEY, null);
    if (!saved) return;
    if (typeof saved.a === 'string') inputA.value = saved.a;
    if (typeof saved.b === 'string') inputB.value = saved.b;
    if (saved.mode === 'word' || saved.mode === 'line') mode = saved.mode;
    if (saved.view === 'unified' || saved.view === 'side') view = saved.view;
    modeLineBtn.classList.toggle('is-active', mode === 'line');
    modeLineBtn.setAttribute('aria-selected', String(mode === 'line'));
    modeWordBtn.classList.toggle('is-active', mode === 'word');
    modeWordBtn.setAttribute('aria-selected', String(mode === 'word'));
    viewUnifiedBtn.classList.toggle('is-active', view === 'unified');
    viewUnifiedBtn.setAttribute('aria-selected', String(view === 'unified'));
    viewSideBtn.classList.toggle('is-active', view === 'side');
    viewSideBtn.setAttribute('aria-selected', String(view === 'side'));
    updateInputMeta();
    runDiff();
  }

  /* =================================================================
     SHORTCUTS HELP MODAL
     ================================================================= */
  var helpBackdrop = document.getElementById('helpBackdrop');
  var helpClose = document.getElementById('helpClose');
  var shortcutRows = document.getElementById('shortcutRows');

  var SHORTCUTS = [
    { keys: ['mod', 'S'], desc: 'Download diff' },
    { keys: ['mod', '⏎'], desc: 'Copy diff' },
    { keys: ['?'], desc: 'Show this help' },
    { keys: ['Esc'], desc: 'Close dialog' }
  ];

  function buildShortcutTable() {
    var html = '';
    SHORTCUTS.forEach(function (s) {
      var kbds = s.keys.map(function (k) { return '<kbd>' + WUS.escapeHtml(k) + '</kbd>'; }).join('');
      html += '<tr><td>' + WUS.escapeHtml(s.desc) + '</td><td>' + kbds + '</td></tr>';
    });
    shortcutRows.innerHTML = html;
  }

  function openHelp() { helpBackdrop.hidden = false; helpClose.focus(); }
  function closeHelp() { helpBackdrop.hidden = true; }

  helpClose.addEventListener('click', closeHelp);
  helpBackdrop.addEventListener('click', function (e) { if (e.target === helpBackdrop) closeHelp(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !helpBackdrop.hidden) closeHelp();
  });
  var helpBtns = document.querySelectorAll('[data-shortcut-help]');
  for (var hi = 0; hi < helpBtns.length; hi++) helpBtns[hi].addEventListener('click', openHelp);

  /* =================================================================
     WIRING
     ================================================================= */
  document.getElementById('btnSwap').addEventListener('click', swapInputs);
  document.getElementById('btnCopy').addEventListener('click', copyDiff);
  document.getElementById('btnDownload').addEventListener('click', downloadDiff);
  document.getElementById('btnSample').addEventListener('click', loadSample);
  document.getElementById('btnSampleEmpty').addEventListener('click', loadSample);
  document.getElementById('btnClear').addEventListener('click', clearAll);

  modeLineBtn.addEventListener('click', function () { setMode('line'); });
  modeWordBtn.addEventListener('click', function () { setMode('word'); });
  viewUnifiedBtn.addEventListener('click', function () { setView('unified'); });
  viewSideBtn.addEventListener('click', function () { setView('side'); });

  var runDiffDebounced = WUS.debounce(runDiff, 300);
  inputA.addEventListener('input', function () { updateInputMeta(); runDiffDebounced(); });
  inputB.addEventListener('input', function () { updateInputMeta(); runDiffDebounced(); });

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); copyDiff(); }
  });

  WUS.registerShortcut('mod+s', function () { downloadDiff(); }, 'Download diff');
  WUS.registerShortcut('?', function () { openHelp(); }, 'Show shortcuts');

  /* =================================================================
     INIT
     ================================================================= */
  buildShortcutTable();
  restore();
})();
