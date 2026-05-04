# PPA 上传指南

本目录包含将 **Neo-MoFox Launcher** 上架 Launchpad PPA 所需的全部 Debian 打包文件。

## 目录结构

```
ppa/
├── debian/
│   ├── control                  # 包元数据与依赖声明
│   ├── rules                    # 构建规则（Makefile 格式）
│   ├── changelog                # 版本历史（必须严格遵守格式）
│   ├── copyright                # 版权声明（DEP-5 格式）
│   ├── neo-mofox-launcher.sh    # 安装到 /usr/bin 的启动器包装脚本
│   └── source/
│       └── format               # 源码包格式（3.0 quilt）
└── prepare-source.sh            # 一键生成源码包并准备上传的脚本
```

## 为何需要 `prepare-source.sh`

Launchpad 的构建环境**没有网络访问权限**，因此：

- `node_modules` 需要在本地预先安装后一同打包进 `orig.tar.gz`
- Electron 二进制（`~120 MB`）需要预先下载并打包进源码包

`prepare-source.sh` 自动完成这一切。

## 快速开始

### 1. 准备环境（Ubuntu / Debian 系统）

```bash
sudo apt install devscripts debhelper nodejs npm unzip curl dput gpg
```

### 2. 在 Launchpad 创建 PPA

前往 <https://launchpad.net/~YOUR_ID/+activate-ppa>，创建名为 `neo-mofox-launcher` 的 PPA。

### 3. 配置 GPG 签名密钥

Launchpad 要求所有上传的包必须用 GPG 签名，且签名邮箱与 Launchpad 账户关联：

```bash
# 生成新密钥（如已有可跳过）
gpg --full-gen-key

# 上传公钥到 keyserver
gpg --keyserver keyserver.ubuntu.com --send-keys <YOUR_KEY_ID>
```

随后在 Launchpad 账户页面导入该 GPG 密钥。

### 4. 运行打包脚本

在项目根目录执行（可指定 Electron 版本）：

```bash
bash ppa/prepare-source.sh 39.0.0
```

脚本会生成以下文件：

- `neo-mofox-launcher_1.0.0.orig.tar.gz`
- `neo-mofox-launcher_1.0.0-1.dsc`
- `neo-mofox-launcher_1.0.0-1_source.changes`
- `neo-mofox-launcher_1.0.0-1.debian.tar.xz`

### 5. GPG 签名源码包

```bash
debsign neo-mofox-launcher_1.0.0-1_source.changes
```

### 6. 上传到 PPA

```bash
dput ppa:YOUR_LAUNCHPAD_ID/neo-mofox-launcher \
     neo-mofox-launcher_1.0.0-1_source.changes
```

上传后，Launchpad 会发送确认邮件，构建通常在 10–30 分钟内完成。

## 更新版本

1. 编辑 `ppa/debian/changelog`，在顶部添加新的版本条目：

   ```
   neo-mofox-launcher (1.0.1-1) noble; urgency=medium
   
     * 更新内容描述。
   
    -- Yishan <wwwww95915@qq.com>  Mon, 01 Jun 2026 12:00:00 +0800
   ```

2. 同步修改 `prepare-source.sh` 中的 `PKG_VERSION`。

3. 重新运行 `prepare-source.sh` 并上传。

## 支持多个 Ubuntu 发行版

对每个目标发行版单独运行脚本并指定 `DIST_TARGET`：

```bash
# 修改脚本中的 DIST_TARGET 变量，或：
sed -i 's/DIST_TARGET="noble"/DIST_TARGET="jammy"/' ppa/prepare-source.sh
bash ppa/prepare-source.sh 39.0.0
```

> **注意**：每个发行版的 `changelog` 版本号中的 `~distro` 后缀应有所区分，例如 `1.0.0-1~noble1`、`1.0.0-1~jammy1`，以避免版本冲突。

## 包安装后的文件布局

| 路径 | 内容 |
|------|------|
| `/usr/bin/neo-mofox-launcher` | 启动器包装脚本 |
| `/usr/lib/neo-mofox-launcher/electron` | Electron 可执行文件 |
| `/usr/lib/neo-mofox-launcher/resources/app.asar` | 应用主包 |
| `/usr/share/applications/neo-mofox-launcher.desktop` | 桌面快捷方式 |
| `/usr/share/pixmaps/neo-mofox-launcher.png` | 应用图标 |
| `/usr/share/doc/neo-mofox-launcher/copyright` | 许可证文件 |

---

## 为什么 CI 无法自动上传 / 本地梯子无效

Launchpad PPA **只接受 FTP (端口 21) 或 SSH/SCP (端口 22) 上传**，两种协议均存在以下问题：

- **GitHub Actions (Azure)**：Azure 云出方向封锁了端口 21 和 22，CI 无法连接 `ppa.launchpad.net`
- **国内梯子无效**：Clash / v2ray 等工具默认是 HTTP/SOCKS5 **应用层代理**，FTP 和 SSH 流量不经过代理通道；需要开启 **TUN 模式（透明代理）** 或使用 `proxychains4`

### 本地手动上传（开启 TUN 模式后）

```bash
# 梯子开启 TUN 模式（Clash: 虚拟网卡模式 / TUN）后执行
# 从 GitHub Actions Artifacts 下载 .changes 文件后：
dput ppa:ikun114/neo-mofox-launcher neo-mofox-launcher_VERSION-1_source.changes
```

---

## Launchpad Build Recipe（推荐的 CI 自动化方案）

此方案让 **Launchpad 主动拉取** GitHub 仓库代码来构建，完全不需要从 CI 端上传任何文件，彻底绕开端口封锁问题。

### 工作原理

```
GitHub main 分支有新提交
       ↓
Launchpad 检测到更新（自动轮询）
       ↓
Launchpad 按 Recipe 生成源码包
       ↓
Launchpad 构建 .deb 并发布到 PPA
```

### 配置步骤

**第一步：在 Launchpad 导入 GitHub 仓库**

1. 登录 <https://launchpad.net/~ikun114>
2. 进入 <https://code.launchpad.net/+new-git-repository>（或通过 Code → Import 创建）
3. 选择 "Import a Git repository"，填入：
   - URL: `https://github.com/MoFox-Studio/Neo-MoFox-Launcher`
   - Target: `~ikun114/neo-mofox-launcher`

**第二步：创建 Build Recipe**

进入 <https://code.launchpad.net/~ikun114/neo-mofox-launcher/+git/main/+new-recipe>，填写：

- **Recipe name**: `neo-mofox-launcher-nightly`
- **PPA**: `~ikun114/neo-mofox-launcher`
- **Distribution**: `Ubuntu Noble (24.04)`
- **Build daily**: 勾选（每天自动检测并构建）
- **Recipe text**:

```
# git-build-recipe format 0.4 deb-version {debupstream}+git{date}
lp:~ikun114/neo-mofox-launcher
```

**第三步：确认 GPG 密钥已上传至 Launchpad**

Recipe 构建不需要你的 GPG 密钥——Launchpad 使用自己的 build key 签名。

### 注意事项

- Recipe 方案中 `ppa/debian/` 目录需保持在仓库中（Launchpad 会读取它）
- `debian/rules` 中的 `dh_auto_build` 需能在 Launchpad 构建环境内运行（有网络，但无法访问 GitHub Release 下载 Electron）
- 如果 Electron 下载依赖网络，需预先将 Electron 打包进 orig.tar.gz 或改为依赖系统 `electron` 包
