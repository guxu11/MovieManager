# Movie Manager Extension

Chrome / Edge Manifest V3 扩展版 Movie Manager。手动安装后，点浏览器工具栏里的扩展按钮即可直接在扩展 UI 里操作。

## 功能

- 搜索电影番号。
- 选择本机目录并同步索引。
- 已保存目录授权的当前设备源，可以在“目录”页一键同步。
- 同一设备里同名文件只保留最新同步的位置。
- 可内置 Vercel API + Sync token，把索引同步到 Supabase。
- 本地 demo 模式可不配置云端，仅在当前浏览器扩展里试用。
- 配合 [../native-helper](../native-helper) 通过本机播放器打开本地文件。

## 安装开发版扩展

1. 打开 Chrome / Edge 的扩展管理页。
2. 开启 Developer mode。
3. 选择 Load unpacked。
4. 选择这个目录：`extension/`。
5. 点击工具栏里的 Movie Manager 图标，直接搜索或同步目录。

## 云端配置

推荐把云端配置写进 [config.js](./config.js)，然后把整个 `extension/` 目录复制到其它设备：

```js
window.MOVIE_MANAGER_CONFIG = {
  apiBaseUrl: "https://movie-manager.vercel.app",
  syncToken: "your-sync-token",
};
```

这样每台设备安装扩展后都会自动使用同一套云端 API。

也可以在扩展 UI 右上角打开设置，手动覆盖：

- API Base URL：你的 Vercel 部署地址，例如 `https://movie-manager.vercel.app`
- Sync token：Vercel 环境变量 `SYNC_TOKEN`

## 本机打开

扩展本身不能直接执行系统命令。要使用“本机打开”，需要安装 [../native-helper](../native-helper)。

另外，同步目录时需要在高级选项的“路径备注”里填写真实根路径，例如 `/Users/xugu/Movies/collections`。浏览器无法自动读取绝对路径。
