#!/usr/bin/env bash
# /usr/bin/neo-mofox-cli — 命令行入口（无桌面环境亦可用）
#
# 用法: neo-mofox-cli <command> [options]
# 详细命令请运行: neo-mofox-cli help

INSTALL_DIR="/usr/lib/neo-mofox-launcher"
CLI_ENTRY="${INSTALL_DIR}/resources/app.asar.unpacked/src/cli/index.js"

if [ ! -f "${CLI_ENTRY}" ]; then
    echo "错误: 未找到 CLI 入口: ${CLI_ENTRY}" >&2
    echo "请确认 neo-mofox-launcher 已正确安装。" >&2
    exit 1
fi

if command -v node >/dev/null 2>&1; then
    exec node "${CLI_ENTRY}" "$@"
fi

# 回退：使用打包的 electron 作为 Node 解释器
if [ -x "${INSTALL_DIR}/electron" ]; then
    exec env ELECTRON_RUN_AS_NODE=1 \
        "${INSTALL_DIR}/electron" \
        "${CLI_ENTRY}" "$@"
fi

# 系统级 electron（AUR）
for v in 39 38 37 36 35; do
    if command -v "electron${v}" >/dev/null 2>&1; then
        exec env ELECTRON_RUN_AS_NODE=1 "electron${v}" "${CLI_ENTRY}" "$@"
    fi
done

echo "错误: 未找到可用的 node 或 electron 运行时" >&2
exit 1
