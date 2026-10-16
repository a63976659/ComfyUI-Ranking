"""Skill来源、接收目录和只读安装清单。"""
import os
from pathlib import Path
import re
import stat
from urllib.parse import urlsplit


class SkillPackageError(ValueError):
    pass


def parse_source(value, valid_repository):
    if not isinstance(value, str) or not value or value.strip() != value or any(ord(c) < 32 for c in value) or "\\" in value:
        raise SkillPackageError("invalid_repository")
    try:
        url = urlsplit(value)
        if url.query or url.fragment or url.username is not None or url.password is not None or url.netloc.endswith(":") or "//" in url.path:
            raise ValueError()
        pieces = url.path.strip("/").split("/")
        repository = url._replace(path="/" + "/".join(pieces[:2]), query="", fragment="").geturl()
        if not valid_repository(repository):
            raise ValueError()
        name = pieces[1].removesuffix(".git")
        if not name or name in (".", "..") or pieces[0] in (".", ".."):
            raise ValueError()
        if len(pieces) != 2:
            raise ValueError()
        return {"repository": repository, "name": name}
    except (ValueError, IndexError, UnicodeError):
        raise SkillPackageError("invalid_repository") from None


def directory_identity(value):
    info = Path(value).lstat()
    if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400):
        raise SkillPackageError("invalid_target")
    return [info.st_dev, info.st_ino]


def selected_target(value):
    if not isinstance(value, str) or not value or not Path(value).is_absolute() or any(ord(c) < 32 for c in value):
        raise SkillPackageError("invalid_target")
    try:
        target = Path(value).resolve(strict=True)
        if target == target.parent:
            raise SkillPackageError("invalid_target")
        identity = directory_identity(target)
        return {"path": str(target), "identity": identity}
    except OSError:
        raise SkillPackageError("invalid_target") from None


def check_selected_target(selection):
    try:
        path = Path(selection["path"])
        if path.resolve(strict=True) != path or directory_identity(path) != selection["identity"]:
            raise SkillPackageError("target_changed")
        return path
    except (OSError, KeyError, TypeError):
        raise SkillPackageError("target_changed") from None


def browse_target(value, *, max_entries=128, max_scanned=4096, max_output_bytes=65536, check_cancel=None):
    if not isinstance(value, str) or not value or not Path(value).is_absolute() or any(ord(c) < 32 for c in value):
        raise SkillPackageError("invalid_target")
    try:
        directory = Path(value).resolve(strict=True)
        identity = directory_identity(directory)
        folders = []; count = 0
        with os.scandir(directory) as entries:
            for entry in entries:
                if check_cancel:
                    check_cancel()
                count += 1
                if count > max_scanned:
                    raise SkillPackageError("directory_too_large")
                if not entry.is_dir(follow_symlinks=False) or any(ord(c) < 32 for c in entry.name):
                    continue
                try:
                    directory_identity(entry.path)
                except (OSError, SkillPackageError):
                    continue
                folders.append({"name": entry.name, "path": str(directory / entry.name)})
        folders.sort(key=lambda row: (row["name"].casefold(), row["name"]))
        truncated = len(folders) > max_entries
        visible = []; size = len(str(directory).encode("utf-8")) * 2 + 512
        for row in folders[:max_entries]:
            size += (len(row["name"].encode("utf-8")) + len(row["path"].encode("utf-8"))) * 6 + 128
            if size > max_output_bytes:
                truncated = True
                break
            visible.append(row)
        if directory_identity(directory) != identity:
            raise SkillPackageError("target_changed")
        return {"path": str(directory), "parent": str(directory.parent), "selectable": directory != directory.parent,
                "directories": visible, "truncated": truncated}
    except InterruptedError:
        raise
    except OSError:
        raise SkillPackageError("invalid_target") from None
