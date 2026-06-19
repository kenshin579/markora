package com.github.kenshin579.markora.controller

import com.intellij.openapi.diagnostic.logger
import io.netty.channel.ChannelHandlerContext
import io.netty.handler.codec.http.*
import io.netty.handler.codec.http.multipart.DefaultHttpDataFactory
import io.netty.handler.codec.http.multipart.FileUpload
import io.netty.handler.codec.http.multipart.HttpPostRequestDecoder
import io.netty.handler.codec.http.multipart.InterfaceHttpData
import java.io.File
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
            sendJsonResponse(request, context, HttpResponseStatus.BAD_REQUEST, """{"msg":"Missing filePath parameter"}""")
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
                    // Memory/Disk/Mixed FileUpload 모두 FileUpload 인터페이스 구현
                    val fileUpload = data as FileUpload
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
            sendJsonResponse(request, context, HttpResponseStatus.OK, responseJson)
        } catch (e: Exception) {
            LOG.error("Image upload failed", e)
            sendJsonResponse(request, context, HttpResponseStatus.INTERNAL_SERVER_ERROR, """{"msg":"Upload failed: ${escapeJson(e.message ?: "")}","code":1}""")
        }
        return true
    }

    private fun escapeJson(s: String): String {
        return s.replace("\\", "\\\\").replace("\"", "\\\"")
    }

    private fun sendJsonResponse(
        request: FullHttpRequest,
        context: ChannelHandlerContext,
        status: HttpResponseStatus,
        json: String
    ) {
        sendTextResponse(context.channel(), request, status, "application/json", json, cors = true)
    }
}
