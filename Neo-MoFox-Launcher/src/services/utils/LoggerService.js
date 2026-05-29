/**
 * LoggerService - 统一日志管理服务
 * 支持文件写入、日志轮转、gzip 压缩和历史日志读取
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// 延迟导入 SettingsService，避免循环依赖
let settingsService = null;
function getSettingsService() {
  if (!settingsService) {
    const { settingsService: service } = require('./settings/SettingsService');
    settingsService = service;
  }
  return settingsService;
}

/**
 * 从设置服务获取日志配置
 */
function getLogConfig() {
  try {
    const settings = getSettingsService();
    const logging = settings.get('logging');
    return {
      maxFileSize: logging?.maxFileSize || 50 * 1024 * 1024,
      maxArchiveDays: logging?.maxArchiveDays || 30,
      compressArchive: logging?.compressArchive !== false
    };
  } catch (err) {
    // 如果无法读取设置，返回默认值
    console.warn('[LoggerService] 无法读取日志配置，使用默认值:', err.message);
    return {
      maxFileSize: 50 * 1024 * 1024,
      maxArchiveDays: 30,
      compressArchive: true
    };
  }
}

// ─── 日志等级枚举（仅用于格式化标签，不用于过滤）────────────────────
const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

// ─── 轮转模式 ──────────────────────────────────────────────────────────
const RotationMode = {
  DATE: 'date',      // 按日期轮转（每日 00:00）
  SIZE: 'size',      // 按文件大小轮转
  BOTH: 'both'       // 同时支持日期和大小轮转
};

// ─── 日志写入器基类 ────────────────────────────────────────────────────
class LogWriter {
  /**
   * @param {Object} options - 配置选项
   * @param {string} options.logDir - 日志目录
   * @param {string} options.baseFilename - 基础文件名（不含扩展名）
   * @param {RotationMode} options.rotationMode - 轮转模式
   * @param {number} options.maxFileSize - 最大文件大小（字节）
   * @param {number} options.maxArchiveDays - 归档保留天数
   * @param {boolean} options.compressArchive - 是否压缩归档
   */
  constructor(options = {}) {
    this.logDir = options.logDir || 'logs';
    this.baseFilename = options.baseFilename || 'app';
    this.rotationMode = options.rotationMode || RotationMode.BOTH;
    this.maxFileSize = options.maxFileSize || 50 * 1024 * 1024; // 50MB
    this.maxArchiveDays = options.maxArchiveDays || 30;
    this.compressArchive = options.compressArchive !== false; // 默认启用压缩

    this._currentFile = null;
    this._currentDate = null;
    this._writeBuffer = [];
    this._flushTimer = null;

    // 确保日志目录存在
    this._ensureLogDir();
    
    // 启动时清理过期归档
    this._cleanupOldArchives();
  }

  /**
   * 确保日志目录存在
   */
  _ensureLogDir() {
    try {
      fs.mkdirSync(this.logDir, { recursive: true });
    } catch (err) {
      console.error(`[LogWriter] 创建日志目录失败: ${err.message}`);
    }
  }

  /**
   * 获取当前日期字符串 (YYYYMMDD)
   */
  _getCurrentDateStr() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * 获取当前活动日志文件路径
   */
  _getCurrentLogPath() {
    return path.join(this.logDir, `${this.baseFilename}.log`);
  }

  /**
   * 获取归档文件路径
   */
  _getArchivePath(dateStr, compress = true) {
    const ext = compress ? '.log.gz' : '.log';
    return path.join(this.logDir, `${this.baseFilename}-${dateStr}${ext}`);
  }

  /**
   * 检查是否需要轮转
   */
  _shouldRotate() {
    const currentLogPath = this._getCurrentLogPath();
    
    // 文件不存在，无需轮转
    if (!fs.existsSync(currentLogPath)) {
      return false;
    }

    // 检查日期轮转
    if (this.rotationMode === RotationMode.DATE || this.rotationMode === RotationMode.BOTH) {
      const currentDate = this._getCurrentDateStr();
      if (this._currentDate && this._currentDate !== currentDate) {
        return true;
      }
    }

    // 检查文件大小轮转
    if (this.rotationMode === RotationMode.SIZE || this.rotationMode === RotationMode.BOTH) {
      try {
        const stats = fs.statSync(currentLogPath);
        if (stats.size >= this.maxFileSize) {
          return true;
        }
      } catch (err) {
        // 忽略错误
      }
    }

    return false;
  }

  /**
   * 执行日志轮转
   */
  _rotateLog() {
    const currentLogPath = this._getCurrentLogPath();
    
    if (!fs.existsSync(currentLogPath)) {
      return;
    }

    try {
      // 使用时间戳确保文件名唯一
      const dateStr = this._currentDate || this._getCurrentDateStr();
      const timestamp = Date.now();
      const archivePath = this._getArchivePath(`${dateStr}-${timestamp}`, false);

      // 先重命名为临时文件
      fs.renameSync(currentLogPath, archivePath);

      // 异步压缩归档文件（如果启用）
      if (this.compressArchive) {
        this._compressArchiveAsync(archivePath);
      }

      console.log(`[LogWriter] 日志已轮转: ${archivePath}`);
    } catch (err) {
      console.error(`[LogWriter] 日志轮转失败: ${err.message}`);
    }
  }

