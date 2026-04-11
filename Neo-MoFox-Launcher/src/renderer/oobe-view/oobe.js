/**
 * OOBE 步骤管理器
 * 管理 6 个步骤的导航、验证和配置收集
 */

import { renderWelcomeStep } from './steps/welcome.js';
import { renderEnvCheckStep } from './steps/env-check.js';
import { renderInstallPathStep } from './steps/install-path.js';
import { renderThemeStep } from './steps/theme.js';
import { renderPreferencesStep } from './steps/preferences.js';
import { renderFinishStep } from './steps/finish.js';

// ─── DOM 元素引用 ───────────────────────────────────────────────────

const el = {
  stepContainer: document.getElementById('step-container'),
  svgImage: document.getElementById('oobe-svg'),
  progressBar: document.getElementById('progress-bar'),
  progressText: document.getElementById('progress-text'),
  btnPrev: document.getElementById('btn-prev'),
  btnNext: document.getElementById('btn-next'),
  btnSkip: document.getElementById('btn-skip'),
};

// ─── 步骤配置 ──────────────────────────────────────────────────────

const STEPS = [
  {
    id: 'welcome',
    title: '欢迎',
    svg: '../../../assets/oobe/undraw_setup-wizard_wzp9.svg',
    render: renderWelcomeStep,
    validate: null,
    canSkip: false,
  },
  {
    id: 'env-check',
    title: '环境检测',
    svg: '../../../assets/oobe/undraw_download_sa8g.svg',
    render: renderEnvCheckStep,
    validate: async () => {
      if (stepManager.validators['env-check']) {
        return await stepManager.validators['env-check']();
      }
      return true;
    },
    canSkip: false,
  },
  {
    id: 'install-path',
    title: '安装路径',
    svg: '../../../assets/oobe/undraw_preferences_2bda.svg',
    render: renderInstallPathStep,
    validate: async () => {
      if (stepManager.validators['install-path']) {
        return await stepManager.validators['install-path']();
      }
      return true;
    },
    canSkip: false,
  },
  {
    id: 'theme',
    title: '主题设置',
    svg: '../../../assets/oobe/undraw_preferences_2bda.svg',
    render: renderThemeStep,
    validate: null,
    canSkip: true,
  },
  {
    id: 'preferences',
    title: '偏好设置',
    svg: '../../../assets/oobe/undraw_preferences_2bda.svg',
    render: renderPreferencesStep,
    validate: null,
    canSkip: true,
  },
  {
    id: 'finish',
    title: '完成',
    svg: '../../../assets/oobe/undraw_success_288d.svg',
    render: renderFinishStep,
    validate: null,
    canSkip: false,
  },
];

// ─── StepManager 类 ─────────────────────────────────────────────────

class StepManager {
  constructor() {
    this.currentIndex = 0;
    this.config = {}; // 收集的用户配置
    this.validators = {}; // 各步骤验证函数（由步骤模块注入）
    this.stepData = {}; // 各步骤的临时数据
  }

