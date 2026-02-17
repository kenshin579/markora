# Markora

A WYSIWYG Markdown editor plugin for JetBrains IDEs.

Markora brings a distraction-free, rich visual Markdown editing experience directly into your JetBrains IDE. Edit Markdown files with real-time rendering — no split pane, no preview panel, just seamless WYSIWYG editing.

<!-- TODO: Add screenshot -->
<!-- ![Markora Screenshot](docs/images/screenshot.png) -->

## Features

- **WYSIWYG Editing** — Edit Markdown with instant visual rendering powered by [Vditor](https://github.com/Vanessa219/vditor)
- **Dual Mode** — Switch between WYSIWYG and Source mode
- **Theme Sync** — Automatically matches your IDE's Dark/Light theme
- **Auto-Save** — Changes are saved automatically with a configurable debounce delay
- **Image Support** — Drag & drop or paste images from clipboard; stored in a local `images/` directory with relative paths
- **LaTeX Math** — Inline (`$...$`) and block (`$$...$$`) math rendering via KaTeX
- **Mermaid Diagrams** — Render flowcharts, sequence diagrams, gantt charts, and more
- **Slash Commands** — Type `/` to quickly insert headings, lists, code blocks, tables, math, diagrams, and more
- **Code Blocks** — Syntax highlighting with line numbers
- **Emoji** — Support for `:emoji:` syntax
- **HTML Export** — Export your Markdown files to HTML
- **External Links** — Links open in your system browser

## Slash Commands

Type `/` in the editor to access quick-insert commands:

| Command | Description |
|---------|-------------|
| `/h1` ~ `/h6` | Headings |
| `/bullet` | Unordered list |
| `/num` | Ordered list |
| `/todo` | Checklist |
| `/quote` | Block quote |
| `/code` | Code block |
| `/table` | Table |
| `/image` | Image |
| `/equation` | Inline LaTeX |
| `/math` | Block LaTeX |
| `/mermaid` | Mermaid diagram |
| `/toc` | Table of contents |
| `/div` | Horizontal divider |

## Requirements

- **JetBrains IDE** 2024.2 or later (IntelliJ IDEA, WebStorm, PyCharm, GoLand, etc.)
- **JCEF support** (enabled by default in most JetBrains IDEs)

## Installation

### From JetBrains Marketplace (Coming Soon)

1. Open **Settings** > **Plugins** > **Marketplace**
2. Search for **Markora**
3. Click **Install** and restart your IDE

### Manual Installation

1. Download the latest release from [GitHub Releases](https://github.com/kenshin579/intellij-plugin-markdown-editor/releases)
2. Open **Settings** > **Plugins** > **Gear icon** > **Install Plugin from Disk...**
3. Select the downloaded `.zip` file and restart your IDE

## Usage

1. Open any `.md` file in your JetBrains IDE
2. Select the **Markora** editor tab (appears alongside the default editor)
3. Start editing in WYSIWYG mode
4. Use the status bar buttons at the bottom to switch between **WYSIWYG** and **Source** mode

## Settings

Configure the plugin at **Settings** > **Tools** > **Markora**:

| Setting | Description | Default |
|---------|-------------|---------|
| Default Mode | WYSIWYG or Source | WYSIWYG |
| Font Size | Editor font size (px) | 16 |
| Auto-Save Delay | Save debounce time (ms) | 1000 |
| Show Line Numbers | Line numbers in code blocks | true |

## Building from Source

```bash
# Clone the repository
git clone https://github.com/kenshin579/intellij-plugin-markdown-editor.git
cd intellij-plugin-markdown-editor

# Build the plugin
./gradlew build

# Run IDE sandbox with the plugin loaded
./gradlew runIde

# Package the plugin for distribution
./gradlew buildPlugin
```

**Prerequisites**: JDK 21

## Tech Stack

- **Kotlin** — Plugin source code
- **IntelliJ Platform SDK** — IDE integration
- **JCEF** (Chromium Embedded Framework) — Web-based editor rendering
- **Vditor** — Open-source Markdown WYSIWYG editor library
- **KaTeX** — LaTeX math rendering
- **Mermaid** — Diagram rendering

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is open source. See the [LICENSE](LICENSE) file for details.
