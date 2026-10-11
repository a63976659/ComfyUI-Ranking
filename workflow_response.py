"""工作流响应编码、请求容量与所属进程；目标进程仅使用标准库。"""
import asyncio
from contextlib import asynccontextmanager
import gc
import importlib.util
import json
import math
from pathlib import Path
import sys
import weakref

MAX_INPUT_BYTES = 256 * 1024 * 1024
MAX_OUTPUT_BYTES = 512 * 1024 * 1024
MAX_JSON_DEPTH = 256
ISOLATION_THRESHOLD_BYTES = 1024 * 1024
CHUNK_BYTES = 64 * 1024
MAX_WAITERS = 4
ADMISSION_TIMEOUT = 15
IO_TIMEOUT = 30
WRITE_IDLE_SECONDS = 30
WRITE_TOTAL_SECONDS = 120
CONTROL_MAX_BYTES = 128 * 1024
CONTROL_IDLE_SECONDS = 10
CONTROL_TOTAL_SECONDS = 30
IDLE_SECONDS = 30
PROCESS_MEMORY_BYTES = 512 * 1024 * 1024
JOB_MEMORY_BYTES = 768 * 1024 * 1024
LINUX_ADDRESS_SPACE_BYTES = 768 * 1024 * 1024

INVALID = (None, "云端返回的数据格式错误，无法解析为工作流 JSON", "invalid_workflow_data")
REJECTED = (None, "云端拒绝了工作流请求", "remote_rejected")


def _reject_constant(value):
    raise ValueError("non-finite workflow number")


def _finite_float(value):
    result = float(value)
    if not math.isfinite(result):
        raise ValueError("non-finite workflow number")
    return result


def _check_cancel(cancel_event):
    if cancel_event is not None and cancel_event.is_set():
        raise RuntimeError("workflow encoding cancelled")


def _validate_depth(data, *, cancel_event=None):
    # 使用迭代器避免递归栈以及宽列表额外复制；不同解释器共用明确深度上限。
    stack = [iter(data.values())]
    while stack:
        _check_cancel(cancel_event)
        try:
            value = next(stack[-1])
        except StopIteration:
            stack.pop()
            continue
        if isinstance(value, (dict, list)):
            if len(stack) >= MAX_JSON_DEPTH:
                raise ValueError("workflow JSON depth budget")
            stack.append(iter(value.values()) if isinstance(value, dict) else iter(value))


def encode_input(content, *, cancel_event=None):
    _check_cancel(cancel_event)
    body = content.encode("utf-8")
    if not 0 < len(body) <= MAX_INPUT_BYTES:
        raise ValueError("workflow input budget")
    _check_cancel(cancel_event)
    return body


def prepare(body, mode, from_cache, *, cancel_event=None):
    """返回已编码的终态响应；所有错误使用稳定码，不包含远端正文。"""
    _check_cancel(cancel_event)
    if mode not in ("json", "sse") or type(from_cache) is not bool:
        raise ValueError("workflow response options")
    if not isinstance(body, bytes) or not 0 < len(body) <= MAX_INPUT_BYTES:
        return INVALID
    try:
        data = json.loads(body.decode("utf-8"), parse_constant=_reject_constant, parse_float=_finite_float)
        _check_cancel(cancel_event)
        if not isinstance(data, dict):
            return INVALID
        # error 键存在即拒绝，不能用远端错误值的真值判断是否成功。
        if "error" in data:
            return REJECTED
        _validate_depth(data, cancel_event=cancel_event)
        if mode == "json":
            envelope = {"status": "success", "data": data, "from_cache": from_cache}
            prefix, suffix = b"", b""
        else:
            envelope = {"stage": "complete", "progress": 100,
                        "message": "✅ 加载完成！" if from_cache else "✅ 下载完成！",
                        "status": "success", "data": data}
            prefix, suffix = b"data: ", b"\n\n"
        # 小输入有阈值约束，大输入在受内存配额保护的目标中执行；保留 C 编码器吞吐。
        output = json.dumps(envelope, ensure_ascii=False, allow_nan=False,
                            separators=(",", ":")).encode("utf-8")
        if len(prefix) + len(output) + len(suffix) > MAX_OUTPUT_BYTES:
            return INVALID
        _check_cancel(cancel_event)
        return prefix + output + suffix, None, None
    except (ValueError, UnicodeError, RecursionError, OverflowError):
        _check_cancel(cancel_event)
        return INVALID


