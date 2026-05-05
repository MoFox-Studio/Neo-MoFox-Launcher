# ============================================================================
# Neo-MoFox Launcher 的 Copr / RPM 打包描述文件
#
# 设计思路：
#   electron-builder 在 CI 里产出完整的二进制 RPM（含 Electron 运行时），
#   本 spec 把这枚 RPM 重新封装成 Copr 可接受的 SRPM。
# ============================================================================

%global debug_package %{nil}
%global __os_install_post %{nil}
%global _build_id_links none
# Electron 应用使用预编译二进制，跳过自动依赖扫描
AutoReqProv: no

# @@PKG_VERSION@@ 由 build-srpm.sh 在生成 SRPM 时通过 sed 替换为
# “日期.短哈希”组合（例如 20260506.a1b2c3）
Name:           neo-mofox-launcher
Version:        @@PKG_VERSION@@
Release:        1%{?dist}
Summary:        Neo-MoFox Launcher - 跨平台 QQ Bot 启动器与管理工具
License:        MIT
URL:            https://github.com/MoFox-Studio/Neo-MoFox-Launcher
ExclusiveArch:  x86_64 aarch64

Source0:        Neo-MoFox-Launcher-upstream.rpm

BuildRequires:  cpio
BuildRequires:  rpm

# 与 electron-builder.yml 中的 rpm.depends 保持一致
Requires:       gtk3
Requires:       libnotify
Requires:       nss
Requires:       libXScrnSaver
Requires:       libXtst
Requires:       xdg-utils
Requires:       at-spi2-atk
Requires:       libuuid
Requires:       libsecret

%description
Neo-MoFox Launcher 是 MoFox-Studio 开发的跨平台 QQ Bot 启动器与管理工具，
提供图形化向导以及无桌面环境下可用的 TUI 命令行（neo-mofox-cli）。
本包由官方上游每夜构建产物重新封装而来。

%prep
%setup -q -c -T
rpm2cpio %{SOURCE0} | cpio -idmv

%build
# 二进制已就绪

%install
mkdir -p %{buildroot}
[ -d ./opt ] && cp -a ./opt %{buildroot}/
[ -d ./usr ] && cp -a ./usr %{buildroot}/

# electron-builder 的 RPM 不会自动建 /usr/bin 链接，手动补一个
mkdir -p %{buildroot}%{_bindir}
ln -sf "/opt/Neo-MoFox Launcher/neo-mofox-launcher" \
       %{buildroot}%{_bindir}/neo-mofox-launcher

# 列出实际安装内容，方便排错
echo "=== buildroot tree ==="
find %{buildroot} -mindepth 1 -maxdepth 5 -print || true

%post
/usr/bin/update-desktop-database &>/dev/null || :
/usr/bin/gtk-update-icon-cache %{_datadir}/icons/hicolor &>/dev/null || :

%postun
if [ $1 -eq 0 ]; then
    /usr/bin/update-desktop-database &>/dev/null || :
    /usr/bin/gtk-update-icon-cache %{_datadir}/icons/hicolor &>/dev/null || :
fi

%files
"/opt/Neo-MoFox Launcher"
%{_bindir}/neo-mofox-launcher
%{_datadir}/applications/neo-mofox-launcher.desktop
%{_datadir}/icons/hicolor/*/apps/neo-mofox-launcher.png

%changelog
* Tue Jan 01 2030 MoFox Studio <studio@mofox.dev> - @@PKG_VERSION@@-1
- 由每夜构建产物自动生成
