"""本地图片有界原始读取/解码、所属文件工作；仅标准库，自更新必需。"""
import asyncio
import contextlib
import os
import re
import stat
import threading
import time
import uuid
import zlib

READ_CHUNK_BYTES = 64 * 1024
READ_IDLE_SECONDS = 5
READ_TOTAL_SECONDS = 15
FINISH_SEND_SECONDS = 5
MAX_GZIP_MEMBERS = 256
VIDEO_CHUNK_BYTES = 256 * 1024
VIDEO_TOTAL_SECONDS = 300
VIDEO_READ_IDLE_SECONDS = 15
VIDEO_SEND_SECONDS = 15


class MediaTransferError(Exception):
    def __init__(self, status=502):
        self.status = status


def video_expected_length(response):
    """只接受单一、未压缩的完整视频表示，避免SDK隐式解压与长度歧义。"""
    names = [name.lower() for name, _ in getattr(response, 'raw_headers', ())]
    if (any(names.count(name) > 1 for name in
            (b'content-length', b'content-encoding', b'transfer-encoding'))
            or (response.headers.get('Content-Length') is not None
                and response.headers.get('Transfer-Encoding') is not None)):
        raise MediaTransferError()
    if response.headers.get('Content-Encoding', '').strip().lower() not in ('', 'identity'):
        raise MediaTransferError()
    if response.headers.get('Transfer-Encoding', '').strip().lower() not in ('', 'chunked'):
        raise MediaTransferError()
    if response.headers.get('Content-Range') is not None:
        raise MediaTransferError()
    declared = response.headers.get('Content-Length')
    if declared is None:
        return None
    declared = declared.strip()
    if not re.fullmatch(r'[0-9]+', declared):
        raise MediaTransferError()
    declared = declared.lstrip('0') or '0'
    maximum = str((1 << 63)-1)
    if (declared == '0' or len(declared) > len(maximum)
            or (len(declared) == len(maximum) and declared > maximum)):
        raise MediaTransferError()
    return int(declared)


async def iter_video_body(response, expected, limit):
    """单块拉取并校验；调用方处理完当前块再读取下一块。"""
    received = 0
    iterator = response.content.iter_chunked(VIDEO_CHUNK_BYTES).__aiter__()
    while True:
        try:
            async with asyncio.timeout(VIDEO_READ_IDLE_SECONDS):
                chunk = await anext(iterator)
        except StopAsyncIteration:
            break
        if not chunk or len(chunk) > VIDEO_CHUNK_BYTES:
            raise MediaTransferError()
        received += len(chunk)
        if expected is not None and received > expected:
            raise MediaTransferError()
        if limit is not None and received > limit:
            raise MediaTransferError(413)
        if expected is not None and received == expected:
            # 最后一块确认EOF后才交付，避免已发送的声明长度掩盖迟到错误。
            try:
                async with asyncio.timeout(VIDEO_READ_IDLE_SECONDS):
                    await anext(iterator)
            except StopAsyncIteration:
                yield chunk
                return
            raise MediaTransferError()
        yield chunk
    if not received or (expected is not None and received != expected):
        raise MediaTransferError()


async def read_image_body(response, limit):
    names = [name.lower() for name, _ in getattr(response, 'raw_headers', ())]
    if (names.count(b'content-length') > 1 or names.count(b'content-encoding') > 1
            or (b'content-length' in names and b'transfer-encoding' in names)):
        raise MediaTransferError()
    encoding = response.headers.get('Content-Encoding', '').strip().lower()
    if encoding not in ('', 'identity', 'gzip', 'deflate'):
        raise MediaTransferError()
    declared = response.headers.get('Content-Length')
    if declared is not None:
        declared = declared.strip()
        if not re.fullmatch(r'[0-9]+', declared):
            raise MediaTransferError()
        declared = declared.lstrip('0') or '0'
        if len(declared) > len(str(limit)):
            raise MediaTransferError(413)
        declared = int(declared)
        if declared > limit:
            raise MediaTransferError(413)
    body, prefix = bytearray(), bytearray()
    wire = members = 0
    decoder = None
    compressed = encoding in ('gzip', 'deflate')
    deadline = time.monotonic()+READ_TOTAL_SECONDS

    def check_time():
        if time.monotonic() >= deadline:
            raise TimeoutError()

    def append(data):
        if len(body)+len(data) > limit:
            raise MediaTransferError(413)
        body.extend(data)

    def decode(data):
        nonlocal decoder, members
        check_time()
        if decoder is None:
            if encoding == 'deflate':
                prefix.extend(data)
                if len(prefix) < 2:
                    return
                header = (prefix[0] << 8)+prefix[1]
                window = zlib.MAX_WBITS if prefix[0] & 15 == 8 and header % 31 == 0 else -zlib.MAX_WBITS
                decoder = zlib.decompressobj(window)
                data = bytes(prefix)
                prefix.clear()
            else:
                members += 1
                if members > MAX_GZIP_MEMBERS:
                    raise MediaTransferError()
                decoder = zlib.decompressobj(16+zlib.MAX_WBITS)
        elif decoder.eof:
            if encoding != 'gzip':
                raise MediaTransferError()
            decoder = None
            decode(data)
            return
        while True:
            check_time()
            maximum = min(READ_CHUNK_BYTES, limit-len(body)+1)
            output = decoder.decompress(data, maximum)
            append(output)
            if decoder.eof:
                tail = decoder.unused_data
                if tail:
                    if encoding != 'gzip':
                        raise MediaTransferError()
                    decoder = None
                    decode(tail)
                return
            tail = decoder.unconsumed_tail
            if tail:
                if tail == data and not output:
                    raise MediaTransferError()
                data = tail
            elif len(output) == maximum:
                data = b''  # 有界排空，不调用无界flush。
            else:
                return

    try:
        while True:
            check_time()
            async with asyncio.timeout(min(READ_IDLE_SECONDS, deadline-time.monotonic())):
                chunk = await response.content.read(min(READ_CHUNK_BYTES, limit-wire+1))
            if not chunk:
                break
            wire += len(chunk)
            if wire > limit:
                raise MediaTransferError(413)
            if compressed:
                decode(chunk)
            else:
                append(chunk)
            # 解码已分块限额；每个原始块后让出循环，避免连续就绪数据独占。
            await asyncio.sleep(0)
    except zlib.error:
        raise MediaTransferError() from None
    check_time()
    if (not body or (declared is not None and wire != declared)
            or (compressed and (decoder is None or not decoder.eof))):
        raise MediaTransferError()
    return body


