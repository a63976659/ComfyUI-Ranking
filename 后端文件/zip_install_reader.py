"""本地安装ZIP的有界元数据与Stored/Deflate读取；不使用ZipExtFile。"""
import os
import stat
import struct
import time
import zipfile
import zlib

MAX_DIRECTORY_BYTES = 16 * 1024 * 1024
CHUNK_BYTES = 64 * 1024
SCAN_SECONDS = 120

def _fail():
    raise ValueError('invalid or excessive zip archive')


def _directory(source, size, check, max_directory_bytes, max_entries):
    # EOCD+最大注释读取至多65557字节；不允许前缀/跨盘/额外ZIP64扩展记录。
    tail_size = min(size, 65557)
    source.seek(size - tail_size)
    tail = source.read(tail_size)
    offset = len(tail)
    while True:
        check()
        offset = tail.rfind(b'PK\x05\x06', 0, offset)
        if offset < 0: _fail()
        if offset + 22 <= len(tail):
            record = struct.unpack('<4s4H2LH', tail[offset:offset + 22])
            if offset + 22 + record[7] == len(tail): break
    end = size - tail_size + offset
    _, disk, directory_disk, disk_entries, entries, directory_size, start, _ = record
    if disk or directory_disk or disk_entries != entries: _fail()
    boundary = end
    if end >= 20:
        source.seek(end - 20)
        locator = source.read(20)
        if locator[:4] == b'PK\x06\x07':
            _, zip_disk, zip_offset, disks = struct.unpack('<4sLQL', locator)
            if zip_disk or disks != 1 or zip_offset != end - 76: _fail()
            source.seek(zip_offset)
            raw = source.read(56)
            if len(raw) != 56: _fail()
            fields = struct.unpack('<4sQ2H2L4Q', raw)
            if fields[0] != b'PK\x06\x06' or fields[1] != 44 or fields[4] or fields[5] or fields[6] != fields[7]: _fail()
            entries, directory_size, start = fields[7:10]
            boundary = zip_offset
    if not 0 < entries <= max_entries or not 0 < directory_size <= max_directory_bytes: _fail()
    if start < 4 or start + directory_size != boundary: _fail()
    source.seek(0)
    if source.read(4) != b'PK\x03\x04': _fail()
    # 逐记录确认实际数量，不能让伪造entries绕过ZipInfo对象分配上限。
    position, count = start, 0
    while position < boundary:
        check();source.seek(position)
        header = source.read(46)
        if len(header) != 46 or header[:4] != b'PK\x01\x02': _fail()
        name, extra, comment = struct.unpack_from('<3H', header, 28)
        if not name: _fail()
        position += 46 + name + extra + comment
        count += 1
        if position > boundary or count > max_entries: _fail()
    if count != entries: _fail()
    return start, count, end + 22


class _MetadataReader:
    """限制标准库元数据读取；屏蔽注释中的伪EOCD，保留实际文件内容。"""
    def __init__(self, source, size, comment_start, max_read):
        self.source, self.size, self.comment_start, self.max_read = source, size, comment_start, max_read

    def seek(self, *args): return self.source.seek(*args)
    def tell(self): return self.source.tell()

    def read(self, count=-1):
        start = self.source.tell()
        requested = self.size - start if count < 0 else count
        if requested > max(65557, self.max_read): _fail()
        data = self.source.read(count)
        offset = max(0, self.comment_start - start)
        if offset < len(data):
            data = data[:offset] + b'\x00' * (len(data) - offset)
        return data


