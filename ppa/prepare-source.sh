#!/usr/bin/env bash
# prepare-source.sh — GitHub Actions / 本地均可用的 PPA 源码包构建脚本
#
# 主要能力：
#   1) 接收版本号参数（可直接传 v1.2.3 或 1.2.3）
#   2) 自动下载 Electron 二进制（wget 或 curl）
#   3) 自动生成/更新构建目录中的 debian/changelog
#   4) 执行签名源码构建（配合 crazy-max/ghaction-import-gpg）
#   5) 将 .changes/.dsc/.tar.* 等产物统一归档到指定目录
#
# 用法：
#   bash ppa/prepare-source.sh <version> [electron_version]
#
# 示例：
#   bash ppa/prepare-source.sh v1.0.0
#   bash ppa/prepare-source.sh 1.0.0 39.0.0

set -euo pipefail

# ── 参数与配置 ───────────────────────────────────────────────────────────────
PKG_NAME="neo-mofox-launcher"
PKG_REV="${PKG_REV:-1}"
DIST_TARGET="${DIST_TARGET:-noble}"
ARTIFACT_DIR="${ARTIFACT_DIR:-ppa/artifacts}"
BUILD_ROOT="${BUILD_ROOT:-ppa/.build}"
KEEP_BUILD_DIR="${KEEP_BUILD_DIR:-0}"

if [ "${1:-}" = "" ]; then
    echo "ERROR: 缺少版本号参数。"
    echo "用法: bash ppa/prepare-source.sh <version> [electron_version]"
    echo "示例: bash ppa/prepare-source.sh v1.0.0"
    exit 1
fi

RAW_VERSION="$1"
PKG_VERSION="${RAW_VERSION#v}"
ELECTRON_VERSION_INPUT="${2:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

if [ -n "${ELECTRON_VERSION_INPUT}" ]; then
    ELECTRON_VERSION="${ELECTRON_VERSION_INPUT}"
else
    ELECTRON_VERSION="$(node -p "const p=require('./Neo-MoFox-Launcher/package.json'); (p.devDependencies?.electron || p.dependencies?.electron || '').replace(/^[^0-9]*/, '')")"
fi

if [ -z "${ELECTRON_VERSION}" ]; then
    echo "ERROR: 无法从 package.json 解析 Electron 版本，请手动传入第二个参数。"
    exit 1
fi

ELECTRON_URL="https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-linux-x64.zip"
ELECTRON_ZIP="${RUNNER_TEMP:-/tmp}/electron-v${ELECTRON_VERSION}-linux-x64.zip"

SRC_DIR_NAME="${PKG_NAME}-${PKG_VERSION}"
BUILD_DIR="${REPO_ROOT}/${BUILD_ROOT}/${SRC_DIR_NAME}"
ARTIFACT_ABS_DIR="${REPO_ROOT}/${ARTIFACT_DIR}"
ORIG_NAME="${PKG_NAME}_${PKG_VERSION}.orig.tar.gz"
BUILD_PARENT="$(dirname "${BUILD_DIR}")"

# ── 检查工具 ─────────────────────────────────────────────────────────────────
for cmd in unzip npm dpkg-buildpackage; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "ERROR: 缺少依赖命令: $cmd"
        exit 1
    fi
done

if ! command -v wget &>/dev/null && ! command -v curl &>/dev/null; then
    echo "ERROR: 需要 wget 或 curl 之一用于下载 Electron。"
    exit 1
fi

# ── 解析维护者与签名信息 ─────────────────────────────────────────────────────
CHANGELOG_SIG_LINE="$(grep -m1 '^ -- ' ppa/debian/changelog || true)"
MAINTAINER_NAME="ikun114"
MAINTAINER_EMAIL="334495606@qq.com"

if [ -n "${CHANGELOG_SIG_LINE}" ]; then
    PARSED_NAME="$(echo "${CHANGELOG_SIG_LINE}" | sed -n 's/^ -- \(.*\) <.*>  .*/\1/p')"
    PARSED_EMAIL="$(echo "${CHANGELOG_SIG_LINE}" | sed -n 's/^ -- .* <\(.*\)>  .*/\1/p')"
    MAINTAINER_NAME="${PARSED_NAME:-$MAINTAINER_NAME}"
    MAINTAINER_EMAIL="${PARSED_EMAIL:-$MAINTAINER_EMAIL}"
fi

DEBFULLNAME="${DEBFULLNAME:-$MAINTAINER_NAME}"
DEBEMAIL="${DEBEMAIL:-$MAINTAINER_EMAIL}"
export DEBFULLNAME DEBEMAIL

SIGN_KEY="${GPG_KEY_ID:-${GPG_FINGERPRINT:-}}"