_guard = None


def _owned_guard():
    global _guard
    if _guard is None:
        spec = importlib.util.spec_from_file_location(
            "ranking_workflow_owned_guard", Path(__file__).with_name("process_guard.py"))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        _guard = module
    return _guard


class CapacityError(RuntimeError):
    pass


class WorkflowResponses:
    """每个宿主事件循环一个容量入口和一个懒启动、可复用的编码进程。"""
    def __init__(self):
        self.active = 0
        self.waiters = 0
        self.worker = None
        self.idle = None
        self.closing = None
        self.close_failed = False
        self.stopped = False

    def _cancel_idle(self):
        if self.idle is not None:
            self.idle.cancel()
            self.idle = None

    @asynccontextmanager
    async def capacity(self, request):
        loop = asyncio.get_running_loop()
        if self.stopped:
            raise CapacityError("workflow service stopped")
        if self.waiters >= MAX_WAITERS:
            raise CapacityError("workflow queue full")
        self.waiters += 1
        acquired = False
        deadline = loop.time() + ADMISSION_TIMEOUT
        try:
            while True:
                if self.stopped:
                    raise CapacityError("workflow service stopped")
                transport = request.transport
                if transport is None or transport.is_closing():
                    raise asyncio.CancelledError()
                if not self.active:
                    self.active = 1
                    acquired = True
                    self._cancel_idle()
                    break
                if loop.time() >= deadline:
                    raise CapacityError("workflow queue timeout")
                await asyncio.sleep(min(.05, max(0, deadline - loop.time())))
        finally:
            self.waiters -= 1
        try:
            yield
        finally:
            if acquired:
                self.active = 0
                self._arm_idle()

    def _arm_idle(self):
        self._cancel_idle()
        if self.worker is not None:
            self.idle = asyncio.get_running_loop().call_later(IDLE_SECONDS, self._begin_close)

    def _begin_close(self):
        self._cancel_idle()
        if self.closing is not None and not self.closing.done():
            return self.closing
        owned, self.worker = self.worker, None
        if owned is None:
            return self.closing

        async def finish():
            try:
                await owned.close()
                return True, None
            except (asyncio.CancelledError, Exception) as error:
                # 后台关闭异常作为数据消费，避免泄露工作流或未取回的异常。
                return False, error
        self.closing = asyncio.create_task(finish())
        def consumed(task):
            succeeded, _ = task.result()
            if not succeeded:
                self.close_failed = True
            if self.closing is task:
                self.closing = None
        self.closing.add_done_callback(consumed)
        return self.closing

    async def close(self):
        task = self._begin_close()
        if task is None:
            return
        cancelled = None
        while not task.done():
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError as error:
                cancelled = error
        succeeded, result = task.result()
        # 不长期保留已完成任务中的进程句柄或清理异常。
        if self.closing is task:
            self.closing = None
        if cancelled is not None:
            raise cancelled
        if not succeeded:
            raise result

    async def _get_worker(self):
        self._cancel_idle()
        if self.closing is not None:
            await self.close()
        if self.close_failed or self.stopped:
            raise OSError("workflow worker cleanup unavailable")
        if self.worker is not None and self.worker.process.returncode is not None:
            await self.close()
        if self.worker is None:
            budgets = ({"process_memory_bytes": PROCESS_MEMORY_BYTES,
                        "job_memory_bytes": JOB_MEMORY_BYTES, "active_process_limit": 2}
                       if sys.platform == "win32" else {})
            # 门闩使用基础解释器，Windows Job 中只有门闩与目标，不计 venv 重定向器。
            self.worker = await _owned_guard().start_owned_stdio(
                Path(__file__).resolve(), ("--worker",), **budgets)
        return self.worker

    async def prepare(self, content, mode, from_cache, thread_runner):
        if mode not in ("json", "sse") or type(from_cache) is not bool:
            raise ValueError("workflow response options")
        body = await thread_runner(encode_input, content)
        if len(body) <= ISOLATION_THRESHOLD_BYTES:
            return await thread_runner(prepare, body, mode, from_cache)
        owned = await self._get_worker()
        process = owned.process

        async def write():
            process.stdin.write(bytes((0 if mode == "json" else 1, int(from_cache))))
            process.stdin.write(len(body).to_bytes(4, "big"))
            for offset in range(0, len(body), CHUNK_BYTES):
                process.stdin.write(body[offset:offset + CHUNK_BYTES])
                await process.stdin.drain()

        async def read():
            header = await process.stdout.readexactly(5)
            status, size = header[0], int.from_bytes(header[1:], "big")
            if status in (1, 2) and size == 0:
                return INVALID if status == 1 else REJECTED
            if status != 0 or not 0 < size <= MAX_OUTPUT_BYTES:
                raise ValueError("workflow worker response budget")
            output = bytearray()
            while len(output) < size:
                output.extend(await process.stdout.readexactly(min(CHUNK_BYTES, size - len(output))))
            return bytes(output), None, None

        try:
            _, result = await owned.run_io(write(), read(), timeout=IO_TIMEOUT)
            return result
        except BaseException:
            await self.close()
            raise


