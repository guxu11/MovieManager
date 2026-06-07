#!/usr/bin/env python3
import argparse
import json
import os
import platform
import shutil
from pathlib import Path

HOST_NAME = "com.movie_manager.helper"


def manifest_path(browser):
    home = Path.home()
    system = platform.system()
    if system == "Darwin":
        app_support = home / "Library" / "Application Support"
        if browser == "chrome":
            return app_support / "Google" / "Chrome" / "NativeMessagingHosts" / f"{HOST_NAME}.json"
        if browser == "edge":
            return app_support / "Microsoft Edge" / "NativeMessagingHosts" / f"{HOST_NAME}.json"
    if system == "Linux":
        if browser == "chrome":
            return home / ".config" / "google-chrome" / "NativeMessagingHosts" / f"{HOST_NAME}.json"
        if browser == "edge":
            return home / ".config" / "microsoft-edge" / "NativeMessagingHosts" / f"{HOST_NAME}.json"
    raise SystemExit(f"Unsupported browser/platform combination: {browser} on {system}")


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_launcher(helper_dir, python_path):
    helper_path = helper_dir / "movie_manager_helper.py"
    launcher_path = helper_dir / "movie_manager_helper_launcher.sh"
    launcher_path.write_text(
        "#!/bin/sh\n"
        "echo \"launcher: started $(date)\" >> /tmp/movie_manager_helper.log\n"
        f"exec {json.dumps(str(python_path))} {json.dumps(str(helper_path))} 2>> /tmp/movie_manager_helper.log\n",
        encoding="utf-8",
    )
    os.chmod(helper_path, 0o755)
    os.chmod(launcher_path, 0o755)
    return launcher_path


def main():
    parser = argparse.ArgumentParser(description="Install Movie Manager native messaging host.")
    parser.add_argument("--extension-id", required=True, help="Chrome/Edge extension ID from the extensions page.")
    parser.add_argument("--browser", choices=["chrome", "edge"], default="chrome")
    parser.add_argument("--allow-root", action="append", default=[], help="Allowed movie root directory. Repeatable.")
    parser.add_argument("--player", default="", help="Optional player app/name/path. macOS example: IINA")
    args = parser.parse_args()

    helper_dir = Path(__file__).resolve().parent
    python_path = Path(shutil.which("python3") or "/usr/bin/python3").resolve()
    launcher_path = write_launcher(helper_dir, python_path)
    native_path = helper_dir / "movie_manager_helper_native"
    host_path = native_path if native_path.exists() else launcher_path
    if native_path.exists():
        os.chmod(native_path, 0o755)

    config_path = helper_dir / "config.json"
    if args.allow_root or not config_path.exists():
        write_json(config_path, {
            "allowedRoots": args.allow_root,
            "player": args.player,
        })

    manifest = {
        "name": HOST_NAME,
        "description": "Movie Manager local opener",
        "path": str(host_path),
        "type": "stdio",
        "allowed_origins": [f"chrome-extension://{args.extension_id}/"],
    }
    output_path = manifest_path(args.browser)
    write_json(output_path, manifest)
    print(f"Installed native host manifest: {output_path}")
    print(f"Config: {config_path}")
    print(f"Host: {host_path}")
    print(f"Launcher fallback: {launcher_path}")
    print(f"Python: {python_path}")


if __name__ == "__main__":
    main()
