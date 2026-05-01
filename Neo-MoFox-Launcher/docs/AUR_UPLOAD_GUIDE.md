# Neo-MoFox Launcher AUR 上传指南

本文档说明如何将 Neo-MoFox Launcher 上传到 AUR（Arch User Repository）。

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

### 1. 创建 Git Tag
在发布到 AUR 之前，需要在 GitHub 上创建一个版本标签：

```bash
# 在项目目录下
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

或者在 GitHub 网页上创建 Release。

### 2. 测试 PKGBUILD
在上传前，先在本地测试构建：

```bash
cd /home/yishan/developer/Neo-MoFox-Launcher

# 生成 .SRCINFO 文件
makepkg --printsrcinfo > .SRCINFO

# 测试构建（不安装）
makepkg -s

# 如果构建成功，测试安装
makepkg -si
```

### 3. 更新 PKGBUILD
在 PKGBUILD 中更新以下内容：

1. **Maintainer 信息**：
   ```bash
   # Maintainer: Your Name <your.email@example.com>
   ```

2. **SHA256 校验和**：
   ```bash
   # 下载源码包并计算 SHA256
   wget https://github.com/MoFox-Studio/Neo-MoFox-Launcher/archive/refs/tags/v1.0.0.tar.gz
   sha256sum v1.0.0.tar.gz
   
   # 在 PKGBUILD 中替换 'SKIP' 为实际的 SHA256 值
   sha256sums=('实际的sha256值')
   ```

## 上传到 AUR

### 1. 克隆 AUR 仓库
```bash
# 创建一个新目录用于 AUR 包
mkdir -p ~/aur
cd ~/aur

# 克隆你的 AUR 包仓库（首次上传时是空的）
git clone ssh://aur@aur.archlinux.org/neo-mofox-launcher.git
cd neo-mofox-launcher
```

### 2. 复制文件
将准备好的文件复制到 AUR 仓库：

```bash
# 从项目目录复制文件
cp /home/yishan/developer/Neo-MoFox-Launcher/PKGBUILD .
cp /home/yishan/developer/Neo-MoFox-Launcher/neo-mofox-launcher.desktop .

# 生成 .SRCINFO 文件
makepkg --printsrcinfo > .SRCINFO
```

### 3. 提交并推送
```bash
# 添加文件到 Git
git add PKGBUILD .SRCINFO neo-mofox-launcher.desktop

# 提交更改
git commit -m "Initial upload: neo-mofox-launcher 1.0.0"

# 推送到 AUR
git push origin master
```

## 更新包

当发布新版本时：

1. 更新 PKGBUILD 中的 `pkgver` 和 `pkgrel`
2. 更新 `sha256sums`
3. 测试构建
4. 生成新的 .SRCINFO
5. 提交并推送更改

```bash
cd ~/aur/neo-mofox-launcher

# 编辑 PKGBUILD（更新版本号等）
vim PKGBUILD

# 测试构建
makepkg -sf

# 更新 .SRCINFO
makepkg --printsrcinfo > .SRCINFO

# 提交更改
git add PKGBUILD .SRCINFO
git commit -m "Update to version 1.1.0"
git push origin master
```

## 维护 AUR 包

### 响应用户评论和问题
- 定期检查 AUR 页面上的评论
- 及时回复用户的问题
- 修复报告的 bug

### 处理过期标记
如果有用户标记你的包为过期（out-of-date）：
1. 检查是否有新版本
2. 更新 PKGBUILD
3. 推送更改
4. 在 AUR 网页上取消过期标记

### 孤儿包（Orphan）
如果你不再维护这个包，可以在 AUR 网页上将其标记为"orphan"，允许其他人接手维护。

## 常见问题

### 依赖问题
- `electron33` 可能需要改为 `electron` 或其他可用版本
- 检查 Arch 官方仓库和 AUR 中可用的包名

### 构建失败
- 确保所有依赖都正确列出
- 检查文件路径是否正确
- 查看 makepkg 的详细输出

### 网络问题
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
