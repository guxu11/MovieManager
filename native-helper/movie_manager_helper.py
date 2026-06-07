#!/usr/bin/env python3
import json
import os
import platform
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

VIDEO_SUFFIXES = {".mp4", ".ts", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".m4v"}
CONFIG_PATH = Path(__file__).with_name("config.json")
LOG_PATH = Path(tempfile.gettempdir()) / "movie_manager_helper.log"


def log(message):
    try:
        with LOG_PATH.open("a", encoding="utf-8") as file:
            file.write(message + "\n")
    except OSError:
        pass


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        log("read_message: no length bytes")
        return None
    message_length = struct.unpack("<I", raw_length)[0]
    log(f"read_message: length={message_length}")
    payload = sys.stdin.buffer.read(message_length)
    log(f"read_message: payload_bytes={len(payload)}")
    return json.loads(payload.decode("utf-8"))


def write_message(message):
    log(f"write_message: {message}")
    encoded = json.dumps(message, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def load_config():
    if not CONFIG_PATH.exists():
        return {"allowedRoots": [], "player": ""}
    with CONFIG_PATH.open("r", encoding="utf-8") as file:
        data = json.load(file)
    data.setdefault("allowedRoots", [])
    data.setdefault("player", "")
    return data


def resolve_path(raw_path):
    if not raw_path:
        raise ValueError("Missing absolute path. Fill path note with the real folder path before syncing.")
    path = Path(os.path.expanduser(raw_path)).resolve()
    filename = path.name.rstrip(" ?？").lower()
    if not any(filename.endswith(suffix) for suffix in VIDEO_SUFFIXES):
        raise ValueError("Only video files can be opened.")
    if not path.exists() or not path.is_file():
        raise ValueError(f"File does not exist: {path}")
    return path


def is_inside_allowed_root(path, allowed_roots):
    resolved_roots = [Path(os.path.expanduser(root)).resolve() for root in allowed_roots if root]
    if not resolved_roots:
        raise ValueError("No allowed roots configured for native helper.")
    for root in resolved_roots:
        try:
            path.relative_to(root)
            return True
        except ValueError:
            continue
    return False


def is_video_filename(filename):
    clean_name = filename.rstrip(" ?？").lower()
    return any(clean_name.endswith(suffix) for suffix in VIDEO_SUFFIXES)


def scan_directory(raw_path, allowed_roots):
    if not raw_path:
        raise ValueError("Missing directory path.")
    root = Path(os.path.expanduser(raw_path)).resolve()
    if not root.exists() or not root.is_dir():
        raise ValueError(f"Directory does not exist: {root}")
    if not is_inside_allowed_root(root, allowed_roots):
        raise ValueError(f"Path is outside allowed roots: {root}")

    files = []
    seen = 0
    skipped_count = 0
    read_error_count = 0
    for path in root.rglob("*"):
        try:
            if not path.is_file() or path.name.startswith("."):
                continue
            seen += 1
            if not is_video_filename(path.name):
                skipped_count += 1
                continue
            stat = path.stat()
            files.append({
                "filename": path.name,
                "relative_path": path.relative_to(root).as_posix(),
                "size_bytes": stat.st_size,
                "mtime": None,
            })
        except OSError:
            read_error_count += 1

    return {
        "ok": True,
        "files": files,
        "count": len(files),
        "seen": seen,
        "skippedCount": skipped_count,
        "readErrorCount": read_error_count,
    }


def open_file(path, player):
    system = platform.system()
    if system == "Darwin":
        if player:
            subprocess.Popen(["open", "-a", player, str(path)])
            return

        subprocess.Popen([
            "sh",
            "-c",
            'open -a IINA "$1" 2>/dev/null || '
            'open -a VLC "$1" 2>/dev/null || '
            '(command -v ffplay >/dev/null 2>&1 && ffplay -autoexit "$1") || '
            'open "$1"',
            "movie-manager-open",
            str(path),
        ])
        return

    if system == "Windows":
        if player:
            subprocess.Popen([player, str(path)], shell=False)
        else:
            os.startfile(str(path))  # pylint: disable=no-member
        return

    if player:
        subprocess.Popen([player, str(path)])
    else:
        subprocess.Popen(["xdg-open", str(path)])


def handle(message):
    log(f"handle: {message}")
    if message.get("type") == "PING_HELPER":
        config = load_config()
        return {
            "ok": True,
            "message": f"Native helper 正常。允许目录：{len(config['allowedRoots'])} 个",
        }

    if message.get("type") == "SCAN_DIRECTORY":
        config = load_config()
        return scan_directory(message.get("path"), config["allowedRoots"])

    if message.get("type") != "OPEN_LOCAL_FILE":
        return {"ok": False, "error": "Unknown message type"}

    config = load_config()
    file_info = message.get("file") or {}
    path = resolve_path(file_info.get("displayPath"))
    if not is_inside_allowed_root(path, config["allowedRoots"]):
        return {"ok": False, "error": f"Path is outside allowed roots: {path}"}

    open_file(path, config.get("player", ""))
    return {"ok": True, "message": f"已用本机播放器打开：{path.name}"}


def main():
    try:
        log("main: started")
        message = read_message()
        if message is None:
            log("main: no message, exiting")
            return
        write_message(handle(message))
    except Exception as error:  # noqa: BLE001
        log(f"main: exception={error}")
        write_message({"ok": False, "error": str(error)})


if __name__ == "__main__":
    main()
