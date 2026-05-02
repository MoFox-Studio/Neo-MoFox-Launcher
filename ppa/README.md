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
