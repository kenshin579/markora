package com.github.kenshin579.markora.editor

import com.github.kenshin579.markora.controller.PreviewStaticServer
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
        val serverUrl = PreviewStaticServer.getServiceUrl()
        val isDark = EditorColorsManager.getInstance().isDarkEditor
        val params = listOf(
            "filePath=" + java.net.URLEncoder.encode(file.path, Charsets.UTF_8),
            "serverUrl=" + java.net.URLEncoder.encode(serverUrl, Charsets.UTF_8),
            "dark=$isDark"
        ).joinToString("&")
        val url = "${serverUrl}resources/blocknote/dist/index.html?$params"
        browser.loadURL(url)
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
