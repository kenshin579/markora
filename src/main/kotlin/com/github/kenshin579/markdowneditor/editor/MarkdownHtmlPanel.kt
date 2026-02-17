package com.github.kenshin579.markdowneditor.editor

import com.github.kenshin579.markdowneditor.controller.PreviewStaticServer
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLifeSpanHandlerAdapter
import org.cef.handler.CefRequestHandlerAdapter
import org.cef.network.CefRequest
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
        setupHandlers()
        loadEditor()
    }

    private fun setupHandlers() {
        // Handle external link clicks - open in system browser
        browser.jbCefClient.addRequestHandler(object : CefRequestHandlerAdapter() {
            override fun onBeforeBrowse(
                browser: CefBrowser?,
                frame: CefFrame?,
                request: CefRequest?,
                userGesture: Boolean,
                isRedirect: Boolean
            ): Boolean {
                val url = request?.url ?: return false
                // Allow internal navigation (data: URLs, about:blank, localhost)
                if (url.startsWith("data:") || url.startsWith("about:") ||
                    url.contains("localhost") || url.contains("127.0.0.1")) {
                    return false
                }
                // Open external URLs in system browser
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    BrowserUtil.browse(url)
                    return true
                }
                return false
            }
        }, browser.cefBrowser)

        // Prevent popup windows - open in system browser instead
        browser.jbCefClient.addLifeSpanHandler(object : CefLifeSpanHandlerAdapter() {
            override fun onBeforePopup(
                browser: CefBrowser?,
                frame: CefFrame?,
                targetUrl: String?,
                targetFrameName: String?
            ): Boolean {
                if (targetUrl != null && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
                    BrowserUtil.browse(targetUrl)
                }
                return true // Always cancel popup
            }
        }, browser.cefBrowser)
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
