#!/usr/bin/env python3
import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

HOST_NAME = "com.movie_manager.helper"


def manifest_path(browser):
    home = Path.home()
    system = platform.system()
    if system == "Windows":
        return Path(__file__).resolve().parent / f"{HOST_NAME}.{browser}.json"
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


def registry_path(browser):
    if browser == "chrome":
        return rf"Software\Google\Chrome\NativeMessagingHosts\{HOST_NAME}"
    if browser == "edge":
        return rf"Software\Microsoft\Edge\NativeMessagingHosts\{HOST_NAME}"
    raise SystemExit(f"Unsupported browser: {browser}")


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_launcher(helper_dir, python_path):
    helper_path = helper_dir / "movie_manager_helper.py"
    if platform.system() == "Windows":
        launcher_path = helper_dir / "movie_manager_helper_launcher.cmd"
        launcher_path.write_text(
            "@echo off\r\n"
            f"\"{python_path}\" \"{helper_path}\"\r\n",
            encoding="utf-8",
        )
        return launcher_path

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


def find_python():
    if sys.executable:
        return Path(sys.executable).resolve()

    candidates = ["python3", "python"]
    for name in candidates:
        found = shutil.which(name)
        if found:
            try:
                return Path(found).resolve()
            except OSError:
                continue
    if platform.system() == "Windows":
        try:
            output = subprocess.check_output(["py", "-3", "-c", "import sys; print(sys.executable)"], text=True)
            return Path(output.strip()).resolve()
        except (OSError, subprocess.CalledProcessError):
            pass
    fallback = "python.exe" if platform.system() == "Windows" else "/usr/bin/python3"
    return Path(fallback)


def install_windows_registry(browser, output_path):
    import winreg  # pylint: disable=import-outside-toplevel

    key_path = registry_path(browser)
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, str(output_path))
    return key_path


def main():
    parser = argparse.ArgumentParser(description="Install Movie Manager native messaging host.")
    parser.add_argument("--extension-id", required=True, help="Chrome/Edge extension ID from the extensions page.")
    parser.add_argument("--browser", choices=["chrome", "edge"], default="chrome")
    parser.add_argument("--allow-root", action="append", default=[], help="Allowed movie root directory. Repeatable.")
    parser.add_argument("--player", default="", help="Optional player app/name/path. macOS example: IINA")
    args = parser.parse_args()

    helper_dir = Path(__file__).resolve().parent
    python_path = find_python()
    launcher_path = write_launcher(helper_dir, python_path)
    native_path = helper_dir / "movie_manager_helper_native"
    host_path = native_path if native_path.exists() and platform.system() != "Windows" else launcher_path
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
    registry_key = None
    if platform.system() == "Windows":
        registry_key = install_windows_registry(args.browser, output_path)

    print(f"Installed native host manifest: {output_path}")
    if registry_key:
        print(f"Installed registry key: HKCU\\{registry_key}")
    print(f"Config: {config_path}")
    print(f"Host: {host_path}")
    print(f"Launcher fallback: {launcher_path}")
    print(f"Python: {python_path}")


if __name__ == "__main__":
    main()