  /**
   * 异步压缩归档文件
   */
  async _compressArchiveAsync(filePath) {
    try {
      const content = await fs.promises.readFile(filePath);
      const compressed = await gzip(content);
      const gzPath = filePath + '.gz';
      
      await fs.promises.writeFile(gzPath, compressed);
      await fs.promises.unlink(filePath); // 删除未压缩文件
      
      console.log(`[LogWriter] 归档已压缩: ${gzPath}`);
    } catch (err) {
      console.error(`[LogWriter] 压缩归档失败: ${err.message}`);
    }
  }

  /**
   * 清理过期归档文件
   */
  _cleanupOldArchives() {
    try {
      const files = fs.readdirSync(this.logDir);
      const now = Date.now();
      const maxAge = this.maxArchiveDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        // 只处理归档文件（包含日期戳的文件）
        if (!file.startsWith(this.baseFilename) || file === `${this.baseFilename}.log`) {
          continue;
        }

        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        if (age > maxAge) {
          fs.unlinkSync(filePath);
          console.log(`[LogWriter] 删除过期归档: ${file}`);
        }
      }
    } catch (err) {
      console.error(`[LogWriter] 清理归档失败: ${err.message}`);
    }
  }

  /**
   * 格式化日志行
   */
  _formatLogLine(level, source, message) {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 23);
    return `[${timestamp}] [${level}] [${source}] ${message}\n`;
  }

  /**
   * 写入日志（同步）
   */
  writeSync(level, source, message) {
    try {
      // 更新当前日期
      this._currentDate = this._getCurrentDateStr();

      // 检查是否需要轮转
      if (this._shouldRotate()) {
        this._rotateLog();
        this._currentDate = this._getCurrentDateStr();
      }

      // 格式化日志行
      const logLine = this._formatLogLine(level, source, message);
      const logPath = this._getCurrentLogPath();

      // 同步写入文件
      fs.appendFileSync(logPath, logLine, 'utf8');
    } catch (err) {
      // 避免日志写入失败导致主进程崩溃
      console.error(`[LogWriter] 写入日志失败: ${err.message}`);
    }
  }

  /**
   * 关闭日志写入器
   */
  close() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
  }
}

// ─── 历史日志读取器 ────────────────────────────────────────────────────
class LogReader {
  /**
   * 读取日志文件内容（自动处理 gzip）
   */
  static async readLogFile(filePath) {
    try {
      const content = await fs.promises.readFile(filePath);
      
      // 检查是否为 gzip 文件
      if (filePath.endsWith('.gz')) {
        const decompressed = await gunzip(content);
        return decompressed.toString('utf8');
      }
      
      return content.toString('utf8');
    } catch (err) {
      throw new Error(`读取日志文件失败: ${err.message}`);
    }
  }

  /**
   * 列出日志目录下的所有日志文件
   */
  static listLogFiles(logDir, baseFilename) {
    try {
      const files = fs.readdirSync(logDir);
      const logFiles = files
        .filter(file => file.startsWith(baseFilename))
        .map(file => {
          const filePath = path.join(logDir, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            path: filePath,
            size: stats.size,
            mtime: stats.mtime,
            isCompressed: file.endsWith('.gz'),
            isCurrent: file === `${baseFilename}.log`
          };
        })
        .sort((a, b) => b.mtime - a.mtime); // 按时间倒序

      return logFiles;
    } catch (err) {
      console.error(`[LogReader] 列出日志文件失败: ${err.message}`);
      return [];
    }
  }

  /**
   * 解析日志行
   */
  static parseLogLine(line) {
    // 格式：[时间戳] [等级] [来源] 消息
    const match = line.match(/^\[([^\]]+)\] \[([^\]]+)\] \[([^\]]+)\] (.*)$/);
    if (!match) {
      return null;
    }

    return {
      timestamp: match[1],
      level: match[2],
      source: match[3],
      message: match[4]
    };
  }
}

// ─── 启动器日志管理器 ──────────────────────────────────────────────────
class LauncherLogger {
  constructor(logDir) {
    const logConfig = getLogConfig();
    
    this.writer = new LogWriter({
      logDir: path.join(logDir, 'launcher'),
      baseFilename: 'launcher',
      rotationMode: RotationMode.BOTH,
      maxFileSize: logConfig.maxFileSize,
      maxArchiveDays: logConfig.maxArchiveDays,
      compressArchive: logConfig.compressArchive
    });

    this._originalConsole = {};
    this._isHijacked = false;
  }

