# Movie Manager Extension

Chrome / Edge Manifest V3 扩展版 Movie Manager。手动安装后，点浏览器工具栏里的扩展按钮即可直接在扩展 UI 里操作。

## 功能

- 搜索电影番号。
- 选择本机目录并同步索引。
- 已保存目录授权的当前设备源，可以在“目录”页一键同步。
- 同一设备里同名文件只保留最新同步的位置。
- 默认直连 Vercel API，把索引同步到 Supabase。
- 配合 [../native-helper](../native-helper) 通过本机播放器打开本地文件。

## 安装开发版扩展

1. 打开 Chrome / Edge 的扩展管理页。
2. 开启 Developer mode。
3. 选择 Load unpacked。
4. 选择这个目录：`extension/`。
5. 点击工具栏里的 Movie Manager 图标，直接搜索或同步目录。

## 云端配置

扩展默认使用当前项目的云端 API，不需要手动填写 token。安装到其它设备后，直接搜索即可看到已同步的云端索引。

如果以后换了 Vercel 地址，可以在扩展 UI 右上角打开设置，手动覆盖 API Base URL。也可以把云端配置写进 [config.js](./config.js)，然后把整个 `extension/` 目录复制到其它设备：

```js
window.MOVIE_MANAGER_CONFIG = {
  apiBaseUrl: "https://movie-manager.vercel.app",
};
```

## 本机打开

扩展本身不能直接执行系统命令。要使用“本机打开”，需要安装 [../native-helper](../native-helper)。

另外，同步目录时需要在高级选项的“路径备注”里填写真实根路径，例如 `/Users/xugu/Movies/collections`。浏览器无法自动读取绝对路径。
