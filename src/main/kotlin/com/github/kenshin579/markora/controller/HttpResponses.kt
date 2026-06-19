package com.github.kenshin579.markora.controller

import io.netty.channel.Channel
import io.netty.handler.codec.http.FullHttpRequest
import io.netty.handler.codec.http.HttpHeaderNames
import io.netty.handler.codec.http.HttpResponseStatus
import org.jetbrains.io.response
import org.jetbrains.io.send
import java.nio.charset.StandardCharsets

/**
 * 텍스트(JSON/HTML/plain) 응답을 보내는 공통 헬퍼.
 *
 * `org.jetbrains.io.response`/`send`를 사용해 Netty 버퍼(`Unpooled`/`ByteBuf`)를
 * 직접 다루지 않는다 — 플랫폼이 internal로 표시한 API 사용을 피하기 위함.
 * content-length·keep-alive·보안 헤더는 `send`가 자동으로 채운다.
 */
internal fun sendTextResponse(
    channel: Channel,
    request: FullHttpRequest?,
    status: HttpResponseStatus,
    contentType: String,
    body: String,
    cors: Boolean = false,
) {
    val resp = response(body, StandardCharsets.UTF_8)
    resp.status = status
    resp.headers().set(HttpHeaderNames.CONTENT_TYPE, "$contentType; charset=UTF-8")
    if (cors) {
        resp.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_ORIGIN, "*")
    }
    resp.send(channel, request)
}
