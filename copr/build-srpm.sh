#!/usr/bin/env bash
# ============================================================================
# 从 GitHub 每夜构建产物生成 Copr 可接受的 SRPM
#
# 使用方式：
#   1) 在 GitHub Actions 中调用（推荐，自动从 release 拉 RPM）：
#        ARCH=x86_64 ./copr/build-srpm.sh "$BUILD_DATE" "$OUTDIR"
#      其中 BUILD_DATE 为日期字符串（例如 20260506），OUTDIR 是 SRPM 输出目录。
#
#   2) Copr "Custom" 源构建模式调用：
#        Copr 会传入 outdir 参数。
# ============================================================================

set -euo pipefail

NIGHTLY_DATE="${1:-${BUILD_DATE:-$(date -u +%Y%m%d)}}"
OUTDIR="${2:-${RESULTDIR:-./copr-srpm}}"
ARCH="${ARCH:-x86_64}"
REPO_OWNER="${REPO_OWNER:-MoFox-Studio}"
REPO_NAME="${REPO_NAME:-Neo-MoFox-Launcher}"

case "$ARCH" in
    x86_64) UPSTREAM_ARCH=x64 ;;
    aarch64) UPSTREAM_ARCH=arm64 ;;
    *) echo "[build-srpm] 不支持的架构: $ARCH" >&2; exit 1 ;;
esac

mkdir -p "$OUTDIR"
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

# 上游 RPM URL
ASSET_NAME="Neo-MoFox-Launcher-${NIGHTLY_DATE}-nightly-linux-${UPSTREAM_ARCH}.rpm"
RELEASE_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/nightly-${NIGHTLY_DATE}/${ASSET_NAME}"

echo "[build-srpm] 正在下载: $RELEASE_URL"
curl -fL -o "${WORKDIR}/Neo-MoFox-Launcher-upstream.rpm" "$RELEASE_URL"

# 准备 rpmbuild 目录
RPMBUILD_ROOT="${WORKDIR}/rpmbuild"
mkdir -p "${RPMBUILD_ROOT}"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}
cp "${WORKDIR}/Neo-MoFox-Launcher-upstream.rpm" "${RPMBUILD_ROOT}/SOURCES/Neo-MoFox-Launcher-upstream.rpm"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "${SCRIPT_DIR}/neo-mofox-launcher.spec" "${RPMBUILD_ROOT}/SPECS/"

echo "[build-srpm] 正在打包 SRPM..."
rpmbuild \
    --define "_topdir ${RPMBUILD_ROOT}" \
    --define "nightly_date ${NIGHTLY_DATE}" \
    --define "upstream_arch ${ARCH}" \
    -bs "${RPMBUILD_ROOT}/SPECS/neo-mofox-launcher.spec"

cp "${RPMBUILD_ROOT}/SRPMS/"*.src.rpm "$OUTDIR/"
echo "[build-srpm] 完成，已输出到 $OUTDIR :"
ls -lh "$OUTDIR"
