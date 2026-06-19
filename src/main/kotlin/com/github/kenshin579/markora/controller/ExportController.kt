package com.github.kenshin579.markora.controller

import com.intellij.openapi.diagnostic.logger
import io.netty.channel.ChannelHandlerContext
import io.netty.handler.codec.http.*
import java.io.File
import java.nio.charset.StandardCharsets

object ExportController {

    private val LOG = logger<ExportController>()

    fun handle(
        urlDecoder: QueryStringDecoder,
        request: FullHttpRequest,
        context: ChannelHandlerContext
    ): Boolean {
        val format = urlDecoder.parameters()["format"]?.firstOrNull() ?: "html"
        val filePath = urlDecoder.parameters()["path"]?.firstOrNull()

        if (filePath == null) {
            sendResponse(request, context, HttpResponseStatus.BAD_REQUEST, "application/json",
                """{"error":"Missing path parameter"}""")
            return true
        }

        val mdFile = File(filePath)
        if (!mdFile.exists()) {
            sendResponse(request, context, HttpResponseStatus.NOT_FOUND, "application/json",
                """{"error":"File not found"}""")
            return true
        }

        try {
            val content = mdFile.readText(StandardCharsets.UTF_8)

            when (format) {
                "html" -> {
                    val htmlContent = wrapInHtml(content, mdFile.nameWithoutExtension)
                    val outputFile = File(mdFile.parent, "${mdFile.nameWithoutExtension}.html")
                    outputFile.writeText(htmlContent, StandardCharsets.UTF_8)

                    sendResponse(request, context, HttpResponseStatus.OK, "application/json",
                        """{"msg":"Exported to ${escapeJson(outputFile.name)}","path":"${escapeJson(outputFile.absolutePath)}"}""")
                }
                else -> {
                    sendResponse(request, context, HttpResponseStatus.BAD_REQUEST, "application/json",
                        """{"error":"Unsupported format: $format"}""")
                }
            }
        } catch (e: Exception) {
            LOG.error("Export failed", e)
            sendResponse(request, context, HttpResponseStatus.INTERNAL_SERVER_ERROR, "application/json",
                """{"error":"Export failed: ${escapeJson(e.message ?: "")}"}""")
        }
        return true
    }

    private fun wrapInHtml(markdownContent: String, title: String): String {
        return """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(title)}</title>
    <style>
        body {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px 40px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 16px;
            line-height: 1.6;
            color: #333;
        }
        pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
        code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
        pre code { background: none; padding: 0; }
        blockquote { border-left: 4px solid #ddd; margin: 0; padding: 0 16px; color: #666; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
        th { background: #f6f8fa; }
        img { max-width: 100%; }
        h1, h2 { border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
    </style>
</head>
<body>
<pre class="markdown-source">${escapeHtml(markdownContent)}</pre>
<script>
// Simple markdown to HTML (basic conversion for export)
// For full rendering, use a proper markdown parser
</script>
</body>
</html>"""
    }

    private fun escapeHtml(s: String): String {
        return s.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
    }

    private fun escapeJson(s: String): String {
        return s.replace("\\", "\\\\").replace("\"", "\\\"")
    }

    private fun sendResponse(
        request: FullHttpRequest,
        context: ChannelHandlerContext,
        status: HttpResponseStatus,
        contentType: String,
        body: String
    ) {
        sendTextResponse(context.channel(), request, status, contentType, body, cors = true)
    }
}
