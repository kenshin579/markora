# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IntelliJ Platform plugin for Markdown editing. The project is in early development.

- **Repository**: https://github.com/kenshin579/intellij-plugin-markdown-editor
- **Language**: Kotlin (expected)
- **Build System**: Gradle with IntelliJ Platform Plugin

## Build Commands

```bash
# Build the plugin
./gradlew build

# Run tests
./gradlew test

# Run a single test class
./gradlew test --tests "com.example.ClassName"

# Run IDE sandbox with the plugin loaded
./gradlew runIde

# Package the plugin for distribution
./gradlew buildPlugin
```

## Architecture

This is an IntelliJ Platform plugin project following the standard structure:

- `src/main/kotlin/` — Plugin source code
- `src/main/resources/META-INF/plugin.xml` — Plugin descriptor (actions, extensions, services)
- `src/test/kotlin/` — Tests
- `build.gradle.kts` — Build configuration with IntelliJ Platform Plugin SDK
