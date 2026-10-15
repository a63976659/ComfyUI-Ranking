"""本地小型控制JSON的有界读取；容量与响应交付由调用方拥有。仅依赖标准库。"""
import asyncio
import json
import math
import time


def check_headers(request, max_bytes, error):
    encoding = request.headers.get('Content-Encoding', '').strip().lower()
    if encoding not in ('', 'identity'):
        raise error()
    names = [name.lower() for name, _ in getattr(request, 'raw_headers', ())]
    if (names.count(b'content-encoding') > 1 or names.count(b'content-length') > 1
            or (b'content-length' in names and b'transfer-encoding' in names)):
        raise error()
    declared = request.content_length
    if declared is not None and declared > max_bytes:
        raise error(413)


def check_connection(request):
    if request.transport is None or request.transport.is_closing():
        raise asyncio.CancelledError()


def _finite_float(value):
    result = float(value)
    if not math.isfinite(result):
        raise ValueError('invalid control number')
    return result


def _reject_constant(value):
    raise ValueError('invalid control number')


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate control field')
        result[key] = value
    return result


async def read_json(request, *, max_bytes, chunk_bytes, max_depth, idle_seconds,
                    total_seconds, error, ensure_connected=check_connection):
    """调用前应取得容量；保持正数EOF探测、分块深度检查及软累计时间。"""
    check_headers(request, max_bytes, error)
    ensure_connected(request)
    deadline = time.monotonic() + total_seconds
    declared = request.content_length
    body = bytearray()
    stack = []
    in_string = escaped = False
    while True:
        ensure_connected(request)
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise error(408)
        try:
            async with asyncio.timeout(min(idle_seconds, remaining)):
                chunk = await request.content.read(min(chunk_bytes, max_bytes-len(body)+1))
        except TimeoutError:
            raise error(408) from None
        except ConnectionError:
            raise asyncio.CancelledError() from None
        except Exception:
            raise error() from None
        if not chunk:
            break
        if len(body)+len(chunk) > max_bytes:
            raise error(413)
        for value in chunk:
            if in_string:
                if escaped:
                    escaped = False
                elif value == 92:
                    escaped = True
                elif value == 34:
                    in_string = False
            elif value == 34:
                in_string = True
            elif value in (123, 91):
                stack.append(value)
                if len(stack) > max_depth:
                    raise error()
            elif value in (125, 93):
                if not stack or stack.pop() != (123 if value == 125 else 91):
                    raise error()
        body.extend(chunk)
    ensure_connected(request)
    if time.monotonic() >= deadline:
        raise error(408)
    if declared is not None and len(body) != declared:
        raise error()
    data = json.loads(body.decode('utf-8'), parse_float=_finite_float,
                      parse_constant=_reject_constant, object_pairs_hook=_unique_object)
    if time.monotonic() >= deadline:
        raise error(408)
    return data
