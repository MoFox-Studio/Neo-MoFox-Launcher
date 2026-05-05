#!/usr/bin/env bash
# /usr/bin/neo-mofox-launcher — wrapper script for Neo-MoFox Launcher
#
# 用法:
#   neo-mofox-launcher              启动 GUI（需要桌面环境）
#   neo-mofox-launcher --cli ...    使用命令行模式（无需桌面环境）
#   neo-mofox-launcher cli ...      同上

INSTALL_DIR="/usr/lib/neo-mofox-launcher"
CLI_ENTRY="${INSTALL_DIR}/resources/app.asar/src/cli/index.js"

# ─── CLI 模式分发 ───────────────────────────────────────────────
# 如果第一个参数是 --cli / cli，则脱去它并通过 node 调用 CLI 入口。
# 这样无桌面环境的服务器也能管理实例（list/start/stop/status/logs）。
if [ "$1" = "--cli" ] || [ "$1" = "cli" ]; then
    shift
    # 优先使用系统 node；若不存在，则回退到 electron 作为 Node 解释器
    if command -v node >/dev/null 2>&1; then
        exec node "${CLI_ENTRY}" "$@"
    else
        exec env ELECTRON_RUN_AS_NODE=1 \
            "${INSTALL_DIR}/electron" \
            "${CLI_ENTRY}" "$@"
    fi
fi

# ─── GUI 模式（默认） ────────────────────────────────────────────
exec env ELECTRON_OZONE_PLATFORM_HINT=auto \
    "${INSTALL_DIR}/electron" \
    "${INSTALL_DIR}/resources/app.asar" \
    "$@"