  /**
   * 劫持全局 console 对象
   */
  hijackConsole() {
    if (this._isHijacked) {
      return;
    }

    // 写入启动分割线
    const separator = '='.repeat(80);
    const sessionId = Date.now();
    const startTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    this.writer.writeSync(LogLevel.INFO, 'System', separator);
    this.writer.writeSync(LogLevel.INFO, 'System', `新会话启动 - Session ID: ${sessionId}`);
    this.writer.writeSync(LogLevel.INFO, 'System', `启动时间: ${startTime}`);
    this.writer.writeSync(LogLevel.INFO, 'System', separator);

    // 保存原始 console 方法
    this._originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      debug: console.debug
    };

    const self = this;

    // 重写 console.log
    console.log = function(...args) {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      
      self.writer.writeSync(LogLevel.INFO, 'Console', message);
      self._originalConsole.log.apply(console, args);
    };

    // 重写 console.warn
    console.warn = function(...args) {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      
      self.writer.writeSync(LogLevel.WARN, 'Console', message);
      self._originalConsole.warn.apply(console, args);
    };

    // 重写 console.error
    console.error = function(...args) {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      
      self.writer.writeSync(LogLevel.ERROR, 'Console', message);
      self._originalConsole.error.apply(console, args);
    };

    // 重写 console.debug
    console.debug = function(...args) {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      
      self.writer.writeSync(LogLevel.DEBUG, 'Console', message);
      self._originalConsole.debug.apply(console, args);
    };

    this._isHijacked = true;
    console.log('[LauncherLogger] Console 输出已劫持，所有日志将同时写入文件');
  }

  /**
   * 恢复原始 console 对象
   */
  restoreConsole() {
    if (!this._isHijacked) {
      return;
    }

    console.log = this._originalConsole.log;
    console.warn = this._originalConsole.warn;
    console.error = this._originalConsole.error;
    console.debug = this._originalConsole.debug;

    this._isHijacked = false;
  }

  /**
   * 关闭日志管理器
   */
  close() {
    // 写入关闭分割线
    const separator = '='.repeat(80);
    const endTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    this.writer.writeSync(LogLevel.INFO, 'System', separator);
    this.writer.writeSync(LogLevel.INFO, 'System', `会话结束 - 关闭时间: ${endTime}`);
    this.writer.writeSync(LogLevel.INFO, 'System', separator);
    this.writer.writeSync(LogLevel.INFO, 'System', ''); // 空行分隔
    
    this.restoreConsole();
    this.writer.close();
  }

  /**
   * 获取日志目录
   */
  getLogDir() {
    return this.writer.logDir;
  }
}

// ─── 实例日志管理器 ────────────────────────────────────────────────────
class InstanceLogger {
  /**
   * @param {string} logDir - 日志根目录
   * @param {string} instanceId - 实例 ID
   * @param {string} logType - 日志类型（'mofox' 或 'napcat'）
   */
  constructor(logDir, instanceId, logType) {
    this.instanceId = instanceId;
    this.logType = logType;
    
    const logConfig = getLogConfig();
    
    this.writer = new LogWriter({
      logDir: path.join(logDir, 'instances', instanceId),
      baseFilename: logType,
      rotationMode: RotationMode.BOTH,
      maxFileSize: logConfig.maxFileSize,
      maxArchiveDays: logConfig.maxArchiveDays,
      compressArchive: logConfig.compressArchive
    });

    // 写入启动分割线
    const separator = '='.repeat(80);
    const sessionId = Date.now();
    const startTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    this.writer.writeSync(LogLevel.INFO, 'System', separator);
    this.writer.writeSync(LogLevel.INFO, 'System', `实例启动 - Instance: ${instanceId} (${logType})`);
    this.writer.writeSync(LogLevel.INFO, 'System', `Session ID: ${sessionId}`);
    this.writer.writeSync(LogLevel.INFO, 'System', `启动时间: ${startTime}`);
    this.writer.writeSync(LogLevel.INFO, 'System', separator);
  }

  /**
   * 记录消息（统一处理，不区分 stdout/stderr）
   * @param {string} message - 日志消息
   */
  log(message) {
    // 使用 INFO 等级，因为实例输出都来自 stderr，不需要额外区分
    this.writer.writeSync(LogLevel.INFO, this.logType.toUpperCase(), message);
  }

  /**
   * 关闭日志管理器
   */
  close() {
    // 写入关闭分割线
    const separator = '='.repeat(80);
    const endTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    this.writer.writeSync(LogLevel.INFO, 'System', separator);
    this.writer.writeSync(LogLevel.INFO, 'System', `实例停止 - Instance: ${this.instanceId} (${this.logType})`);
    this.writer.writeSync(LogLevel.INFO, 'System', `停止时间: ${endTime}`);
    this.writer.writeSync(LogLevel.INFO, 'System', separator);
    this.writer.writeSync(LogLevel.INFO, 'System', ''); // 空行分隔
    
    this.writer.close();
  }

  /**
   * 获取日志目录
   */
  getLogDir() {
    return this.writer.logDir;
  }
}

// ─── 导出 ──────────────────────────────────────────────────────────────
module.exports = {
  LogLevel,
  RotationMode,
  LogWriter,
  LogReader,
  LauncherLogger,
  InstanceLogger
};
