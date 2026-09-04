/* =====================================================================
   Diff Checker Pro — app.js
   Hand-written LCS (longest common subsequence) diff engine — line-level
   and word-level — with side-by-side and unified rendering.
   Classic script (no modules). Depends on window.WUS (core.js).
   ===================================================================== */
(function () {
  'use strict';

  var WUS = window.WUS;
  var STORE_KEY = 'diffchecker.state';

  /* Guard against pathological O(n*m) blowups: cap the DP table size. */
  var LINE_CAP = 2000 * 2000;   /* ~4,000,000 cells for the line-level pass  */
  var WORD_CAP = 400 * 400;     /* per changed-line-pair word-level pass     */

  /* ----------------------------- DOM refs ---------------------------- */
  var inputA  = document.getElementById('inputA');
  var inputB  = document.getElementById('inputB');
  var statsA  = document.getElementById('statsA');
  var statsB  = document.getElementById('statsB');

  var modeLineBtn = document.getElementById('modeLine');
  var modeWordBtn = document.getElementById('modeWord');
  var viewUnifiedBtn = document.getElementById('viewUnified');
  var viewSideBtn = document.getElementById('viewSide');

  var btnSwap     = document.getElementById('btnSwap');
  var btnCopy     = document.getElementById('btnCopy');
  var btnDownload = document.getElementById('btnDownload');
  var btnSample   = document.getElementById('btnSample');
  var btnClear    = document.getElementById('btnClear');
  var btnSampleEmpty = document.getElementById('btnSampleEmpty');

  var statusBadge = document.getElementById('statusBadge');
  var statusText  = document.getElementById('statusText');

  var summaryBar    = document.getElementById('summaryBar');
  var statAdded     = document.getElementById('statAdded');
  var statRemoved   = document.getElementById('statRemoved');
  var statChanged   = document.getElementById('statChanged');
  var statUnchanged = document.getElementById('statUnchanged');

  var diffMeta    = document.getElementById('diffMeta');
  var diffUnified = document.getElementById('diffUnified');
  var diffSide    = document.getElementById('diffSide');
  var diffSideA   = document.getElementById('diffSideA');
  var diffSideB   = document.getElementById('diffSideB');
  var emptyState  = document.getElementById('emptyState');
  var tooLarge    = document.getElementById('tooLarge');

  /* ------------------------------ State ------------------------------ */
  var granularity = 'line'; /* 'line' | 'word' */
  var view = 'unified';     /* 'unified' | 'side' */

  /* The most recently rendered unified plain-text diff (for copy/download). */
  var lastUnifiedText = '';

  /* =================================================================
     LCS DIFF ENGINE
     Classic dynamic-programming LCS over two arrays (lines OR word
     tokens), walked back into a flat list of equal/add/del ops.
     Returns null when the DP table would exceed `cap` cells — callers
     fall back to a simpler message rather than blocking the browser
     on a huge O(n*m) table.
     ================================================================= */
  function computeLCSOps(a, b, cap) {
    var n = a.length, m = b.length;
    if ((n + 1) * (m + 1) > cap) return null;

    if (n === 0) {
      var onlyAdds = [];
      for (var jj = 0; jj < m; jj++) onlyAdds.push({ type: 'add', b: b[jj], bi: jj });
      return onlyAdds;
    }
    if (m === 0) {
      var onlyDels = [];
      for (var ii = 0; ii < n; ii++) onlyDels.push({ type: 'del', a: a[ii], ai: ii });
      return onlyDels;
    }

    /* dp[i][j] = length of the LCS of a[i:] and b[j:] */
    var dp = new Array(n + 1);
    for (var i = 0; i <= n; i++) dp[i] = new Int32Array(m + 1);

    for (i = n - 1; i >= 0; i--) {
      var rowI = dp[i], rowI1 = dp[i + 1];
      for (var j = m - 1; j >= 0; j--) {
        if (a[i] === b[j]) rowI[j] = rowI1[j + 1] + 1;
        else rowI[j] = rowI1[j] >= rowI[j + 1] ? rowI1[j] : rowI[j + 1];
      }
    }

    /* Walk forward, at each step preferring "equal" then the branch
       the DP table says still holds the longer subsequence. */
    var ops = [];
    i = 0;
    var j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        ops.push({ type: 'equal', a: a[i], b: b[j], ai: i, bi: j });
        i++; j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        ops.push({ type: 'del', a: a[i], ai: i });
        i++;
      } else {
        ops.push({ type: 'add', b: b[j], bi: j });
        j++;
      }
    }
    while (i < n) { ops.push({ type: 'del', a: a[i], ai: i }); i++; }
    while (j < m) { ops.push({ type: 'add', b: b[j], bi: j }); j++; }
    return ops;
  }

  /* =================================================================
     ROW GROUPING
     Turn the flat op list into display rows, pairing up an adjacent
     run of deletions with a run of additions into "changed" rows —
     the classic heuristic: same-position del/add pairs inside one
     contiguous non-equal block read as a modification, not a swap.
     ================================================================= */
  function buildRows(ops) {
    var rows = [];
    var i = 0;
    while (i < ops.length) {
      if (ops[i].type === 'equal') {
        rows.push({ type: 'equal', a: ops[i].a, b: ops[i].b, ai: ops[i].ai, bi: ops[i].bi });
        i++;
        continue;
      }
      var dels = [], adds = [];
      var j = i;
      while (j < ops.length && ops[j].type !== 'equal') {
        if (ops[j].type === 'del') dels.push(ops[j]); else adds.push(ops[j]);
        j++;
      }
      var pairCount = Math.min(dels.length, adds.length);
      for (var k = 0; k < pairCount; k++) {
        rows.push({ type: 'changed', a: dels[k].a, b: adds[k].b, ai: dels[k].ai, bi: adds[k].bi });
      }
      for (var k1 = pairCount; k1 < dels.length; k1++) {
        rows.push({ type: 'del', a: dels[k1].a, ai: dels[k1].ai });
      }
      for (var k2 = pairCount; k2 < adds.length; k2++) {
        rows.push({ type: 'add', b: adds[k2].b, bi: adds[k2].bi });
      }
      i = j;
    }
    return rows;
  }

  function countRows(rows) {
    var c = { added: 0, removed: 0, changed: 0, unchanged: 0 };
    rows.forEach(function (r) {
      if (r.type === 'add') c.added++;
      else if (r.type === 'del') c.removed++;
      else if (r.type === 'changed') c.changed++;
      else c.unchanged++;
    });
    return c;
  }

  /* =================================================================
     WORD-LEVEL DIFF (nested within a single changed line pair)
     ================================================================= */
  function tokenizeWords(line) {
    if (line === '') return [];
    var parts = line.split(/(\s+)/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] !== '') out.push(parts[i]);
    }
    return out;
  }

  function wordDiffHtml(aText, bText) {
    var aTokens = tokenizeWords(aText);
    var bTokens = tokenizeWords(bText);
    var ops = computeLCSOps(aTokens, bTokens, WORD_CAP);
    if (!ops) {
      /* Pathological line (e.g. one huge minified line) — skip word
         highlighting for this pair and just show the whole lines. */
      return { aHtml: WUS.escapeHtml(aText), bHtml: WUS.escapeHtml(bText) };
    }
    var aHtml = '', bHtml = '';
    ops.forEach(function (op) {
      if (op.type === 'equal') {
        aHtml += WUS.escapeHtml(op.a);
        bHtml += WUS.escapeHtml(op.b);
      } else if (op.type === 'del') {
        aHtml += '<span class="tok-del">' + WUS.escapeHtml(op.a) + '</span>';
      } else {
        bHtml += '<span class="tok-add">' + WUS.escapeHtml(op.b) + '</span>';
      }
    });
    return { aHtml: aHtml, bHtml: bHtml };
  }

  /* =================================================================
     RENDERERS
     ================================================================= */
  function renderUnified(rows) {
    var html = '';
    var text = '';
    rows.forEach(function (row) {
      if (row.type === 'equal') {
        html += '<span class="diff-line"><span class="diff-marker">&nbsp;</span>' + WUS.escapeHtml(row.a) + '</span>\n';
        text += '  ' + row.a + '\n';
      } else if (row.type === 'del') {
        html += '<span class="diff-line --del"><span class="diff-marker">-</span>' + WUS.escapeHtml(row.a) + '</span>\n';
        text += '- ' + row.a + '\n';
      } else if (row.type === 'add') {
        html += '<span class="diff-line --add"><span class="diff-marker">+</span>' + WUS.escapeHtml(row.b) + '</span>\n';
        text += '+ ' + row.b + '\n';
      } else { /* changed */
        if (granularity === 'word') {
          var wd = wordDiffHtml(row.a, row.b);
          html += '<span class="diff-line --del"><span class="diff-marker">-</span>' + wd.aHtml + '</span>\n';
          html += '<span class="diff-line --add"><span class="diff-marker">+</span>' + wd.bHtml + '</span>\n';
        } else {
          html += '<span class="diff-line --del"><span class="diff-marker">-</span>' + WUS.escapeHtml(row.a) + '</span>\n';
          html += '<span class="diff-line --add"><span class="diff-marker">+</span>' + WUS.escapeHtml(row.b) + '</span>\n';
        }
        text += '- ' + row.a + '\n' + '+ ' + row.b + '\n';
      }
    });
    diffUnified.innerHTML = html;
    lastUnifiedText = text.replace(/\n$/, '');
  }

  function sideRow(kind, num, html) {
    if (kind === 'empty') {
      return '<span class="side-row --empty"><span class="side-num">&nbsp;</span><span class="side-text">&nbsp;</span></span>';
    }
    var cls = kind === 'del' ? ' --del' : kind === 'add' ? ' --add' : '';
    return '<span class="side-row' + cls + '"><span class="side-num">' + num + '</span><span class="side-text">' + (html || '&nbsp;') + '</span></span>';
  }

  function renderSideBySide(rows) {
    var htmlA = '', htmlB = '';
    rows.forEach(function (row) {
      if (row.type === 'equal') {
        var eHtml = WUS.escapeHtml(row.a);
        htmlA += sideRow('equal', row.ai + 1, eHtml);
        htmlB += sideRow('equal', row.bi + 1, eHtml);
      } else if (row.type === 'del') {
        htmlA += sideRow('del', row.ai + 1, WUS.escapeHtml(row.a));
        htmlB += sideRow('empty');
      } else if (row.type === 'add') {
        htmlA += sideRow('empty');
        htmlB += sideRow('add', row.bi + 1, WUS.escapeHtml(row.b));
      } else { /* changed */
        if (granularity === 'word') {
          var wd = wordDiffHtml(row.a, row.b);
          htmlA += sideRow('del', row.ai + 1, wd.aHtml);
          htmlB += sideRow('add', row.bi + 1, wd.bHtml);
        } else {
          htmlA += sideRow('del', row.ai + 1, WUS.escapeHtml(row.a));
          htmlB += sideRow('add', row.bi + 1, WUS.escapeHtml(row.b));
        }
      }
    });
    diffSideA.innerHTML = htmlA;
    diffSideB.innerHTML = htmlB;
  }

  function renderSummary(counts) {
    statAdded.textContent = counts.added.toLocaleString();
    statRemoved.textContent = counts.removed.toLocaleString();
    statChanged.textContent = counts.changed.toLocaleString();
    statUnchanged.textContent = counts.unchanged.toLocaleString();
    summaryBar.hidden = false;
  }

  function updateStatusBadge(aText, bText, counts) {
    statusBadge.classList.remove('has-changes', 'is-same');
    if (aText === bText) {
      statusBadge.classList.add('is-same');
      statusText.textContent = 'Identical';
    } else {
      var total = counts.added + counts.removed + counts.changed;
      statusBadge.classList.add('has-changes');
      statusText.textContent = total.toLocaleString() + (total === 1 ? ' change' : ' changes');
    }
  }

  function updateViewVisibility() {
    var showSide = view === 'side';
    diffSide.hidden = !showSide;
    diffSide.classList.toggle('is-active', showSide);
    diffUnified.hidden = showSide;
  }

  function updateInputMeta() {
    var la = inputA.value.length, lb = inputB.value.length;
    statsA.textContent = la.toLocaleString() + (la === 1 ? ' char' : ' chars');
    statsB.textContent = lb.toLocaleString() + (lb === 1 ? ' char' : ' chars');
  }

  function showEmpty() {
    emptyState.hidden = false;
    tooLarge.hidden = true;
    diffUnified.hidden = true;
    diffSide.hidden = true;
    diffSide.classList.remove('is-active');
    summaryBar.hidden = true;
    diffMeta.textContent = '';
    lastUnifiedText = '';
    statusBadge.classList.remove('has-changes', 'is-same');
    statusText.textContent = 'Ready';
  }

  function showTooLarge() {
    tooLarge.hidden = false;
    emptyState.hidden = true;
    diffUnified.hidden = true;
    diffSide.hidden = true;
    diffSide.classList.remove('is-active');
    summaryBar.hidden = true;
    diffMeta.textContent = 'Input too large for a live diff';
    lastUnifiedText = '';
    statusBadge.classList.remove('has-changes', 'is-same');
    statusText.textContent = 'Too large';
  }

  /* =================================================================
     MAIN RENDER PASS
     ================================================================= */
  function renderDiff() {
    updateInputMeta();

    var aText = inputA.value;
    var bText = inputB.value;

    if (!aText && !bText) { showEmpty(); return; }

    var aLines = aText === '' ? [] : aText.split('\n');
    var bLines = bText === '' ? [] : bText.split('\n');

    var ops = computeLCSOps(aLines, bLines, LINE_CAP);
    if (!ops) { showTooLarge(); return; }

    var rows = buildRows(ops);
    var counts = countRows(rows);

    emptyState.hidden = true;
    tooLarge.hidden = true;

    renderUnified(rows);
    renderSideBySide(rows);
    updateViewVisibility();
    renderSummary(counts);
    updateStatusBadge(aText, bText, counts);

    diffMeta.textContent = rows.length.toLocaleString() + ' rows · ' +
      (granularity === 'word' ? 'Word' : 'Line') + ' mode · ' +
      (view === 'side' ? 'Side-by-side' : 'Unified') + ' view';
  }
  var renderDebounced = WUS.debounce(renderDiff, 250);

  /* =================================================================
     ACTIONS — copy / download / swap / clear / sample
     ================================================================= */
  function copyDiff() {
    if (!lastUnifiedText) { WUS.toast('Nothing to copy yet', 'error'); return; }
    WUS.copy(lastUnifiedText, 'Diff copied to clipboard');
  }

  function downloadDiff() {
    if (!lastUnifiedText) { WUS.toast('Nothing to download yet', 'error'); return; }
    var name = 'diff-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.diff';
    WUS.download(name, lastUnifiedText + '\n', 'text/plain;charset=utf-8');
    WUS.toast('Downloaded ' + name);
  }

  function swapInputs() {
    var tmp = inputA.value;
    inputA.value = inputB.value;
    inputB.value = tmp;
    renderDiff();
    persist();
    WUS.toast('Swapped Text A and Text B');
  }

  function clearAll() {
    inputA.value = '';
    inputB.value = '';
    showEmpty();
    updateInputMeta();
    WUS.store.remove(STORE_KEY);
    inputA.focus();
  }

  var SAMPLE_A =
    'Web Utility Suite\n' +
    'A collection of fast, offline developer tools.\n' +
    'Built with vanilla JavaScript — no frameworks, no build step.\n' +
    'Every tool runs entirely in your browser.\n' +
    'Dark and light themes are supported.\n' +
    'MIT Licensed.\n';
  var SAMPLE_B =
    'Web Utility Suite\n' +
    'A collection of fast, private, offline developer tools.\n' +
    'Built with vanilla JavaScript — zero dependencies, no build step.\n' +
    'Every tool runs entirely in your browser, with nothing sent to a server.\n' +
    'Dark and light themes are supported out of the box.\n' +
    'MIT Licensed.\n' +
    'Part of the kasapdev suite.\n';

  function loadSample() {
    inputA.value = SAMPLE_A;
    inputB.value = SAMPLE_B;
    renderDiff();
    persist();
    WUS.toast('Sample loaded');
  }

  /* =================================================================
     MODE / VIEW TOGGLES (segmented controls)
     ================================================================= */
  function setGranularity(next) {
    granularity = next;
    modeLineBtn.classList.toggle('is-active', next === 'line');
    modeLineBtn.setAttribute('aria-selected', String(next === 'line'));
    modeWordBtn.classList.toggle('is-active', next === 'word');
    modeWordBtn.setAttribute('aria-selected', String(next === 'word'));
    renderDiff();
    persist();
  }

  function setView(next) {
    view = next;
    viewUnifiedBtn.classList.toggle('is-active', next === 'unified');
    viewUnifiedBtn.setAttribute('aria-selected', String(next === 'unified'));
    viewSideBtn.classList.toggle('is-active', next === 'side');
    viewSideBtn.setAttribute('aria-selected', String(next === 'side'));
    updateViewVisibility();
    if (diffMeta.textContent) {
      diffMeta.textContent = diffMeta.textContent.replace(/(Unified|Side-by-side) view$/, (next === 'side' ? 'Side-by-side' : 'Unified') + ' view');
    }
    persist();
  }

  modeLineBtn.addEventListener('click', function () { setGranularity('line'); });
  modeWordBtn.addEventListener('click', function () { setGranularity('word'); });
  viewUnifiedBtn.addEventListener('click', function () { setView('unified'); });
  viewSideBtn.addEventListener('click', function () { setView('side'); });

  /* =================================================================
     PERSISTENCE — debounced save of both texts + settings, restore
     ================================================================= */
  function persist() {
    WUS.store.set(STORE_KEY, {
      a: inputA.value,
      b: inputB.value,
      granularity: granularity,
      view: view
    });
  }
  var persistDebounced = WUS.debounce(persist, 400);

  function restore() {
    var saved = WUS.store.get(STORE_KEY, null);
    if (!saved) return;
    if (typeof saved.a === 'string') inputA.value = saved.a;
    if (typeof saved.b === 'string') inputB.value = saved.b;
    if (saved.granularity === 'word') setGranularity('word'); else setGranularity('line');
    if (saved.view === 'side') setView('side'); else setView('unified');
  }

  /* =================================================================
     SHORTCUTS HELP MODAL
     ================================================================= */
  var helpBackdrop = document.getElementById('helpBackdrop');
  var helpClose    = document.getElementById('helpClose');
  var shortcutRows = document.getElementById('shortcutRows');

  var SHORTCUTS = [
    { keys: ['mod', '⏎'], desc: 'Re-diff now' },
    { keys: ['mod', 'S'], desc: 'Download diff' },
    { keys: ['mod', 'Shift', 'X'], desc: 'Swap Text A / Text B' },
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
  helpBackdrop.addEventListener('click', function (e) {
    if (e.target === helpBackdrop) closeHelp();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !helpBackdrop.hidden) closeHelp();
  });

  var helpBtns = document.querySelectorAll('[data-shortcut-help]');
  for (var i = 0; i < helpBtns.length; i++) helpBtns[i].addEventListener('click', openHelp);

  /* =================================================================
     WIRING
     ================================================================= */
  btnSwap.addEventListener('click', swapInputs);
  btnCopy.addEventListener('click', copyDiff);
  btnDownload.addEventListener('click', downloadDiff);
  btnSample.addEventListener('click', loadSample);
  btnClear.addEventListener('click', clearAll);
  btnSampleEmpty.addEventListener('click', loadSample);

  inputA.addEventListener('input', function () { renderDebounced(); persistDebounced(); });
  inputB.addEventListener('input', function () { renderDebounced(); persistDebounced(); });

  /* Global keyboard shortcuts via WUS. mod+enter fires even while a
     textarea is focused (core.js only suppresses bare, non-mod keys
     while typing), so a single registration covers both cases. */
  WUS.registerShortcut('mod+enter', function () { renderDiff(); WUS.toast('Diff refreshed'); }, 'Re-diff now');
  WUS.registerShortcut('mod+s', function () { downloadDiff(); }, 'Download diff');
  WUS.registerShortcut('mod+shift+x', function () { swapInputs(); }, 'Swap Text A / Text B');
  WUS.registerShortcut('?', function () { openHelp(); }, 'Show shortcuts');

  /* =================================================================
     INIT
     ================================================================= */
  buildShortcutTable();
  updateInputMeta();
  restore();
  renderDiff();
})();
