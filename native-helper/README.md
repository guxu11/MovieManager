# Movie Manager Native Helper

Native Messaging helper for opening local movie files from the Movie Manager extension.

## Why This Exists

Chrome extensions cannot directly execute `open`, `start`, IINA, VLC, or PotPlayer. They must talk to a locally installed Native Messaging host. This helper is that host.

## Install On macOS / Linux

1. Load the extension from `extension/`.
2. Open `chrome://extensions` or `edge://extensions`.
3. Copy the Movie Manager extension ID.
4. Run the installer from the project root.

Chrome example:

```bash
python3 native-helper/install_native_host.py \
  --browser chrome \
  --extension-id YOUR_EXTENSION_ID \
  --allow-root "/Users/xugu/Movies/collections" \
  --allow-root "/Users/xugu/Downloads" \
  --allow-root "/Volumes/Backup Plus/guxu/movies/LQ"
```

On macOS, when `player` is empty, the helper opens with this priority:

```text
IINA -> VLC -> ffplay -> system default
```

Force a specific player on macOS:

```bash
python3 native-helper/install_native_host.py \
  --browser chrome \
  --extension-id YOUR_EXTENSION_ID \
  --player IINA \
  --allow-root "/Users/xugu/Movies/collections"
```

Edge example:

```bash
python3 native-helper/install_native_host.py \
  --browser edge \
  --extension-id YOUR_EXTENSION_ID \
  --allow-root "/Users/xugu/Movies/collections"
```

## Important

For “本机打开” to work, the synced record needs an absolute display path. Since browsers cannot read absolute paths automatically, fill the sync page's advanced “路径备注” with the real root path before syncing, for example:

```text
/Users/xugu/Movies/collections
```

The helper will only open files inside `allowedRoots`.

## Windows

The helper script supports Windows opening logic, but the installer does not yet write the Windows registry key for Native Messaging. That can be added when you are ready to install on Windows.
