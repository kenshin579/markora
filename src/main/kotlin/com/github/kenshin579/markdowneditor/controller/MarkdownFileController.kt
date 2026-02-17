package com.github.kenshin579.markdowneditor.controller

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.vfs.LocalFileSystem
import io.netty.buffer.Unpooled
import io.netty.channel.ChannelHandlerContext
import io.netty.handler.codec.http.*
import java.nio.charset.StandardCharsets

object MarkdownFileController {

    private val LOG = logger<MarkdownFileController>()

    fun handle(
        urlDecoder: QueryStringDecoder,
        request: FullHttpRequest,
        context: ChannelHandlerContext
    ): Boolean {
        val path = urlDecoder.path().removePrefix(PreviewStaticServer.PREFIX)

        return when {
            path == "api/file/read" && request.method() == HttpMethod.GET -> {
                handleRead(urlDecoder, context)
            }
            path == "api/file/save" && request.method() == HttpMethod.POST -> {
                handleSave(request, context)
            }
            else -> false
        }
    }

    private fun handleRead(urlDecoder: QueryStringDecoder, context: ChannelHandlerContext): Boolean {
        val filePath = urlDecoder.parameters()["path"]?.firstOrNull()
        if (filePath == null) {
            sendJsonResponse(context, HttpResponseStatus.BAD_REQUEST, """{"error":"Missing path parameter"}""")
            return true
        }

        val virtualFile = LocalFileSystem.getInstance().findFileByPath(filePath)
        if (virtualFile == null) {
            sendJsonResponse(context, HttpResponseStatus.NOT_FOUND, """{"error":"File not found"}""")
            return true
        }

        val content = ReadAction.compute<String, Throwable> {
            FileDocumentManager.getInstance().getDocument(virtualFile)?.text ?: ""
        }

        val escapedContent = content
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")

        sendJsonResponse(context, HttpResponseStatus.OK, """{"content":"$escapedContent"}""")
        return true
    }

    private fun handleSave(request: FullHttpRequest, context: ChannelHandlerContext): Boolean {
        val body = request.content().toString(StandardCharsets.UTF_8)

        // Simple JSON parsing for {"path":"...","content":"..."}
        val pathMatch = """"path"\s*:\s*"([^"]*?)"""".toRegex().find(body)
        val contentMatch = """"content"\s*:\s*"([\s\S]*?)"\s*\}""".toRegex().find(body)

        val filePath = pathMatch?.groupValues?.get(1)
        val content = contentMatch?.groupValues?.get(1)
            ?.replace("\\n", "\n")
            ?.replace("\\r", "\r")
            ?.replace("\\t", "\t")
            ?.replace("\\\"", "\"")
            ?.replace("\\\\", "\\")

        if (filePath == null || content == null) {
            sendJsonResponse(context, HttpResponseStatus.BAD_REQUEST, """{"error":"Invalid request body"}""")
            return true
        }

        val virtualFile = LocalFileSystem.getInstance().findFileByPath(filePath)
        if (virtualFile == null) {
            sendJsonResponse(context, HttpResponseStatus.NOT_FOUND, """{"error":"File not found"}""")
            return true
        }

        val project = ProjectManager.getInstance().openProjects.firstOrNull()

        ApplicationManager.getApplication().invokeLater {
            WriteCommandAction.runWriteCommandAction(project) {
                val document = FileDocumentManager.getInstance().getDocument(virtualFile)
                document?.setText(content)
            }
        }

        sendJsonResponse(context, HttpResponseStatus.OK, """{"success":true}""")
        return true
    }

    private fun sendJsonResponse(
        context: ChannelHandlerContext,
        status: HttpResponseStatus,
        json: String
    ) {
        val bytes = json.toByteArray(StandardCharsets.UTF_8)
        val response = DefaultFullHttpResponse(
            HttpVersion.HTTP_1_1,
            status,
            Unpooled.wrappedBuffer(bytes)
        )
        response.headers().set(HttpHeaderNames.CONTENT_TYPE, "application/json; charset=UTF-8")
        response.headers().set(HttpHeaderNames.CONTENT_LENGTH, bytes.size)
        response.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        context.channel().writeAndFlush(response)
    }
}