  /**
   * 初始化 OOBE
   */
  async init() {
    console.log('[OOBE] 初始化步骤管理器');
    
    // 绑定按钮事件
    el.btnPrev.addEventListener('click', () => this.prevStep());
    el.btnNext.addEventListener('click', () => this.nextStep());
    el.btnSkip.addEventListener('click', () => this.skipStep());

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
        if (!el.btnNext.disabled) {
          this.nextStep();
        }
      } else if (e.key === 'Escape') {
        const currentStep = STEPS[this.currentIndex];
        if (currentStep.canSkip) {
          this.skipStep();
        }
      }
    });

    // 渲染第一步
    await this.renderCurrentStep();
  }

  /**
   * 渲染当前步骤
   */
  async renderCurrentStep() {
    const step = STEPS[this.currentIndex];
    console.log(`[OOBE] 渲染步骤 ${this.currentIndex + 1}: ${step.title}`);

    // 更新进度
    this.updateProgress();

    // 切换 SVG（带动画）
    await this.changeSVG(step.svg);

    // 渲染步骤内容
    el.stepContainer.innerHTML = '';
    await step.render(el.stepContainer, this);

    // 更新按钮状态
    this.updateButtons();
  }

  /**
   * 更新进度条和文本
   */
  updateProgress() {
    const progress = ((this.currentIndex + 1) / STEPS.length) * 100;
    el.progressBar.style.width = `${progress}%`;
    el.progressText.textContent = `步骤 ${this.currentIndex + 1} / ${STEPS.length}`;
  }

  /**
   * 切换 SVG 插图（带淡入淡出动画）
   */
  async changeSVG(newSrc) {
    if (el.svgImage.src.endsWith(newSrc.split('/').pop())) {
      return; // 相同图片，不切换
    }

    el.svgImage.classList.add('changing');
    await new Promise(resolve => setTimeout(resolve, 300));
    
    el.svgImage.src = newSrc;
    el.svgImage.classList.remove('changing');
  }

  /**
   * 更新按钮显示和状态
   */
  updateButtons() {
    const step = STEPS[this.currentIndex];
    const isFirst = this.currentIndex === 0;
    const isLast = this.currentIndex === STEPS.length - 1;

    // "上一步" 按钮
    el.btnPrev.style.display = isFirst ? 'none' : 'inline-flex';

    // "跳过" 按钮
    el.btnSkip.style.display = step.canSkip ? 'inline-flex' : 'none';

    // "下一步/完成" 按钮
    el.btnNext.querySelector('span:last-child').textContent = isLast ? '开始使用' : '下一步';
    
    // 移除/添加箭头图标
    const arrowIcon = el.btnNext.querySelector('.material-symbols-rounded');
    if (isLast) {
      if (arrowIcon) arrowIcon.remove();
    } else {
      if (!arrowIcon) {
        const icon = document.createElement('span');
        icon.className = 'material-symbols-rounded';
        icon.textContent = 'arrow_forward';
        el.btnNext.appendChild(icon);
      }
    }
  }

  /**
   * 下一步
   */
  async nextStep() {
    const step = STEPS[this.currentIndex];

    // 验证当前步骤
    if (step.validate) {
      el.btnNext.disabled = true;
      const isValid = await step.validate();
      el.btnNext.disabled = false;

      if (!isValid) {
        console.log('[OOBE] 验证失败，阻止前进');
        return;
      }
    }

    // 最后一步：完成 OOBE
    if (this.currentIndex === STEPS.length - 1) {
      await this.completeOOBE();
      return;
    }

    // 前进到下一步
    this.currentIndex++;
    await this.renderCurrentStep();
  }

  /**
   * 上一步
   */
  async prevStep() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      await this.renderCurrentStep();
    }
  }

  /**
   * 跳过当前步骤（使用默认值）
   */
  async skipStep() {
    const step = STEPS[this.currentIndex];
    
    if (!step.canSkip) {
      console.warn('[OOBE] 当前步骤不可跳过');
      return;
    }

    console.log(`[OOBE] 跳过步骤: ${step.title}`);
    
    // 使用默认值（各步骤模块应提供 getDefaultConfig 方法）
    // 这里简单处理，实际可由各步骤模块提供
    
    this.currentIndex++;
    await this.renderCurrentStep();
  }

  /**
   * 完成 OOBE
   */
  async completeOOBE() {
    console.log('[OOBE] 保存配置并完成...', this.config);

    // 标记 OOBE 已完成
    this.config.oobeCompleted = true;

    // 保存配置
    try {
      await window.mofoxAPI.settingsWrite(this.config);
      console.log('[OOBE] 配置已保存');

      // 通知主进程重新加载主窗口到主界面
      await window.mofoxAPI.oobeComplete();
      console.log('[OOBE] 已通知主进程切换到主界面');
    } catch (error) {
      console.error('[OOBE] 保存配置或切换界面失败:', error);
      alert('保存配置失败，请重试');
    }
  }

  /**
   * 设置验证函数
   */
  setValidator(stepId, validatorFn) {
    this.validators[stepId] = validatorFn;
  }
}

// ─── 导出单例并初始化 ─────────────────────────────────────────────

export const stepManager = new StepManager();

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  stepManager.init();
});
