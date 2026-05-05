# Copr 自动构建指南

本目录包含将 **Neo-MoFox Launcher** 上架 Fedora Copr（DNF 第三方仓库托管平台）所需的全部文件。

## 一、目录结构

```
copr/
├── neo-mofox-launcher.spec   # RPM 描述文件（重新封装上游二进制 RPM）
├── build-srpm.sh             # 从 GitHub Release 拉取上游 RPM 并生成 SRPM
└── README.md                 # 本文件
```

## 二、整体方案

Electron 应用本身在 Copr 默认沙箱里很难直接编译（构建期没有网络、没有 Electron 缓存），所以采用 **二进制中转** 方案：

```
GitHub Actions
    │
    │  electron-builder 产出二进制 .rpm（含 Electron 运行时）
    ▼
GitHub Release（Tag: nightly-YYYYMMDD）
    │
    │  build-srpm.sh 下载 .rpm，rpm2cpio 解开后用 spec 重新打成 SRPM
    ▼
copr-cli build  →  Fedora Copr → DNF 第三方仓库
```

## 三、Copr 项目准备

### 1. 创建账号与项目

1. 用 FAS / 第三方账号登录 <https://copr.fedorainfracloud.org/>
2. 顶部 **New Project**：
   - **Project name**：`neo-mofox-launcher`
   - **Description**：跨平台 QQ Bot 启动器与管理工具（Neo-MoFox Launcher）
   - **Chroots**（构建目标）：`fedora-rawhide-x86_64`、`fedora-41-x86_64`、`fedora-40-x86_64` 等按需勾选；ARM 选 `fedora-XX-aarch64`
3. **Settings → Permissions**：可邀请协作者
4. **Settings → API**：拉到 **API token** 区域，下载 / 复制 `~/.config/copr` 文件内容

```ini
[copr-cli]
login = ...
username = ...
token = ...
copr_url = https://copr.fedorainfracloud.org
```

### 2. 配置 GitHub Secrets

在仓库 → Settings → Secrets and variables → Actions 添加：

| Secret 名 | 内容 |
|----------|------|
| `COPR_LOGIN` | `[copr-cli]` 段中的 `login` |
| `COPR_USERNAME` | `[copr-cli]` 段中的 `username` |
| `COPR_TOKEN` | `[copr-cli]` 段中的 `token` |
| `COPR_PROJECT` | 形如 `your_username/neo-mofox-launcher` |

## 四、本地手动测试

```bash
# 在 Fedora / Rocky / RHEL 系统上
sudo dnf install -y rpm-build rpmdevtools curl copr-cli

# 1) 生成 SRPM（以 20260506 这一天的 nightly 为例）
chmod +x copr/build-srpm.sh
ARCH=x86_64 ./copr/build-srpm.sh 20260506 ./copr-srpm

# 2) 上传到 Copr
copr-cli build your_username/neo-mofox-launcher ./copr-srpm/*.src.rpm
```

## 五、用户安装方式

```bash
# 启用仓库
sudo dnf copr enable your_username/neo-mofox-launcher

# 安装
sudo dnf install neo-mofox-launcher

# 启动 GUI
neo-mofox-launcher

# 启动 CLI（无桌面环境也能用）
neo-mofox-cli
```

## 六、与 GitHub Actions 联动

[`.github/workflows/nightly.yml`](../.github/workflows/nightly.yml) 中的 `publish-copr` job 会在 `release` 任务成功后自动：

1. 安装 `rpm-build` / `copr-cli` 等工具
2. 从 GitHub Release 拉取 nightly RPM
3. 生成 SRPM
4. 用 `COPR_*` secret 配置 `~/.config/copr`
5. 运行 `copr-cli build --nowait` 异步触发 Copr 构建

构建状态可在 Copr 项目页 **Builds** 标签页查看。

## 七、常见问题

- **构建时间很长**：Copr 是免费公共服务，排队需要几分钟到一小时不等。
- **依赖缺失**：spec 中 `Requires` 与 [`Neo-MoFox-Launcher/electron-builder.yml`](../Neo-MoFox-Launcher/electron-builder.yml) 中的 `rpm.depends` 一致，若上游变更需同步修改。
- **架构问题**：当前只支持 `x86_64` / `aarch64`。
- **发行版兼容**：基于 Electron 39，最低需要 Fedora 38+ / RHEL 9+。
