# LTools 发布与自动更新

应用内「检查更新」通过 GitHub Releases 端点获取新版本并自动下载安装。
发布流程全部由 GitHub Actions 完成。

## 1. 签名密钥

密钥对已在开发机生成，位于（**不要提交到仓库**，已加入 `.gitignore`）：

- 私钥：`.tauri/ltools.key`
- 公钥：`.tauri/ltools.key.pub`（已嵌入 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`）
- 私钥密码：`ltools-sign-2026`（可自行更换，更换后需同步更新下方 Secrets 与 pubkey）

> ⚠️ 私钥或密码丢失将无法签名新版本，已发布的旧版本也无法再收到更新。请妥善备份私钥。

## 2. 配置 GitHub Secrets

在仓库 `Settings → Secrets and variables → Actions` 添加两个 Secret：

| Secret 名 | 值 |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | `.tauri/ltools.key` 的**文件内容** |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | `ltools-sign-2026` |

## 3. 发版流程

```powershell
git tag v0.1.1
git push origin v0.1.1
```

Actions 自动执行：

1. 安装依赖、`pnpm build`、`cargo build`（Windows 打包 NSIS / MSI）。
2. 用 Secret 中的私钥签名安装包（生成 `.sig`）。
3. 发布 GitHub Release（草稿），并生成 updater 元数据 `latest.json`。

应用内更新端点：

```
https://github.com/LJL0906/LTools/releases/latest/download/latest.json
```

## 4. 验证

- 发布后：在应用「设置 → 关于 → 检查更新」，应显示「已是最新版本」。
- 发新 tag 后：同一入口应提示发现新版本并下载安装。
- 更新安装后应用自动重启（Windows 由安装器接管）。

## 5. 常见问题

- **构建产物无 `.sig` / `latest.json`**：确认 `tauri.conf.json` 的
  `bundle.createUpdaterArtifacts: true` 与 `plugins.updater` 配置存在，
  且 Secrets 已正确配置。
- **检查更新报签名错误**：pubkey 与 Secrets 中的私钥不匹配，或修改了私钥
  未同步更新 pubkey。
- **更新端点 404**：尚未发布过任何 Release；`latest.json` 随首个 Release 生成。