async def wait_owned(future, on_cancel=None):
    cancelled = False
    while not future.done():
        try:
            await asyncio.wait({future})
        except asyncio.CancelledError:
            cancelled = True
            if on_cancel is not None:
                on_cancel()
    try:
        result = future.result()
    except BaseException:
        if cancelled:
            raise asyncio.CancelledError() from None
        raise
    if cancelled:
        raise asyncio.CancelledError()
    return result


async def call_file_operation(function, *args):
    """短文件操作移至后台；取消仍等本次操作退出并消费其结果。"""
    future = asyncio.get_running_loop().run_in_executor(None, function, *args)
    return await wait_owned(future)


def write_image_cache(path, body, cancel):
    temporary = path+'.tmp.'+uuid.uuid4().hex[:8]
    created = committed = False
    try:
        if cancel.is_set():
            raise asyncio.CancelledError()
        with open(temporary, 'xb') as stream:
            created = True
            view = memoryview(body)
            for offset in range(0, len(view), READ_CHUNK_BYTES):
                if cancel.is_set():
                    raise asyncio.CancelledError()
                stream.write(view[offset:offset+READ_CHUNK_BYTES])
        if cancel.is_set():
            raise asyncio.CancelledError()
        os.replace(temporary, path)
        committed = True
    finally:
        if created and not committed:
            with contextlib.suppress(FileNotFoundError):
                os.remove(temporary)


async def write_image_owned(request, path, body):
    cancel = threading.Event()
    worker = asyncio.get_running_loop().run_in_executor(None, write_image_cache, path, body, cancel)
    try:
        while not worker.done():
            if request.transport is None or request.transport.is_closing():
                cancel.set()
                raise asyncio.CancelledError()
            await asyncio.wait({worker}, timeout=.1)
        return worker.result()
    finally:
        if not worker.done():
            cancel.set()
        while not worker.done():
            try:
                await asyncio.wait({worker})
            except asyncio.CancelledError:
                cancel.set()
        with contextlib.suppress(Exception, asyncio.CancelledError):
            worker.result()


def finish_video_cache(temporary, path, created, complete, size, expected):
    if not created:
        return
    try:
        if complete and size > 0 and (expected is None or size == expected):
            os.replace(temporary, path)
    finally:
        with contextlib.suppress(FileNotFoundError):
            os.remove(temporary)


class _OwnedMediaFile:
    """每次仅一个Executor Future；调用方等待完成，取消仍等原文件操作。"""
    def __init__(self):
        self.cancelled = threading.Event()
        self.pending = None
        self.stream = None

    async def _run(self, operation, *args):
        if self.pending is not None:
            raise RuntimeError('Concurrent media file operation')
        self.pending = asyncio.get_running_loop().run_in_executor(None, operation, *args)
        try:
            return await wait_owned(self.pending, self.cancelled.set)
        finally:
            self.pending = None


class VideoCacheWriter(_OwnedMediaFile):
    def __init__(self, path, limit):
        super().__init__()
        self.path, self.limit = path, limit
        self.temporary = path+'.tmp.'+uuid.uuid4().hex[:8]
        self.created = self.finished = False
        self.written = 0

    def _open(self):
        if self.cancelled.is_set():
            raise asyncio.CancelledError()
        self.stream = open(self.temporary, 'xb')
        self.created = True

    async def open(self):
        await self._run(self._open)

    def _write(self, data):
        if self.cancelled.is_set():
            raise asyncio.CancelledError()
        if self.stream is None or self.finished:
            raise RuntimeError('Video file is not open')
        if len(data) > VIDEO_CHUNK_BYTES or self.written+len(data) > self.limit:
            raise MediaTransferError(413)
        written = self.stream.write(data)
        if written != len(data):
            raise OSError('Incomplete video cache write')
        self.written += written

    async def write(self, data):
        # 不预取下一块、不创建后台块队列；每次完成写盘后才返回。
        await self._run(self._write, data)

    def _finish(self, complete, size, expected):
        if self.finished:
            return
        self.finished = True
        stream, self.stream = self.stream, None
        closed = False
        try:
            if stream is not None:
                stream.close()
            closed = True
        finally:
            valid = complete and closed and not self.cancelled.is_set() and size == self.written
            finish_video_cache(self.temporary, self.path, self.created, valid, size, expected)

    async def finish(self, complete, size, expected):
        await self._run(self._finish, complete, size, expected)