class BoundedZipArchive:
    """单一文件句柄覆盖元数据、局部头和成员CRC；调用方负责安全路径及事务。"""
    def __init__(self, path, *, max_zip_bytes, max_entries, max_expanded_bytes,
                 max_member_bytes, check_cancel, max_directory_bytes=MAX_DIRECTORY_BYTES,
                 max_seconds=SCAN_SECONDS):
        for value in (max_zip_bytes, max_entries, max_expanded_bytes, max_member_bytes, max_directory_bytes):
            if type(value) is not int or value <= 0:
                _fail()
        if type(max_seconds) not in (int, float) or not 0 < max_seconds <= SCAN_SECONDS:
            _fail()
        self.path = path
        self.max_zip_bytes, self.max_entries = max_zip_bytes, max_entries
        self.max_expanded_bytes, self.max_member_bytes = max_expanded_bytes, max_member_bytes
        self.max_directory_bytes, self.max_seconds = max_directory_bytes, max_seconds
        self.check_cancel = check_cancel
        self.source = self.archive = None
        self.infos = []
        self.offsets = {}
        self.actual_total = 0

    def check(self):
        self.check_cancel()
        if time.monotonic() >= self.deadline:
            _fail()

    def __enter__(self):
        self.deadline = time.monotonic() + self.max_seconds
        self.check()
        try:
            self.source = open(self.path, 'rb')
            info = os.fstat(self.source.fileno())
            if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= self.max_zip_bytes:
                _fail()
            self.size = info.st_size
            start, count, comment_start = _directory(self.source, self.size, self.check,
                                                    self.max_directory_bytes, self.max_entries)
            self.check()
            self.archive = zipfile.ZipFile(_MetadataReader(self.source, self.size, comment_start,
                                                          self.max_directory_bytes), 'r')
            self.infos = self.archive.infolist()
            if len(self.infos) != count or self.archive.start_dir != start:
                _fail()
            declared_total = 0
            for entry in self.infos:
                self.check()
                # 普通/强加密及压缩补丁均沿用ZipFile.open的拒绝契约。
                if (entry.flag_bits & (1 | 32 | 64) or entry.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                        or not 0 <= entry.file_size <= self.max_member_bytes or entry.compress_size < 0):
                    _fail()
                declared_total += entry.file_size
                if declared_total > self.max_expanded_bytes:
                    _fail()
                if entry.header_offset < 0 or entry.header_offset + 30 > start:
                    _fail()
                self.source.seek(entry.header_offset)
                raw = self.source.read(30)
                if len(raw) != 30 or raw[:4] != b'PK\x03\x04':
                    _fail()
                flags, method = struct.unpack_from('<2H', raw, 6)
                name_size, extra_size = struct.unpack_from('<2H', raw, 26)
                if flags != entry.flag_bits or method != entry.compress_type:
                    _fail()
                name = self.source.read(name_size)
                if len(name) != name_size or name.decode('utf-8' if flags & 2048 else 'cp437') != entry.orig_filename:
                    _fail()
                data_start = entry.header_offset + 30 + name_size + extra_size
                if data_start + entry.compress_size > min(start, entry._end_offset):
                    _fail()
                self.offsets[entry] = data_start
                if entry.is_dir() and entry.file_size != 0:
                    _fail()
            # 目录也校验零长度正文和CRC；文件正文仅在实际写入时有界解码一次。
            for entry in self.infos:
                if entry.is_dir():
                    for _ in self.iter_member(entry):
                        _fail()
            self.check()
            return self
        except BaseException:
            self.close()
            raise

    def infolist(self):
        return self.infos

    def iter_member(self, entry):
        if self.source is None or entry not in self.offsets:
            _fail()
        self.check()
        self.source.seek(self.offsets[entry])
        remaining, actual, crc = entry.compress_size, 0, 0
        decoder = zlib.decompressobj(-15) if entry.compress_type == zipfile.ZIP_DEFLATED else None
        def output(data):
            nonlocal actual, crc
            self.check()
            actual += len(data)
            self.actual_total += len(data)
            if actual > entry.file_size or self.actual_total > self.max_expanded_bytes:
                _fail()
            crc = zlib.crc32(data, crc)
            return data
        try:
            while remaining:
                self.check()
                chunk = self.source.read(min(CHUNK_BYTES, remaining))
                self.check()
                if not chunk:
                    _fail()
                remaining -= len(chunk)
                if decoder is None:
                    yield output(chunk)
                    continue
                pending = chunk
                while True:
                    self.check()
                    limit = min(CHUNK_BYTES, entry.file_size - actual + 1)
                    data = decoder.decompress(pending, limit)
                    self.check()
                    output(data)
                    if decoder.unused_data or (decoder.eof and remaining):
                        _fail()
                    if data:
                        yield data
                    pending = decoder.unconsumed_tail
                    if pending:
                        continue
                    if len(data) == limit and not decoder.eof:
                        pending = b''
                        continue
                    break
            if decoder is not None and not decoder.eof:
                _fail()
            if actual != entry.file_size or crc != entry.CRC:
                raise zipfile.BadZipFile('invalid zip member size or CRC')
            self.check()
        except zlib.error:
            raise zipfile.BadZipFile('invalid zip compressed member') from None

    def close(self):
        try:
            if self.archive is not None:
                self.archive.close()
        finally:
            self.archive = None
            if self.source is not None:
                self.source.close()
            self.source = None

    def __exit__(self, *args):
        self.close()
