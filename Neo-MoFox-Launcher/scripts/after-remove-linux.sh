#!/bin/bash
# after-remove-linux.sh — 卸载后执行，清理 CLI 入口链接

rm -f /usr/bin/neo-mofox-cli

# 更新桌面数据库和图标缓存
update-desktop-database /usr/share/applications 2>/dev/null || true
gtk-update-icon-cache /usr/share/icons/hicolor 2>/dev/null || true
