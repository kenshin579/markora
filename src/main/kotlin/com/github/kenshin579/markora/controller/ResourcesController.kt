package com.github.kenshin579.markora.controller

import com.intellij.openapi.diagnostic.logger
import io.netty.channel.ChannelHandlerContext
import io.netty.handler.codec.http.FullHttpRequest
import io.netty.handler.codec.http.HttpResponseStatus
import org.jetbrains.io.send

object ResourcesController {

    private val LOG = logger<ResourcesController>()

    fun handle(
        resourcePath: String,
        request: FullHttpRequest,
        context: ChannelHandlerContext,
        server: PreviewStaticServer
    ): Boolean {
        val classLoader = ResourcesController::class.java.classLoader
        val inputStream = classLoader.getResourceAsStream(resourcePath)

        if (inputStream == null) {
            LOG.warn("Resource not found: $resourcePath")
            HttpResponseStatus.NOT_FOUND.send(context.channel(), request)
            return true
        }

        val bytes = inputStream.use { it.readBytes() }
        // 플랫폼 sendData를 사용해 Netty 버퍼(Unpooled/ByteBuf)를 직접 다루지 않는다.
        // content-type은 파일 확장자 기준으로 FileResponses가 채운다.
        return server.sendResource(bytes, resourcePath, request, context)
    }
}
