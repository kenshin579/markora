package com.github.kenshin579.markora.controller

import com.intellij.openapi.diagnostic.logger
import io.netty.channel.ChannelHandlerContext
import io.netty.handler.codec.http.DefaultHttpHeaders
import io.netty.handler.codec.http.FullHttpRequest
import io.netty.handler.codec.http.HttpHeaderNames
import io.netty.handler.codec.http.HttpResponseStatus
import io.netty.handler.codec.http.QueryStringDecoder
import org.jetbrains.io.FileResponses
import java.io.File

object LocalImageController {

    private val LOG = logger<LocalImageController>()

    fun handle(
        urlDecoder: QueryStringDecoder,
        request: FullHttpRequest,
        context: ChannelHandlerContext
    ): Boolean {
        val filePath = urlDecoder.parameters()["path"]?.firstOrNull()
        if (filePath == null) {
            sendError(request, context, HttpResponseStatus.BAD_REQUEST, "Missing path parameter")
            return true
        }

        val file = File(filePath)
        if (!file.exists() || !file.isFile) {
            sendError(request, context, HttpResponseStatus.NOT_FOUND, "Image not found")
            return true
        }

        try {
            // FileResponses.sendFile은 content-type(mime-types.csv)·content-length·캐시 헤더를
            // 자동 처리하고 zero-copy로 전송한다 — Netty 버퍼를 직접 다루지 않는다.
            val headers = DefaultHttpHeaders()
            headers.set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            FileResponses.sendFile(request, context.channel(), file.toPath(), headers)
        } catch (e: Exception) {
            LOG.error("Failed to serve image: $filePath", e)
            sendError(request, context, HttpResponseStatus.INTERNAL_SERVER_ERROR, "Failed to read image")
        }
        return true
    }

    private fun sendError(
        request: FullHttpRequest,
        context: ChannelHandlerContext,
        status: HttpResponseStatus,
        msg: String
    ) {
        sendTextResponse(context.channel(), request, status, "text/plain", msg)
    }
}
