package com.github.kenshin579.markdowneditor.controller

import com.intellij.openapi.diagnostic.logger
import io.netty.channel.ChannelHandlerContext
import io.netty.handler.codec.http.FullHttpRequest
import io.netty.handler.codec.http.HttpMethod
import io.netty.handler.codec.http.HttpRequest
import io.netty.handler.codec.http.QueryStringDecoder
import org.jetbrains.ide.HttpRequestHandler

class PreviewStaticServer : HttpRequestHandler() {

    override fun isAccessible(request: HttpRequest): Boolean {
        return request.uri().startsWith(PREFIX)
    }

    override fun isSupported(request: FullHttpRequest): Boolean {
        return super.isSupported(request) &&
            request.uri().startsWith(PREFIX) &&
            (request.method() == HttpMethod.GET || request.method() == HttpMethod.POST)
    }

    override fun process(
        urlDecoder: QueryStringDecoder,
        request: FullHttpRequest,
        context: ChannelHandlerContext
    ): Boolean {
        val path = urlDecoder.path().removePrefix(PREFIX)
        LOG.info("Processing request: $path")

        return when {
            path.startsWith("api/file") ->
                MarkdownFileController.handle(urlDecoder, request, context)
            path.startsWith("api/upload") ->
                ImageUploadController.handle(urlDecoder, request, context)
            path.startsWith("api/local-image") ->
                LocalImageController.handle(urlDecoder, request, context)
            path.startsWith("resources/") ->
                ResourcesController.handle(path.removePrefix("resources/"), request, context)
            else -> false
        }
    }

    companion object {
        const val PREFIX = "/markdown-editor/"
        private val LOG = logger<PreviewStaticServer>()

        fun getServiceUrl(): String {
            val port = org.jetbrains.ide.BuiltInServerManager.getInstance().port
            return "http://localhost:$port$PREFIX"
        }
    }
}
