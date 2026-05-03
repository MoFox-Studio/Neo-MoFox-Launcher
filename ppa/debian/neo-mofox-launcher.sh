#!/usr/bin/env bash
# /usr/bin/neo-mofox-launcher — wrapper script for Neo-MoFox Launcher

INSTALL_DIR="/usr/lib/neo-mofox-launcher"

exec env ELECTRON_OZONE_PLATFORM_HINT=auto \
    "${INSTALL_DIR}/electron" \
    "${INSTALL_DIR}/resources/app.asar" \
    "$@"
