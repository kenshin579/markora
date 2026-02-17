package com.github.kenshin579.markdowneditor.editor

import com.github.kenshin579.markdowneditor.controller.PreviewStaticServer
import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.editor.colors.EditorColorsManager
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
        loadEditor()
    }

    private fun loadEditor() {
        val template = loadTemplate()
        if (template != null) {
            val serverUrl = PreviewStaticServer.getServiceUrl()
            val isDark = EditorColorsManager.getInstance().isDarkEditor

            val html = template
                .replace("{{serverUrl}}", serverUrl)
                .replace("{{filePath}}", file.path)
                .replace("{{darcula}}", isDark.toString())

            browser.loadHTML(html)
        } else {
            LOG.error("Failed to load editor.html template")
            browser.loadHTML("<html><body><h1>Error: Template not found</h1></body></html>")
        }
    }

    private fun loadTemplate(): String? {
        return try {
            val inputStream = javaClass.classLoader.getResourceAsStream("template/editor.html")
            inputStream?.bufferedReader()?.readText()
        } catch (e: Exception) {
            LOG.error("Failed to read editor template", e)
            null
        }
    }

    fun executeJavaScript(script: String) {
        browser.cefBrowser.executeJavaScript(script, null, 0)
    }

    override fun dispose() {
        jsQuery.dispose()
        browser.dispose()
    }

    companion object {
        private val LOG = logger<MarkdownHtmlPanel>()
    }
}
