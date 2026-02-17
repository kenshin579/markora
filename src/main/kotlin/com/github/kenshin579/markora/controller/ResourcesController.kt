package com.github.kenshin579.markora.controller

import com.intellij.openapi.diagnostic.logger
import io.netty.buffer.Unpooled
import io.netty.channel.ChannelHandlerContext
import io.netty.handler.codec.http.*

object ResourcesController {

    private val LOG = logger<ResourcesController>()

    private val MIME_TYPES = mapOf(
        "js" to "application/javascript",
        "css" to "text/css",
        "html" to "text/html",
        "json" to "application/json",
        "png" to "image/png",
        "gif" to "image/gif",
        "svg" to "image/svg+xml",
        "woff" to "font/woff",
        "woff2" to "font/woff2",
        "ttf" to "font/ttf"
    )

    fun handle(
        resourcePath: String,
        @Suppress("UNUSED_PARAMETER") request: FullHttpRequest,
        context: ChannelHandlerContext
    ): Boolean {
        val classLoader = ResourcesController::class.java.classLoader
        val inputStream = classLoader.getResourceAsStream(resourcePath)

        if (inputStream == null) {
            LOG.warn("Resource not found: $resourcePath")
            val response = DefaultFullHttpResponse(
                HttpVersion.HTTP_1_1,
                HttpResponseStatus.NOT_FOUND
            )
            context.channel().writeAndFlush(response)
            return true
        }

        val bytes = inputStream.use { it.readBytes() }
        val extension = resourcePath.substringAfterLast('.', "")
        val contentType = MIME_TYPES[extension] ?: "application/octet-stream"

        val response = DefaultFullHttpResponse(
            HttpVersion.HTTP_1_1,
            HttpResponseStatus.OK,
            Unpooled.wrappedBuffer(bytes)
        )
        response.headers().set(HttpHeaderNames.CONTENT_TYPE, "$contentType; charset=UTF-8")
        response.headers().set(HttpHeaderNames.CONTENT_LENGTH, bytes.size)
        response.headers().set(HttpHeaderNames.CACHE_CONTROL, "max-age=3600")

        context.channel().writeAndFlush(response)
        return true
    }
}
