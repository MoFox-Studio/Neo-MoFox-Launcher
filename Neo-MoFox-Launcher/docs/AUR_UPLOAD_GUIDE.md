# Neo-MoFox Launcher AUR 上传指南

本文档说明如何将 Neo-MoFox Launcher 上传到 AUR（Arch User Repository）。

**注意：** 本项目使用 Git 包（`neo-mofox-launcher-git`），直接从 GitHub 仓库构建最新代码，**不需要创建 release tags**。

## 准备工作

### 1. 注册 AUR 账户
- 访问 https://aur.archlinux.org/register
- 注册一个 AUR 账户
- 上传你的 SSH 公钥到账户设置

### 2. 安装必要工具
```bash
sudo pacman -S base-devel git
```

### 3. 配置 SSH
确保你的 SSH 密钥已添加到 AUR 账户：
```bash
# 如果没有 SSH 密钥，生成一个
ssh-keygen -t ed25519 -C "your.email@example.com"

# 查看公钥并复制到 AUR 账户设置
cat ~/.ssh/id_ed25519.pub
```

## 发布前准备

### 1. 更新 PKGBUILD Maintainer 信息
编辑 `/home/yishan/developer/Neo-MoFox-Launcher/aur/PKGBUILD`：

```bash
# Maintainer: Your Name <your.email@example.com>
```

**注意：Git 包不需要：**
- ❌ 创建 release tags（直接从 git 主分支构建）
- ❌ 手动更新版本号（`pkgver()` 函数自动获取）
- ❌ 计算 SHA256 校验和（git 包使用 `sha256sums=('SKIP')`）

### 2. 测试 PKGBUILD
在上传前，先在本地测试构建：

```bash
cd /home/yishan/developer/Neo-MoFox-Launcher/aur

# 生成 .SRCINFO 文件
makepkg --printsrcinfo > .SRCINFO

# 测试构建（不安装）
# 注意：git 包会自动运行 pkgver() 函数获取版本号
makepkg -sf

# 如果构建成功，测试安装
makepkg -sfi
```

## 上传到 AUR

### 1. 克隆 AUR 仓库
```bash
# 创建一个新目录用于 AUR 包
mkdir -p ~/aur
cd ~/aur

# 克隆你的 AUR 包仓库（首次上传时是空的）
# 注意：包名为 neo-mofox-launcher-git
git clone ssh://aur@aur.archlinux.org/neo-mofox-launcher-git.git
cd neo-mofox-launcher-git
```

### 2. 复制文件
将准备好的文件复制到 AUR 仓库：

```bash
# 从项目目录复制文件
cp /home/yishan/developer/Neo-MoFox-Launcher/aur/PKGBUILD .
cp /home/yishan/developer/Neo-MoFox-Launcher/aur/neo-mofox-launcher.desktop .

# 生成 .SRCINFO 文件
makepkg --printsrcinfo > .SRCINFO
```

### 3. 提交并推送
```bash
# 添加文件到 Git
git add PKGBUILD .SRCINFO neo-mofox-launcher.desktop

# 提交更改（git 包不需要写具体版本号）
git commit -m "Initial upload: neo-mofox-launcher-git"

# 推送到 AUR
git push origin master
```

## 更新包
**Git 包的优势：** 通常不需要手动更新！用户执行 `yay -Syu` 或 `makepkg -sf` 时会自动获取最新代码。

**仅在以下情况需要更新 AUR 仓库：**
1. 修改依赖关系（`depends`、`makedepends`）
2. 修改构建流程（`prepare()`、`build()`、`package()` 函数）
3. 修改包描述或其他元数据

```bash
cd ~/aur/neo-mofox-launcher-git

# 编辑 PKGBUILD（修改依赖或构建脚本）
vim PKGBUILD

# 重置 pkgrel（仅在修改 PKGBUILD 时增加）
# pkgrel=1 -> pkgrel=2

# 测试构建
makepkg -sf

# 更新 .SRCINFO
makepkg --printsrcinfo > .SRCINFO

# 提交更改
git add PKGBUILD .SRCINFO
git commit -m "Update dependencies / build script"
git push origin master
```

## 维护 AUR 包

### 响应用户评论和问题
- 定期检查 AUR 页面上的评论
- 及时回复用户的问题
Git 包很少会被标记为过期，因为它总是跟踪最新代码。如果被标记：
- 修复报告的 bug

### 处理过期标记
Git 包很少会被标记为过期，因为它总是跟踪最新代码。如果被标记：
1. 检查是否有构建问题
2. 测试是否能正常构建
3. 如果没问题，在 AUR 网页上取消过期标记

### 孤儿包（Orphan）
如果你不再维护这个包，可以在 AUR 网页上将其标记为"orphan"，允许其他人接手维护。

## 
| 特性 | Git 包 (`-git` 后缀) | 稳定版包 |
|------|---------------------|---------|
| 版本来源 | Git 主分支最新代码 | GitHub Release tags |
| 版本号 | 自动生成（如 `r123.abc1234`） | 手动指定（如 `1.0.0`） |
| 更新频率 | 用户自行决定 | 跟随上游 release |
| SHA256 | `SKIP` | 必须计算 |
| 维护成本 | 低（很少需要更新 AUR） | 高（每次 release 都要更新） |
| 适用场景 | 快速迭代、每夜构建 | 稳定发布 |

**本项目目前使用 Git 包，未来如果发布稳定版本，可以同时维护两个 AUR 包。**

## 常见问题

### 依赖问题
- `electron33` 可能需要改为 `electron` 或其他可用版本
- 检查 Arch 官方仓库和 AUR 中可用的包名

### 构建失败
- 确保所有依赖都正确列出
- 检查文件路径是否正确（Git 包的路径与 tar.gz 包不同）
- 查看 makepkg 的详细输出

### pkgver() 函数失败
- 确保 `git` 在 `makedepends` 中
- 检查 source 目录是否是有效的 git 仓库

### 网络问题clone 和 npm install 问题
- 某些依赖可能需要配置代理
- 考虑使用 `--nocheck` 跳过测试（如果测试失败）

## 有用的链接

- [AUR 提交指南](https://wiki.archlinux.org/title/AUR_submission_guidelines)
- [PKGBUILD 文档](https://wiki.archlinux.org/title/PKGBUILD)
- [makepkg 文档](https://wiki.archlinux.org/title/Makepkg)
- [AUR 主页](https://aur.archlinux.org/)

## 注意事项

1. **命名规范**：AUR 包名应该全小写，用连字符分隔
2. **许可证**：确保 LICENSE 文件存在且正确
3. **依赖**：仔细检查运行时和构建时依赖
4. **测试**：在干净的 chroot 环境中测试构建
5. **更新**：保持包与上游版本同步

## 获取帮助

如果遇到问题：
- 查阅 [ArchWiki](https://wiki.archlinux.org/)
- 在 [AUR 论坛](https://bbs.archlinux.org/viewforum.php?id=4) 提问
- 查看其他类似包的 PKGBUILD 作为参考
