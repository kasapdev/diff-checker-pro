# Diff Checker Pro

[![CI](https://github.com/kasapdev/diff-checker-pro/actions/workflows/ci.yml/badge.svg)](https://github.com/kasapdev/diff-checker-pro/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) ![Vanilla JS](https://img.shields.io/badge/Vanilla-JS-F7DF1E?logo=javascript&logoColor=black)

Compare two texts line-by-line or word-by-word, with side-by-side and unified views — fast, private, and fully offline.

> A premium, zero-dependency text diff workbench. Paste two versions of a document, get an instant line- or word-level comparison powered by a hand-written LCS diff algorithm, and read a live summary of what changed — all in your browser, with nothing ever leaving your machine.

## Overview

Diff Checker Pro is part of the **Web Utility Suite**. It runs entirely in the browser with no build step, no frameworks, and no network calls — open `index.html` from disk and it works. Paste the original text into **Text A** and the modified text into **Text B**; the diff recomputes live as you type. Choose **Line** or **Word** granularity and **Unified** or **Side-by-side** view independently, and read the added/removed/changed/unchanged counts in the summary bar.

## Features

- **Line and word-level diffing** — compare whole lines or individual words/whitespace tokens.
- **Unified and side-by-side views** — a classic `+`/`-` inline diff, or two aligned columns with additions and deletions color-coded and blank fillers keeping rows in sync.
- **Self-written LCS diff algorithm** — a real longest-common-subsequence dynamic-programming implementation (no external diff library), with a size guard that shows a friendly message instead of freezing the tab on pathological input.
- **Live summary bar** — counts of added, removed, changed (paired add+delete hunks), and unchanged lines/words, plus a status badge ("Identical" / "N changes").
- **Swap** — instantly swap Text A and Text B and re-diff.
- **Copy** and **Download** the diff as a plain-text `+`/`-`/` ` prefixed file.
- **Load sample** — a realistic before/after pair to explore the tool.
- **Auto-persist** — your last inputs and view settings are saved to `localStorage` and restored on return.
- **Dark & light themes**, fully responsive down to 360px, accessible, and keyboard-driven.

## Installation

No dependencies, no build step.

```bash
git clone https://github.com/kasapdev/diff-checker-pro.git
cd diff-checker-pro
```

Then simply open `index.html` in any modern browser (double-click it, or `file://` it). That's it.

## Usage

1. Paste the original text into **Text A** and the modified text into **Text B** — or click **Sample** to load an example.
2. Choose **Line** or **Word** granularity, and **Unified** or **Side-by-side** view — the diff updates instantly.
3. Use **Swap** to flip A and B, or **Clear** to reset both panes.
4. Read the summary bar for added/removed/changed/unchanged counts and the status badge.
5. **Copy** the diff or **Download** it as a `.diff` text file.

## Keyboard Shortcuts

| Action                | Shortcut                              |
| --------------------- | -------------------------------------- |
| Re-diff now            | <kbd>Ctrl/⌘</kbd> + <kbd>Enter</kbd> |
| Download diff           | <kbd>Ctrl/⌘</kbd> + <kbd>S</kbd> |
| Swap Text A / Text B    | <kbd>Ctrl/⌘</kbd> + <kbd>Shift</kbd> + <kbd>X</kbd> |
| Show shortcuts help   | <kbd>?</kbd>                    |
| Close dialog           | <kbd>Esc</kbd>                  |

## Screenshots

> _Screenshots coming soon._

![screenshot](docs/screenshot-1.png)
![screenshot](docs/screenshot-2.png)

## Roadmap

- [ ] Character-level diff highlighting within changed words
- [ ] Ignore-whitespace and ignore-case toggles
- [ ] File upload for Text A / Text B
- [ ] Syntax-aware diffing for common code/config formats
- [ ] Shareable diff links via a compressed URL fragment

## License

MIT Licensed. Part of the [Web Utility Suite](https://github.com/kasapdev/web-utility-suite).

---

## Part of the kasapdev Tools Suite

One of 45+ zero-dependency vanilla JS tools, all free and open source — [see the full list](https://github.com/kasapdev/kasapdev).