echo "==> 构建参数"
echo "    包名:            ${PKG_NAME}"
echo "    版本:            ${PKG_VERSION}-${PKG_REV}"
echo "    Electron 版本:   ${ELECTRON_VERSION}"
echo "    目标发行版:      ${DIST_TARGET}"
echo "    产物目录:        ${ARTIFACT_ABS_DIR}"
if [ -n "${SIGN_KEY}" ]; then
    echo "    GPG 签名 Key:    ${SIGN_KEY}"
else
    echo "    GPG 签名 Key:    自动（默认私钥）"
fi
echo ""

# ── 清理旧构建与产物目录 ─────────────────────────────────────────────────────
rm -rf "${BUILD_DIR}" "${ARTIFACT_ABS_DIR}"
mkdir -p "${BUILD_DIR}" "${ARTIFACT_ABS_DIR}" "${BUILD_PARENT}"

# ── 复制源代码 ────────────────────────────────────────────────────────────────
echo "==> 复制源代码..."
cp -a Neo-MoFox-Launcher "${BUILD_DIR}/"
cp -a aur                "${BUILD_DIR}/"
cp -a LICENSE README.md  "${BUILD_DIR}/" 2>/dev/null || true

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
if [ ! -f "${ELECTRON_ZIP}" ]; then
    echo "==> 下载 Electron v${ELECTRON_VERSION}..."
    if command -v wget &>/dev/null; then
        wget -nv -O "${ELECTRON_ZIP}" "${ELECTRON_URL}"
    else
        curl -L --fail --progress-bar "${ELECTRON_URL}" -o "${ELECTRON_ZIP}"
    fi
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

# 自动生成 changelog 顶部条目（构建目录内）
echo "==> 生成 debian/changelog 条目..."
CHANGELOG_DATE="$(LC_ALL=C date -R)"
cat > "${BUILD_DIR}/debian/changelog" <<EOF
${PKG_NAME} (${PKG_VERSION}-${PKG_REV}) ${DIST_TARGET}; urgency=medium

  * Automated release build from GitHub Actions.
  * Upstream version: ${PKG_VERSION}.
  * Bundled Electron runtime: ${ELECTRON_VERSION}.

 -- ${DEBFULLNAME} <${DEBEMAIL}>  ${CHANGELOG_DATE}

EOF

# ── 打包 orig.tar.gz ──────────────────────────────────────────────────────────
echo "==> 创建 ${ORIG_NAME}..."
tar --exclude="${BUILD_DIR}/debian" \
    -czf "${BUILD_PARENT}/${ORIG_NAME}" \
    -C "${BUILD_PARENT}" \
    "${SRC_DIR_NAME}"

# ── 构建源码包 ────────────────────────────────────────────────────────────────
echo "==> 构建 Debian 源码包..."
(
    cd "${BUILD_DIR}"
    if [ -n "${SIGN_KEY}" ]; then
        dpkg-buildpackage -S -sa -d -k"${SIGN_KEY}"
    else
        dpkg-buildpackage -S -sa -d
    fi
)

# ── 收集构建产物 ─────────────────────────────────────────────────────────────
echo "==> 归档构建产物到 ${ARTIFACT_ABS_DIR}..."
mv "${BUILD_PARENT}/${PKG_NAME}_${PKG_VERSION}.orig.tar.gz" "${ARTIFACT_ABS_DIR}/" 2>/dev/null || true
mv "${BUILD_PARENT}/${PKG_NAME}_${PKG_VERSION}-${PKG_REV}.debian.tar."* "${ARTIFACT_ABS_DIR}/" 2>/dev/null || true
mv "${BUILD_PARENT}/${PKG_NAME}_${PKG_VERSION}-${PKG_REV}.dsc" "${ARTIFACT_ABS_DIR}/" 2>/dev/null || true
mv "${BUILD_PARENT}/${PKG_NAME}_${PKG_VERSION}-${PKG_REV}_source.buildinfo" "${ARTIFACT_ABS_DIR}/" 2>/dev/null || true
mv "${BUILD_PARENT}/${PKG_NAME}_${PKG_VERSION}-${PKG_REV}_source.changes" "${ARTIFACT_ABS_DIR}/" 2>/dev/null || true

if [ "${KEEP_BUILD_DIR}" != "1" ]; then
    rm -rf "${BUILD_DIR}"
fi

echo ""
echo "==> 完成！生成的文件："
ls -lh "${ARTIFACT_ABS_DIR}" || true
echo ""
echo "上传到 PPA（替换 YOUR_LAUNCHPAD_ID）："
echo "  dput ppa:YOUR_LAUNCHPAD_ID/neo-mofox-launcher \\" 
echo "       ${ARTIFACT_DIR}/${PKG_NAME}_${PKG_VERSION}-${PKG_REV}_source.changes"