class _VideoFileReader(_OwnedMediaFile):
    def __init__(self):
        super().__init__()
        self.close_failed = False

    def _open(self, path, start):
        if self.cancelled.is_set():
            raise asyncio.CancelledError()
        self.stream = open(path, 'rb')
        self.stream.seek(start)

    def _read(self, size):
        if self.cancelled.is_set():
            raise asyncio.CancelledError()
        return self.stream.read(size)

    async def read(self, size):
        if not 0 < size <= VIDEO_CHUNK_BYTES:
            raise ValueError('Invalid video read size')
        return await self._run(self._read, size)

    def _close(self):
        stream = self.stream
        if stream is not None:
            try:
                stream.close()
            except BaseException:
                self.close_failed = True
                raise
            self.stream = None


# 缓存读文件的生命周期准入与源站下载分开，等待期间不提交文件Future。
VIDEO_READER_CONCURRENCY = 4
VIDEO_READER_MAX_QUEUED = 8
VIDEO_READER_QUEUE_SECONDS = 5


class _VideoReaderPermit:
    def __init__(self):
        self.quarantined = False


class _VideoReaderCapacity:
    def __init__(self):
        self.active = threading.BoundedSemaphore(VIDEO_READER_CONCURRENCY)
        self.waiting = threading.BoundedSemaphore(VIDEO_READER_MAX_QUEUED)
        self.quarantined = []

    @property
    def queue_seconds(self):
        return VIDEO_READER_QUEUE_SECONDS

    @contextlib.asynccontextmanager
    async def acquire(self):
        acquired = queued = False
        permit = _VideoReaderPermit()
        deadline = time.monotonic()+self.queue_seconds
        try:
            acquired = self.active.acquire(blocking=False)
            if not acquired:
                queued = self.waiting.acquire(blocking=False)
                if not queued:
                    raise MediaTransferError(503)
                while not acquired:
                    if time.monotonic() >= deadline:
                        raise MediaTransferError(503)
                    await asyncio.sleep(.01)
                    if time.monotonic() >= deadline:
                        raise MediaTransferError(503)
                    acquired = self.active.acquire(blocking=False)
                self.waiting.release()
                queued = False
            yield permit
        finally:
            if queued:
                self.waiting.release()
            if acquired and not permit.quarantined:
                self.active.release()


_video_reader_capacity = _VideoReaderCapacity()


@contextlib.asynccontextmanager
async def open_video_reader(path, start):
    capacity = _video_reader_capacity
    async with capacity.acquire() as permit:
        reader = _VideoFileReader()
        try:
            await reader._run(reader._open, path, start)
            yield reader
        finally:
            try:
                await reader._run(reader._close)
            finally:
                # 原Future可能在取消传播时隐藏关闭异常；以所属线程记录确认。
                if reader.close_failed or reader.stream is not None:
                    reader.close_failed = True
                    permit.quarantined = True
                    capacity.quarantined.append(reader)


IMAGE_READER_CONCURRENCY = 4
IMAGE_READER_MAX_QUEUED = 8
IMAGE_READER_QUEUE_SECONDS = 5
IMAGE_SEND_SECONDS = 15
IMAGE_DELIVERY_SECONDS = 60


class _ImageReaderCapacity(_VideoReaderCapacity):
    def __init__(self):
        self.active = threading.BoundedSemaphore(IMAGE_READER_CONCURRENCY)
        self.waiting = threading.BoundedSemaphore(IMAGE_READER_MAX_QUEUED)
        self.quarantined = []

    @property
    def queue_seconds(self):
        return IMAGE_READER_QUEUE_SECONDS


class _ImageFileReader(_VideoFileReader):
    def _open(self, path, start):
        super()._open(path, start)
        self.info = os.fstat(self.stream.fileno())
        if not stat.S_ISREG(self.info.st_mode):
            raise OSError('Non-regular image cache file')


_image_reader_capacity = _ImageReaderCapacity()


@contextlib.asynccontextmanager
async def open_image_reader(path):
    capacity = _image_reader_capacity
    async with capacity.acquire() as permit:
        reader = _ImageFileReader()
        try:
            await reader._run(reader._open, path, 0)
            yield reader
        finally:
            try:
                await reader._run(reader._close)
            finally:
                if reader.close_failed or reader.stream is not None:
                    reader.close_failed = True
                    permit.quarantined = True
                    capacity.quarantined.append(reader)
