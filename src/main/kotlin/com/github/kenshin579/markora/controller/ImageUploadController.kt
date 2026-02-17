package com.github.kenshin579.markora.controller

import com.intellij.openapi.diagnostic.logger
import io.netty.buffer.Unpooled
import io.netty.channel.ChannelHandlerContext
import io.netty.handler.codec.http.*
import io.netty.handler.codec.http.multipart.DefaultHttpDataFactory
import io.netty.handler.codec.http.multipart.HttpPostRequestDecoder
import io.netty.handler.codec.http.multipart.InterfaceHttpData
import io.netty.handler.codec.http.multipart.MemoryFileUpload
import java.io.File
import java.nio.charset.StandardCharsets
import java.text.SimpleDateFormat
import java.util.*

object ImageUploadController {

    private val LOG = logger<ImageUploadController>()

    fun handle(
        urlDecoder: QueryStringDecoder,
        request: FullHttpRequest,
        context: ChannelHandlerContext
    ): Boolean {
        if (request.method() != HttpMethod.POST) return false

        val filePath = urlDecoder.parameters()["filePath"]?.firstOrNull()
        if (filePath == null) {
            sendJsonResponse(context, HttpResponseStatus.BAD_REQUEST, """{"msg":"Missing filePath parameter"}""")
            return true
        }

        val mdFile = File(filePath)
        val mdDir = mdFile.parentFile

        // Create images directory next to the markdown file
        val imagesDir = File(mdDir, "images")
        if (!imagesDir.exists()) {
            imagesDir.mkdirs()
        }

        try {
            val factory = DefaultHttpDataFactory(DefaultHttpDataFactory.MINSIZE)
            val decoder = HttpPostRequestDecoder(factory, request)
            val succMap = mutableMapOf<String, String>()

            while (decoder.hasNext()) {
                val data = decoder.next()
                if (data.httpDataType == InterfaceHttpData.HttpDataType.FileUpload) {
                    val fileUpload = data as MemoryFileUpload
                    val originalName = fileUpload.filename
                    val extension = originalName.substringAfterLast('.', "png")

                    // Generate unique filename with timestamp
                    val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss").format(Date())
                    val uniqueName = "${timestamp}_${UUID.randomUUID().toString().take(8)}.$extension"

                    val targetFile = File(imagesDir, uniqueName)
                    val bytes = fileUpload.get()
                    targetFile.writeBytes(bytes)

                    // Return relative path from markdown file
                    val relativePath = "images/$uniqueName"
                    succMap[originalName] = relativePath

                    LOG.info("Image uploaded: $originalName -> $relativePath")
                }
            }
            decoder.destroy()

            // Vditor expects: {"msg":"","code":0,"data":{"succMap":{"filename":"path"}}}
            val succMapJson = succMap.entries.joinToString(",") { (k, v) ->
                "\"${escapeJson(k)}\":\"${escapeJson(v)}\""
            }
            val responseJson = """{"msg":"","code":0,"data":{"succMap":{$succMapJson}}}"""
            sendJsonResponse(context, HttpResponseStatus.OK, responseJson)
        } catch (e: Exception) {
            LOG.error("Image upload failed", e)
            sendJsonResponse(context, HttpResponseStatus.INTERNAL_SERVER_ERROR, """{"msg":"Upload failed: ${escapeJson(e.message ?: "")}","code":1}""")
        }
        return true
    }

    private fun escapeJson(s: String): String {
        return s.replace("\\", "\\\\").replace("\"", "\\\"")
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
