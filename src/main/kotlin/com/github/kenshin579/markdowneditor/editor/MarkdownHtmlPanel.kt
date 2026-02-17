package com.github.kenshin579.markdowneditor.editor

import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import javax.swing.JComponent

class MarkdownHtmlPanel(
    private val project: Project,
    private val file: VirtualFile
) : Disposable {

    private val browser: JBCefBrowser = JBCefBrowser()
    private val jsQuery: JBCefJSQuery = JBCefJSQuery.create(browser as JBCefBrowserBase)

    val component: JComponent
        get() = browser.component

    init {
        val html = buildHelloWorldHtml()
        browser.loadHTML(html)
    }

    private fun buildHelloWorldHtml(): String {
        return """
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                        padding: 20px;
                        margin: 0;
                    }
                    h1 { color: #333; }
                    .info { color: #666; font-size: 14px; }
                </style>
            </head>
            <body>
                <h1>Markdown WYSIWYG Editor</h1>
                <p class="info">File: ${file.name}</p>
                <p class="info">JCEF panel loaded successfully!</p>
            </body>
            </html>
        """.trimIndent()
    }

    override fun dispose() {
        jsQuery.dispose()
        browser.dispose()
    }
}
