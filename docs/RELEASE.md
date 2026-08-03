# LTools 发布与自动更新

应用内「检查更新」通过 GitHub Releases 端点获取新版本并自动下载安装。
发布流程全部由 GitHub Actions 完成。

## 0. 本地预检（可选但推荐，发布前验证打包签名链路）

```powershell
# 0.1 若 WiX / NSIS 工具链下载卡住（GitHub 网络问题），先走本地代理
$env:HTTP_PROXY = "http://127.0.0.1:7892"
$env:HTTPS_PROXY = "http://127.0.0.1:7892"

# 0.2 提供签名私钥（本地打包时 tauri 只找到公钥会报
#     "A public key has been found, but no private key"）
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content .tauri\ltools.key -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "ltools-sign-2026"

# 0.3 完整打包 + 签名
pnpm tauri build
```

验证 `src-tauri/target/release/bundle/` 下同时产出：

- `msi/LTools_*.msi` + `.msi.sig`
- `nsis/LTools_*-setup.exe` + `.exe.sig`

> ⚠️ `latest.json` 由 GitHub Actions 的 `tauri-action` 在发布时生成上传，**本地不会生成**，属正常现象。
> 2026-08-03 实测：本地代理 7892 + 私钥环境变量下，MSI/NSIS 与两个 `.sig` 签名产物全部生成成功。

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
