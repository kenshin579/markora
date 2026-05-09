# Changelog

All notable changes to Markora are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-05-09

### Added
- Code block syntax highlighting via shiki with lazy-loaded language/theme chunks
  - 23 curated languages: JavaScript, TypeScript, JSX, TSX, Java, Kotlin, Python, Go, Rust, C, C++, Shell, JSON, YAML, HTML, CSS, SCSS, SQL, XML, Markdown, Dockerfile, Properties, Plain Text
  - Light theme `github-light` and dark theme `one-dark-pro`, synced to the IDE theme via CSS variables (no editor reload on toggle)
  - Language picker (`<select>` in the code block) is always visible with theme-aware contrast
  - Language alias normalization on load (`bash` → `shellscript`, `kt` → `kotlin`, `js` → `javascript`, etc.) so the picker shows the correct label when authors write the alias in markdown
- Tag-triggered automated release pipeline (`make release VERSION=x.y.z`) — `release.yml` workflow builds the plugin and attaches the `.zip` to the GitHub Release on `v*` tag push

### Fixed
- BlockNote's hardcoded `codeBlock` dark background (`#161616` / `#fff`) is now overridden per IDE theme so the code block matches editor surroundings in both light and dark modes

## [0.1.0]

Initial JetBrains Marketplace release.

### Added
- WYSIWYG Markdown editor (BlockNote, Notion-style block editor) embedded in JCEF Chromium browser
- IDE Dark/Light theme synchronization
- Auto-save with 1-second debounce and external file change detection on focus
- Image upload via drag & drop and clipboard paste
- LaTeX math (KaTeX): block (`$$...$$`) and inline (`$...$`)
- Mermaid diagram rendering
- BlockNote slash menu with custom Math (block + inline) and Mermaid commands
- Settings UI (Settings → Tools → Markora) with persisted preferences
- Plugin icons (light / dark) and JetBrains Marketplace listing
