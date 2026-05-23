#!/usr/bin/env bash
# /usr/bin/neo-mofox-launcher — wrapper script for Neo-MoFox Launcher
#
# 用法:
#   neo-mofox-launcher              启动 GUI（需要桌面环境）
#   neo-mofox-launcher --cli ...    使用命令行模式（无需桌面环境）
#
# main.js 会检测 --cli 参数并自动切换到 CLI 模式，无需额外脚本。

INSTALL_DIR="/usr/lib/neo-mofox-launcher"

exec env ELECTRON_OZONE_PLATFORM_HINT=auto \
    "${INSTALL_DIR}/electron" \
    "${INSTALL_DIR}/resources/app.asar" \
    "$@"
