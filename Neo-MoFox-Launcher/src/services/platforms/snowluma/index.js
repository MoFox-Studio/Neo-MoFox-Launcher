/**
 * SnowLuma 平台入口。
 * 聚合 SnowLuma 平台元数据、安装器、配置器、更新器与运行时能力。
 */

'use strict';

const { metadata, isAvailable } = require('./metadata');
const installer = require('./installer');
const config = require('./config');
const updater = require('./updater');
const runtime = require('./runtime');

const snowlumaPlatform = {
  ...metadata,
  isAvailable,
  installer,
  config,
  updater,
  runtime,
};

module.exports = { snowlumaPlatform };
