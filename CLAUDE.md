# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Markora - Typora-like WYSIWYG Markdown editor plugin for JetBrains IDEs. The project is in early development.

- **Repository**: https://github.com/kenshin579/markora
- **Language**: Kotlin
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

## Release Process

Versioned via `gradle.properties` `pluginVersion`. Use `make release VERSION=x.y.z` (or `make tag` / `make bump-version` for partial steps). See README.md "Release" section for details.

## Architecture

This is an IntelliJ Platform plugin project following the standard structure:

- `src/main/kotlin/` — Plugin source code
- `src/main/resources/META-INF/plugin.xml` — Plugin descriptor (actions, extensions, services)
- `src/test/kotlin/` — Tests
- `build.gradle.kts` — Build configuration with IntelliJ Platform Plugin SDK
