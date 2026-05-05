# ============================================================================
# Neo-MoFox Launcher 的 Copr / RPM 打包描述文件
#
# 设计思路：
#   electron-builder 已经在 CI 里产出了完整的二进制 RPM（含 Electron 运行时），
#   本 spec 的作用是把这枚二进制 RPM 重新封装成 Copr 可接受的 SRPM。
#   Copr 构建器执行 %prep 时把上游 RPM 解开，%install 把内容直接拷到 buildroot，
#   最终重新打成与上游内容一致的 RPM，但带上了 Copr 仓库元数据。
#
# 通过 build-srpm.sh 配合 GitHub Release 的 .rpm 资产生成 SRPM，
# 使用方式见 copr/README.md。
# ============================================================================

%global debug_package %{nil}
%global __os_install_post %{nil}
%global _build_id_links none

# 由 build-srpm.sh 在生成 SRPM 时通过 --define 注入
%{!?nightly_date: %global nightly_date 0}
%{!?upstream_arch: %global upstream_arch x86_64}

Name:           neo-mofox-launcher
Version:        %{nightly_date}
Release:        1%{?dist}
Summary:        Neo-MoFox Launcher - 跨平台 QQ Bot 启动器与管理工具
License:        MIT
URL:            https://github.com/MoFox-Studio/Neo-MoFox-Launcher
ExclusiveArch:  x86_64 aarch64

# Source0 在 build-srpm.sh 阶段被替换成 GitHub Release 上的 .rpm 实体
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
本包由官方上游每夜构建产物重新封装而来，内容与上游 RPM 等价。

%prep
%setup -q -c -T
# 把上游 RPM 解到当前目录
rpm2cpio %{SOURCE0} | cpio -idmv

%build
# 二进制已就绪，无需编译

%install
# 上游 RPM 解出来的根布局：./opt/...  ./usr/...
mkdir -p %{buildroot}
if [ -d ./opt ]; then
    cp -a ./opt %{buildroot}/
fi
if [ -d ./usr ]; then
    cp -a ./usr %{buildroot}/
fi

# 让 desktop 数据库 / icon 缓存 / mime 数据库知道我们装了新 desktop entry
%post
/usr/bin/update-desktop-database &> /dev/null || :
/bin/touch --no-create %{_datadir}/icons/hicolor &> /dev/null || :
/usr/bin/gtk-update-icon-cache %{_datadir}/icons/hicolor &> /dev/null || :

%postun
if [ $1 -eq 0 ]; then
    /usr/bin/update-desktop-database &> /dev/null || :
    /bin/touch --no-create %{_datadir}/icons/hicolor &> /dev/null || :
    /usr/bin/gtk-update-icon-cache %{_datadir}/icons/hicolor &> /dev/null || :
fi

%files
/opt/Neo-MoFox Launcher
%{_bindir}/neo-mofox-launcher
%{_datadir}/applications/neo-mofox-launcher.desktop
%{_datadir}/icons/hicolor/*/apps/neo-mofox-launcher.png
%{_datadir}/mime/packages/neo-mofox-launcher.xml

%changelog
* %(date +"%a %b %d %Y") MoFox Studio <studio@mofox.dev> - %{nightly_date}-1
- 由每夜构建产物自动生成
