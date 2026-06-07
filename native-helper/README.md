# Movie Manager Native Helper

Native Messaging helper for opening local movie files from the Movie Manager extension.

## Why This Exists

Chrome extensions cannot directly execute `open`, `start`, IINA, VLC, or PotPlayer. They must talk to a locally installed Native Messaging host. This helper is that host.

## Install

1. Load the extension from `extension/`.
2. Open `chrome://extensions` or `edge://extensions`.
3. Copy the Movie Manager extension ID.
4. Run the installer from the project root.
5. Restart the browser after installing or changing native host settings.

### Windows

Chrome example:

```powershell
python native-helper\install_native_host.py `
  --browser chrome `
  --extension-id YOUR_EXTENSION_ID `
  --allow-root "D:\movies" `
  --allow-root "E:\downloads"
```

Edge example:

```powershell
python native-helper\install_native_host.py `
  --browser edge `
  --extension-id YOUR_EXTENSION_ID `
  --allow-root "D:\movies"
```

On Windows, the installer writes:

- a host manifest beside this README, such as `com.movie_manager.helper.chrome.json`
- a launcher at `movie_manager_helper_launcher.cmd`
- an HKCU registry key under `Software\Google\Chrome\NativeMessagingHosts\com.movie_manager.helper` or `Software\Microsoft\Edge\NativeMessagingHosts\com.movie_manager.helper`
- `config.json` with `allowedRoots` and `player`

When `player` is empty, Windows opens files with the system default app. To force a player, pass the executable path:

```powershell
python native-helper\install_native_host.py `
  --browser chrome `
  --extension-id YOUR_EXTENSION_ID `
  --player "C:\Program Files\VideoLAN\VLC\vlc.exe" `
  --allow-root "D:\movies"
```

### macOS / Linux

Chrome example:

```bash
python3 native-helper/install_native_host.py \
  --browser chrome \
  --extension-id YOUR_EXTENSION_ID \
  --allow-root "/Users/xugu/Movies/collections" \
  --allow-root "/Users/xugu/Downloads" \
  --allow-root "/Volumes/Backup Plus/guxu/movies/LQ"
```

Edge example:

```bash
python3 native-helper/install_native_host.py \
  --browser edge \
  --extension-id YOUR_EXTENSION_ID \
  --allow-root "/Users/xugu/Movies/collections"
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

## Important

For "本机打开" to work, the synced record needs an absolute display path. Since browsers cannot read absolute paths automatically, fill the sync page's advanced "路径备注" with the real root path before syncing.

Examples:

```text
/Users/xugu/Movies/collections
D:\movies
```

The helper will only open video files inside `allowedRoots`.

## Troubleshooting

Use the extension settings button "检测本机 Helper" after installing. If it still fails:

- restart Chrome/Edge
- confirm the extension ID in the install command matches the loaded extension
- rerun the installer when `allowedRoots` changes
- check the log at `%TEMP%\movie_manager_helper.log` on Windows or `/tmp/movie_manager_helper.log` on macOS/Linux
