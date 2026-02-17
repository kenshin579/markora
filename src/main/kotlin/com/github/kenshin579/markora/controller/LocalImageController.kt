package com.github.kenshin579.markora.controller

import com.intellij.openapi.diagnostic.logger
import io.netty.buffer.Unpooled
import io.netty.channel.ChannelHandlerContext
import io.netty.handler.codec.http.*
import java.io.File
import java.nio.charset.StandardCharsets

object LocalImageController {

    private val LOG = logger<LocalImageController>()

    private val MIME_TYPES = mapOf(
        "png" to "image/png",
        "jpg" to "image/jpeg",
        "jpeg" to "image/jpeg",
        "gif" to "image/gif",
        "svg" to "image/svg+xml",
        "webp" to "image/webp",
        "bmp" to "image/bmp",
        "ico" to "image/x-icon"
    )

    fun handle(
        urlDecoder: QueryStringDecoder,
        @Suppress("UNUSED_PARAMETER") request: FullHttpRequest,
        context: ChannelHandlerContext
    ): Boolean {
        val filePath = urlDecoder.parameters()["path"]?.firstOrNull()
        if (filePath == null) {
            sendError(context, HttpResponseStatus.BAD_REQUEST, "Missing path parameter")
            return true
        }

        val file = File(filePath)
        if (!file.exists() || !file.isFile) {
            sendError(context, HttpResponseStatus.NOT_FOUND, "Image not found")
            return true
        }

        try {
            val bytes = file.readBytes()
            val extension = file.extension.lowercase()
            val contentType = MIME_TYPES[extension] ?: "application/octet-stream"

            val response = DefaultFullHttpResponse(
                HttpVersion.HTTP_1_1,
                HttpResponseStatus.OK,
                Unpooled.wrappedBuffer(bytes)
            )
            response.headers().set(HttpHeaderNames.CONTENT_TYPE, contentType)
            response.headers().set(HttpHeaderNames.CONTENT_LENGTH, bytes.size)
            response.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            response.headers().set(HttpHeaderNames.CACHE_CONTROL, "max-age=60")
            context.channel().writeAndFlush(response)
        } catch (e: Exception) {
            LOG.error("Failed to serve image: $filePath", e)
            sendError(context, HttpResponseStatus.INTERNAL_SERVER_ERROR, "Failed to read image")
        }
        return true
    }

    private fun sendError(context: ChannelHandlerContext, status: HttpResponseStatus, msg: String) {
        val bytes = msg.toByteArray(StandardCharsets.UTF_8)
        val response = DefaultFullHttpResponse(
            HttpVersion.HTTP_1_1,
            status,
            Unpooled.wrappedBuffer(bytes)
        )
        response.headers().set(HttpHeaderNames.CONTENT_TYPE, "text/plain; charset=UTF-8")
        response.headers().set(HttpHeaderNames.CONTENT_LENGTH, bytes.size)
        context.channel().writeAndFlush(response)
    }
}
