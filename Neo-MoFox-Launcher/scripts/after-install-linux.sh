#!/bin/bash
# after-install-linux.sh — 安装后执行，创建 CLI 入口的 /usr/bin 链接
# electron-builder 会在安装后调用此脚本

INSTALL_DIR="/opt/Neo-MoFox Launcher"
CLI_WRAPPER="${INSTALL_DIR}/neo-mofox-cli"

if [ -f "${CLI_WRAPPER}" ]; then
    chmod 0755 "${CLI_WRAPPER}"
    ln -sf "${CLI_WRAPPER}" /usr/bin/neo-mofox-cli
fi

# 更新桌面数据库和图标缓存
update-desktop-database /usr/share/applications 2>/dev/null || true
gtk-update-icon-cache /usr/share/icons/hicolor 2>/dev/null || true
