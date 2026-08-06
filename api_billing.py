# api_billing.py — 本地计费代理路由
# 为同机其他插件（如 NodeCraft-AI）提供 localhost 计费接口，
# 内部转发至 RanKing 云端 Open API。

import aiohttp
from aiohttp import web

# ─── 常量 ───────────────────────────────────────────────
RANKING_CLOUD_URL = "https://zhiwei666-comfyui-ranking-api.hf.space"
_REQUEST_TIMEOUT = aiohttp.ClientTimeout(total=30)


# ─── 内部工具函数 ─────────────────────────────────────────

def _build_headers(request):
    """构建转发请求头，透传 X-Plugin-Key（如果调用方提供）"""
    headers = {"Content-Type": "application/json"}
    plugin_key = request.headers.get("X-Plugin-Key")
    if plugin_key:
        headers["X-Plugin-Key"] = plugin_key
    return headers


async def _forward_post(request, cloud_path: str, payload: dict) -> web.Response:
    """通用 POST 转发逻辑：发送到云端并透传响应"""
    headers = _build_headers(request)
    url = f"{RANKING_CLOUD_URL}{cloud_path}"

    try:
        async with aiohttp.ClientSession(timeout=_REQUEST_TIMEOUT) as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                body = await resp.read()
                # 透传云端响应状态码和内容
                return web.Response(
                    status=resp.status,
                    body=body,
                    content_type=resp.content_type or "application/json",
                )
    except aiohttp.ClientError as e:
        # 网络不可达 / 连接超时等
        return web.json_response(
            {"success": False, "error": f"云端服务不可达: {str(e)}"},
            status=503,
        )
    except Exception as e:
        return web.json_response(
            {"success": False, "error": f"内部错误: {str(e)}"},
            status=500,
        )


async def _forward_get(request, cloud_path: str, headers: dict, params: dict = None) -> web.Response:
    """通用 GET 转发逻辑"""
    url = f"{RANKING_CLOUD_URL}{cloud_path}"

    try:
        async with aiohttp.ClientSession(timeout=_REQUEST_TIMEOUT) as session:
            async with session.get(url, headers=headers, params=params) as resp:
                body = await resp.read()
                return web.Response(
                    status=resp.status,
                    body=body,
                    content_type=resp.content_type or "application/json",
                )
    except aiohttp.ClientError as e:
        return web.json_response(
            {"success": False, "error": f"云端服务不可达: {str(e)}"},
            status=503,
        )
    except Exception as e:
        return web.json_response(
            {"success": False, "error": f"内部错误: {str(e)}"},
            status=500,
        )


# ─── 路由处理函数 ─────────────────────────────────────────

async def local_deduct_handler(request):
    """POST /ranking/local/deduct — 本地扣款代理"""
    try:
        data = await request.json()
    except Exception:
        return web.json_response(
            {"success": False, "error": "请求体解析失败，需要合法 JSON"},
            status=400,
        )

    # 参数校验
    token = data.get("token")
    amount = data.get("amount")
    if not token:
        return web.json_response(
            {"success": False, "error": "缺少必填参数: token"},
            status=400,
        )
    if amount is None:
        return web.json_response(
            {"success": False, "error": "缺少必填参数: amount"},
            status=400,
        )

    # 构建转发载荷
    payload = {
        "token": token,
        "amount": amount,
    }
    if data.get("reason"):
        payload["reason"] = data["reason"]
    if data.get("reference_id"):
        payload["reference_id"] = data["reference_id"]

    return await _forward_post(request, "/api/open/deduct", payload)


async def local_refund_handler(request):
    """POST /ranking/local/refund — 本地退款代理"""
    try:
        data = await request.json()
    except Exception:
        return web.json_response(
            {"success": False, "error": "请求体解析失败，需要合法 JSON"},
            status=400,
        )

    # 参数校验
    token = data.get("token")
    transaction_id = data.get("transaction_id")
    amount = data.get("amount")
    if not token:
        return web.json_response(
            {"success": False, "error": "缺少必填参数: token"},
            status=400,
        )
    if not transaction_id:
        return web.json_response(
            {"success": False, "error": "缺少必填参数: transaction_id"},
            status=400,
        )
    if amount is None:
        return web.json_response(
            {"success": False, "error": "缺少必填参数: amount"},
            status=400,
        )

    payload = {
        "token": token,
        "transaction_id": transaction_id,
        "amount": amount,
    }

    return await _forward_post(request, "/api/open/refund", payload)


async def local_balance_handler(request):
    """GET /ranking/local/balance — 本地余额查询代理"""
    # 从 Authorization 头或查询参数中提取 token
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    else:
        token = request.query.get("token", "").strip()

    if not token:
        return web.json_response(
            {"success": False, "error": "缺少用户 token（通过 Authorization 头或 ?token= 参数提供）"},
            status=400,
        )

    # 构建转发请求头
    headers = {"Authorization": f"Bearer {token}"}
    plugin_key = request.headers.get("X-Plugin-Key")
    if plugin_key:
        headers["X-Plugin-Key"] = plugin_key

    return await _forward_get(request, "/api/open/balance", headers)