_services = weakref.WeakKeyDictionary()


def get_service():
    loop = asyncio.get_running_loop()
    service = _services.get(loop)
    if service is None:
        service = WorkflowResponses()
        _services[loop] = service
    return service


async def shutdown(application):
    """aiohttp 宿主停止处理请求后，收回当前循环的复用进程。"""
    loop = asyncio.get_running_loop()
    service = _services.get(loop)
    if service is not None:
        service.stopped = True
        try:
            await service.close()
        finally:
            _services.pop(loop, None)


def _worker_limits():
    if sys.platform == "linux":
        import resource
        _, hard = resource.getrlimit(resource.RLIMIT_AS)
        limit = min(hard, LINUX_ADDRESS_SPACE_BYTES) if hard != resource.RLIM_INFINITY else LINUX_ADDRESS_SPACE_BYTES
        resource.setrlimit(resource.RLIMIT_AS, (limit, limit))
    elif sys.platform != "win32":
        raise OSError("workflow isolation platform unsupported")


def worker_main():
    try:
        _worker_limits()
        source, destination = sys.stdin.buffer, sys.stdout.buffer
        while True:
            header = source.read(6)
            if not header:
                return 0
            if len(header) != 6 or header[0] not in (0, 1) or header[1] not in (0, 1):
                return 2
            size = int.from_bytes(header[2:], "big")
            if not 0 < size <= MAX_INPUT_BYTES:
                return 2
            body = source.read(size)
            if len(body) != size:
                return 2
            output, error, code = prepare(body, "json" if header[0] == 0 else "sse", bool(header[1]))
            if error is not None:
                destination.write(bytes((2 if code == "remote_rejected" else 1,)) + b"\0\0\0\0")
            else:
                destination.write(b"\0" + len(output).to_bytes(4, "big"))
                destination.write(output)
            destination.flush()
            del body, output, error, code
            gc.collect()
    except Exception:
        # 进程失败只返回退出码，不打印可能携带私有正文的异常。
        return 2


if __name__ == "__main__":
    raise SystemExit(worker_main() if sys.argv[1:] == ["--worker"] else 2)
