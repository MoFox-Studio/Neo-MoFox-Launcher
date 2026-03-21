/**
 * StorageService - 数据持久化服务
 * 管理 Launcher 全局状态、实例记录表及 TOML 配置写入
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const TOML = require('@iarna/toml');

// ─── 常量定义 ───────────────────────────────────────────────────────────

const INSTANCES_VERSION = 1;
const INSTANCES_FILE = 'instances.json';

// ─── StorageService 类 ──────────────────────────────────────────────────

class StorageService {
  constructor() {
    this._dataDir = null;
    this._initialized = false;
  }

  /**
   * 获取数据目录
   * 优先级：命令行参数 > 环境变量 > 默认值
   */
  getDataDir() {
    if (this._dataDir) return this._dataDir;

    // 1. 命令行参数 --data-dir
    const args = process.argv;
    const dataDirIndex = args.findIndex(arg => arg === '--data-dir');
    if (dataDirIndex !== -1 && args[dataDirIndex + 1]) {
      this._dataDir = args[dataDirIndex + 1];
    }
    // 2. 环境变量
    else if (process.env.NEO_MOFOX_LAUNCHER_DATA) {
      this._dataDir = process.env.NEO_MOFOX_LAUNCHER_DATA;
    }
    // 3. 默认值
    else {
      this._dataDir = path.join(app.getPath('appData'), 'Neo-MoFox-Launcher');
    }

    return this._dataDir;
  }

  /**
   * 初始化存储服务，确保目录结构存在
   */
  init() {
    if (this._initialized) return;

    const dataDir = this.getDataDir();
    
    // 创建数据目录
    fs.mkdirSync(dataDir, { recursive: true });
    
    // 创建日志目录
    fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true });

    this._initialized = true;
    console.log(`[StorageService] 初始化完成，数据目录: ${dataDir}`);
  }

  // ─── 通用文件操作 ─────────────────────────────────────────────────────

  /**
   * 原子写入文件
   * 先写入 .tmp 文件，然后原子重命名，防止写入中途崩溃导致损坏
   */
  _atomicWriteFile(filePath, content) {
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, filePath);
  }

  /**
   * 安全读取 JSON 文件
   */
  _readJsonFile(filePath, defaultValue = null) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
      }
    } catch (e) {
      console.error(`[StorageService] 读取 JSON 文件失败: ${filePath}`, e);
    }
    return defaultValue;
  }

  /**
   * 安全写入 JSON 文件（原子写入）
   */
  _writeJsonFile(filePath, data) {
    const content = JSON.stringify(data, null, 2);
    this._atomicWriteFile(filePath, content);
  }

  // ─── instances.json 操作 ───────────────────────────────────────────────

  /**
   * 读取实例列表
   */
  readInstances() {
    this.init();
    const instancesPath = path.join(this.getDataDir(), INSTANCES_FILE);
    const defaultData = {
      version: INSTANCES_VERSION,
      instances: [],
    };
    
    const data = this._readJsonFile(instancesPath, defaultData);
    
    // 版本迁移检查
    if (data.version !== INSTANCES_VERSION) {
      return this._migrateInstances(data);
    }
    
    return data;
  }

  /**
   * 获取实例列表（仅返回 instances 数组）
   */
  getInstances() {
    return this.readInstances().instances;
  }

  /**
   * 写入实例列表（全量写入）
   */
  writeInstances(instances) {
    this.init();
    const instancesPath = path.join(this.getDataDir(), INSTANCES_FILE);
    const data = {
      version: INSTANCES_VERSION,
      instances: instances,
    };
    this._writeJsonFile(instancesPath, data);
    return data;
  }

  /**
   * 添加实例
   */
  addInstance(instance) {
    const instances = this.getInstances();
    instances.push(instance);
    this.writeInstances(instances);
    return instance;
  }

  /**
   * 更新实例
   */
  updateInstance(instanceId, updates) {
    const instances = this.getInstances();
    const index = instances.findIndex(i => i.id === instanceId);
    if (index === -1) {
      throw new Error(`实例不存在: ${instanceId}`);
    }
    instances[index] = { ...instances[index], ...updates };
    this.writeInstances(instances);
    return instances[index];
  }

  /**
   * 删除实例
   */
  deleteInstance(instanceId) {
    console.log(`[StorageService] 删除实例: ${instanceId}`);
    const instances = this.getInstances();
    const instance = instances.find(i => i.id === instanceId);
    
    if (!instance) {
      console.warn(`[StorageService] 实例不存在: ${instanceId}`);
      throw new Error(`实例不存在: ${instanceId}`);
    }
    
    // 删除实例文件夹
    if (instance.neomofoxDir) {
      // 从 neomofoxDir 推导实例根目录（父目录）
      // 例如: E:/install/instance_12345/neo-mofox -> E:/install/instance_12345
      const instanceRootDir = path.dirname(instance.neomofoxDir);
      
      if (fs.existsSync(instanceRootDir)) {
        try {
          // 检查根目录下的内容
          const items = fs.readdirSync(instanceRootDir);
          const allowedItems = ['neo-mofox', 'napcat'];
          const extraItems = items.filter(item => !allowedItems.includes(item));
          
          if (extraItems.length > 0) {
            // 如果有其他内容，只删除 neo-mofox 和 napcat 文件夹
            console.log(`[StorageService] 检测到实例根目录包含其他内容: ${extraItems.join(', ')}`);
            console.log(`[StorageService] 仅删除 neo-mofox 和 napcat 文件夹，保留根目录`);
            
            // 删除 neo-mofox
            if (fs.existsSync(instance.neomofoxDir)) {
              fs.rmSync(instance.neomofoxDir, { recursive: true, force: true });
              console.log(`[StorageService] neo-mofox 文件夹删除成功`);
            }
            
            // 删除 napcat（如果存在）
            if (instance.napcatDir && fs.existsSync(instance.napcatDir)) {
              fs.rmSync(instance.napcatDir, { recursive: true, force: true });
              console.log(`[StorageService] napcat 文件夹删除成功`);
            }
          } else {
            // 如果只有 neo-mofox 和/或 napcat，删除整个根目录
            console.log(`[StorageService] 删除实例根目录: ${instanceRootDir}`);
            fs.rmSync(instanceRootDir, { recursive: true, force: true });
            console.log(`[StorageService] 实例根目录删除成功`);
          }
        } catch (e) {
          console.error(`[StorageService] 删除实例文件夹失败:`, e);
          // 即使文件夹删除失败，仍继续删除记录
        }
      }
    }
    
    // 删除实例日志文件夹
    try {
      const logDir = path.join(this.getDataDir(), 'logs', 'instances', instanceId);
      if (fs.existsSync(logDir)) {
        console.log(`[StorageService] 删除实例日志: ${logDir}`);
        fs.rmSync(logDir, { recursive: true, force: true });
        console.log(`[StorageService] 实例日志删除成功`);
      }
    } catch (e) {
      console.error(`[StorageService] 删除实例日志失败:`, e);
      // 即使日志删除失败，仍继续删除记录
    }
    
    // 从记录中删除实例
    const filtered = instances.filter(i => i.id !== instanceId);
    this.writeInstances(filtered);
    console.log(`[StorageService] 实例删除成功，剩余 ${filtered.length} 个实例`);
    return filtered;
  }

  /**
   * 根据 ID 获取实例
   */
  getInstance(instanceId) {
    return this.getInstances().find(i => i.id === instanceId) || null;
  }

  /**
   * 检查是否存在任何实例
   */
  hasInstances() {
    return this.getInstances().length > 0;
  }

  /**
   * 检查是否存在未完成安装的实例
   */
  getIncompleteInstances() {
    return this.getInstances().filter(i => i.installCompleted === false);
  }

  /**
   * 实例数据迁移
   */
  _migrateInstances(oldData) {
    // 当前版本为 1，暂无迁移逻辑
    console.log('[StorageService] 实例数据迁移，旧版本:', oldData.version);
    return {
      version: INSTANCES_VERSION,
      instances: oldData.instances || [],
    };
  }

  // ─── TOML 操作 ─────────────────────────────────────────────────────────

  /**
   * 读取 TOML 文件
   */
  readToml(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    return TOML.parse(content);
  }

  /**
   * 按点分路径写入 TOML 字段
   * @param {string} filePath - TOML 文件路径
   * @param {string} keyPath - 点分路径，如 'permissions.owner_list'
   * @param {*} value - 要写入的值
   */
  writeTomlField(filePath, keyPath, value) {
    // 备份原文件
    const backupPath = filePath + '.bak';
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, backupPath);
    }

    try {
      // 解析 TOML
      const data = this.readToml(filePath);
      
      // 按点分路径设置值
      const keys = keyPath.split('.');
      let current = data;
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        // 处理数组索引，如 api_providers[0]
        const arrayMatch = key.match(/^(.+)\[(\d+)\]$/);
        if (arrayMatch) {
          const arrayKey = arrayMatch[1];
          const index = parseInt(arrayMatch[2], 10);
          if (!current[arrayKey]) current[arrayKey] = [];
          if (!current[arrayKey][index]) current[arrayKey][index] = {};
          current = current[arrayKey][index];
        } else {
          if (!current[key]) current[key] = {};
          current = current[key];
        }
      }
      
      const lastKey = keys[keys.length - 1];
      const lastArrayMatch = lastKey.match(/^(.+)\[(\d+)\]$/);
      if (lastArrayMatch) {
        const arrayKey = lastArrayMatch[1];
        const index = parseInt(lastArrayMatch[2], 10);
        if (!current[arrayKey]) current[arrayKey] = [];
        current[arrayKey][index] = value;
      } else {
        current[lastKey] = value;
      }

      // 写入文件
      const newContent = TOML.stringify(data);
      this._atomicWriteFile(filePath, newContent);

      // 删除备份
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }

      return true;
    } catch (e) {
      // 恢复备份
      if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, filePath);
        fs.unlinkSync(backupPath);
      }
      throw e;
    }
  }

  /**
   * 写入整个 TOML 文件
   */
  writeToml(filePath, data) {
    const backupPath = filePath + '.bak';
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, backupPath);
    }

    try {
      const content = TOML.stringify(data);
      this._atomicWriteFile(filePath, content);
      
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
      return true;
    } catch (e) {
      if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, filePath);
        fs.unlinkSync(backupPath);
      }
      throw e;
    }
  }

  // ─── 日志目录 ──────────────────────────────────────────────────────────

  /**
   * 获取实例日志目录
   */
  getInstanceLogDir(instanceId) {
    const logDir = path.join(this.getDataDir(), 'logs', 'instances', instanceId);
    fs.mkdirSync(logDir, { recursive: true });
    return logDir;
  }

  /**
   * 获取 Launcher 日志目录
   */
  getLauncherLogDir() {
    const logDir = path.join(this.getDataDir(), 'logs', 'launcher');
    fs.mkdirSync(logDir, { recursive: true });
    return logDir;
  }

  /**
   * 获取 Launcher 日志文件路径
   */
  getLauncherLogPath() {
    return path.join(this.getLauncherLogDir(), 'launcher.log');
  }
}

// ─── 导出单例 ────────────────────────────────────────────────────────────

const storageService = new StorageService();

module.exports = { storageService, StorageService };
