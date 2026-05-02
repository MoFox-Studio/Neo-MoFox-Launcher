#!/usr/bin/env bash
# prepare-source.sh — 准备 Launchpad PPA 源码包
#
# 此脚本负责：
#   1. 预先下载 Electron 二进制（Launchpad 构建环境无网络）
#   2. 预先安装 npm 依赖（node_modules）
#   3. 将 ppa/debian/ 文件就位
#   4. 打包 orig.tar.gz 并构建 .dsc/.changes 源码包
#
# 用法（在项目根目录执行）：
#   bash ppa/prepare-source.sh [ELECTRON_VERSION]
#
# 示例：
#   bash ppa/prepare-source.sh 39.0.0

set -euo pipefail

# ── 配置 ──────────────────────────────────────────────────────────────────────
PKG_NAME="neo-mofox-launcher"
PKG_VERSION="1.0.0"
PKG_REV="1"
ELECTRON_VERSION="${1:-39.0.0}"
DIST_TARGET="noble"   # Ubuntu 目标发行版，可改为 jammy / focal 等

ELECTRON_URL="https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-linux-x64.zip"
ORIG_NAME="${PKG_NAME}_${PKG_VERSION}.orig.tar.gz"
BUILD_DIR="${PKG_NAME}-${PKG_VERSION}"

# ── 检查工具 ──────────────────────────────────────────────────────────────────
for cmd in curl unzip npm dpkg-buildpackage dput; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "ERROR: 缺少依赖命令: $cmd"
        exit 1
    fi
done

echo "==> 构建参数"
echo "    包名:            ${PKG_NAME}"
echo "    版本:            ${PKG_VERSION}-${PKG_REV}"
echo "    Electron 版本:   ${ELECTRON_VERSION}"
echo "    目标发行版:      ${DIST_TARGET}"
echo ""

# ── 清理旧构建 ────────────────────────────────────────────────────────────────
rm -rf "${BUILD_DIR}"

# ── 复制源代码 ────────────────────────────────────────────────────────────────
echo "==> 复制源代码..."
mkdir -p "${BUILD_DIR}"
cp -a Neo-MoFox-Launcher "${BUILD_DIR}/"
cp -a aur               "${BUILD_DIR}/"
cp -a LICENSE README.md "${BUILD_DIR}/" 2>/dev/null || true

# ── 安装 npm 依赖（预先 vendor，Launchpad 无网络）────────────────────────────
echo "==> 安装 npm 依赖（node_modules）..."
(
    cd "${BUILD_DIR}/Neo-MoFox-Launcher"
    export ELECTRON_SKIP_BINARY_DOWNLOAD=1
    export NPM_CONFIG_CACHE="${TMPDIR:-/tmp}/.npm_cache_ppa"

    # 中国用户可取消注释以加速下载：
    # export NPM_CONFIG_REGISTRY="https://registry.npmmirror.com"

    NODE_ENV=development npm install
)

# ── 下载 Electron 二进制 ──────────────────────────────────────────────────────
ELECTRON_ZIP="/tmp/electron-v${ELECTRON_VERSION}-linux-x64.zip"
if [ ! -f "${ELECTRON_ZIP}" ]; then
    echo "==> 下载 Electron v${ELECTRON_VERSION}..."
    curl -L --fail --progress-bar "${ELECTRON_URL}" -o "${ELECTRON_ZIP}"
else
    echo "==> 使用缓存的 Electron: ${ELECTRON_ZIP}"
fi

echo "==> 解压 Electron..."
mkdir -p "${BUILD_DIR}/electron-dist"
unzip -q "${ELECTRON_ZIP}" -d "${BUILD_DIR}/electron-dist"

# ── 就位 debian/ 打包文件 ─────────────────────────────────────────────────────
echo "==> 设置 debian/ 目录..."
mkdir -p "${BUILD_DIR}/debian/source"
cp ppa/debian/control             "${BUILD_DIR}/debian/"
cp ppa/debian/rules               "${BUILD_DIR}/debian/"
cp ppa/debian/changelog           "${BUILD_DIR}/debian/"
cp ppa/debian/copyright           "${BUILD_DIR}/debian/"
cp ppa/debian/neo-mofox-launcher.sh "${BUILD_DIR}/debian/"
cp ppa/debian/source/format       "${BUILD_DIR}/debian/source/"

# debian/rules 必须有执行权限
chmod 755 "${BUILD_DIR}/debian/rules"

# 更新 changelog 中的目标发行版（如不是 noble）
if [ "${DIST_TARGET}" != "noble" ]; then
    sed -i "s/) noble;/) ${DIST_TARGET};/" "${BUILD_DIR}/debian/changelog"
fi

# ── 打包 orig.tar.gz ──────────────────────────────────────────────────────────
echo "==> 创建 ${ORIG_NAME}..."
tar --exclude="${BUILD_DIR}/debian" \
    -czf "${ORIG_NAME}" \
    "${BUILD_DIR}"

# ── 构建源码包 ────────────────────────────────────────────────────────────────
echo "==> 构建 Debian 源码包..."
(
    cd "${BUILD_DIR}"
    dpkg-buildpackage -S -sa -d --no-sign
)

echo ""
echo "==> 完成！生成的文件："
ls -lh "${PKG_NAME}_${PKG_VERSION}"* 2>/dev/null || true
echo ""
echo "上传到 PPA（替换 YOUR_LAUNCHPAD_ID）："
echo "  dput ppa:YOUR_LAUNCHPAD_ID/neo-mofox-launcher \\"
echo "       ${PKG_NAME}_${PKG_VERSION}-${PKG_REV}_source.changes"
