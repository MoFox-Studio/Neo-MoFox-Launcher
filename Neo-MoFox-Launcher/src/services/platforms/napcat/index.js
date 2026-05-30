/**
 * NapCat 平台入口。
 * 聚合 NapCat 平台元数据、安装器、配置器与更新器。
 */

'use strict';

const { metadata, isAvailable } = require('./metadata');
const installer = require('./installer');
const config = require('./config');
const updater = require('./updater');
const runtime = require('./runtime');

const napcatPlatform = {
  ...metadata,
  isAvailable,
  installer,
  config,
  updater,
  runtime,
};

module.exports = { napcatPlatform };
