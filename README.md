# Movie Manager

一个轻量的电影位置索引网站：在任意设备上打开网站，选择本机目录同步文件名；搜索番号时显示文件在哪台设备、哪个目录下。

## 功能

- 搜索番号，例如 `ABC-123`、`abc123`、`ABC 123`
- 在浏览器里选择目录并同步视频文件索引
- 显示设备名、目录名、路径备注、相对路径、文件大小、上次同步时间
- 不上传电影文件，只上传文件名、相对路径、大小、修改时间和提取出的番号
- 支持 Vercel API + Supabase 云端存储；本地静态预览时使用浏览器本地 demo 存储

## 本地运行

这是一个纯静态网站，不需要安装依赖。

```bash
python3 -m http.server 4173
```

然后打开：

```text
http://localhost:4173
```

## Supabase 配置

1. 在 Supabase 创建项目。
2. 打开 SQL Editor，执行 [supabase/schema.sql](./supabase/schema.sql)。

这份 schema 会打开 RLS，并撤销 `anon` 对索引表的直接读写权限。浏览器不会直连 Supabase，数据库读写只走 Vercel API。

## 部署到 Vercel API

当前扩展是主界面，Vercel 只作为 API 后端使用。

需要在 Vercel Project Settings 里配置环境变量：

```text
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=你的 service_role key
SYNC_TOKEN=自定义一个长随机口令
```

部署后，把扩展的 [extension/config.js](./extension/config.js) 指向 Vercel API 地址和 `SYNC_TOKEN`。

健康检查：

```text
GET /api/health
```

不要把 `SUPABASE_SERVICE_ROLE_KEY` 放进前端代码、浏览器 localStorage、README 截图或公开仓库。

## 同步策略

每次同步一个 `设备 + 目录` 时，会把这个 source 当成完整快照：

- 删除该设备/目录的旧文件索引
- 插入本次扫描到的视频文件
- 更新目录的 `last_sync_at`
- 同一设备里同名文件只保留最新同步的位置；如果文件从 A 目录移到 B 目录，下一次同步 B 后会覆盖旧位置

没有同步的目录不会被改动。搜索结果表达的是“上次同步时，这个文件在哪里”。

如果你已经执行过旧版 Supabase schema，需要重新执行 [supabase/schema.sql](./supabase/schema.sql)，让 `files_device_filename_unique` 唯一索引生效。

## 安全边界

- 前端不保存 Supabase URL/key。
- 搜索和目录列表通过 `/api/search`、`/api/sources` 读取。
- 同步写入通过 `/api/sync`，必须携带 `x-sync-token`。
- API 不执行拼接 SQL，只调用 Supabase REST，并对输入长度、文件数量、视频后缀做校验。
- 这不是完整用户认证；知道部署地址的人仍可能读取搜索结果。当前兜底重点是防止未授权修改数据库。

## 浏览器扩展

[extension](./extension) 里有 Chrome / Edge Manifest V3 扩展版应用。你可以手动 Load unpacked 安装，不需要发布到 Chrome Web Store。

安装后点击浏览器工具栏里的 Movie Manager 图标，直接在扩展 UI 里搜索、同步目录、配置云端 API。本地 demo 模式不需要云端配置。

浏览器扩展本身不能直接执行 `open`、`start`、IINA、VLC 或 PotPlayer；真正打开本地文件需要安装 [native-helper](./native-helper) 里的 Native Messaging host。

建议后续 native helper 只做一件事：校验路径在用户允许的目录内，然后调用本机默认播放器打开文件。
