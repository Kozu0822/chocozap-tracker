// ChocoZAP Pro - Local Workout Tracker Logic

// ==========================================================================
// 1. 初始化状态与本地存储 (Data Initialization)
// ==========================================================================
let state = {
  workouts: [],
  // 已删除记录的墓碑表 { workoutId: 删除时间戳 }，用于云同步时防止被删记录从云端"复活"
  deletedIds: {},
  settings: {
    weight: 70,
    apiKey: '',
    apiModel: 'gemini-2.5-flash'
  },
  // AI 多会话聊天记录：[{ id, title, updatedAt, messages: [{role,name,text,time}] }]
  chatSessions: [],
  activeChatSessionId: null,
  // AI 生成的训练推荐，展示在首页"Gemini的推荐"模块
  aiRecommendations: []
};

// ChocoZAP 门店实际可用的器材清单，用于约束 AI 只推荐这些器材范围内的动作
const EQUIPMENT_ROSTER = [
  { type: "leg_press", label: "腿举 (Leg Press)", note: "力量训练，练下肢" },
  { type: "shoulder_press", label: "肩推 (Shoulder Press)", note: "力量训练，练肩部" },
  { type: "chest_press", label: "胸推 (Chest Press)", note: "力量训练，练胸部" },
  { type: "preacher_curl", label: "牧师椅 (Preacher Curl)", note: "力量训练，练肱二头肌" },
  { type: "lat_pulldown", label: "高位下拉 (Lat Pulldown)", note: "力量训练，练背部" },
  { type: "situps", label: "仰卧起坐 (Sit-ups)", note: "核心训练" },
  { type: "spin_bike", label: "动感单车 (Spin Bike)", note: "有氧训练" },
  { type: "treadmill", label: "跑步机 (Treadmill)", note: "有氧训练" },
  { type: "massage_chair", label: "按摩椅 (Massage Chair)", note: "拉伸放松，非力量/有氧训练" }
];

// ChocoZAP 力量器械配重片的最小调整单位 (kg)，不支持 2.5kg 这种半档
const WEIGHT_STEP_KG = 5;

// 把重量取整到最近的 step 的整数倍 (用于兜底 AI 给出不合法的重量数值，如 2.5kg 的半档)
function roundToNearestStep(value, step) {
  const num = parseFloat(value) || 0;
  return Math.max(0, Math.round(num / step) * step);
}

// 每种类型打卡记录所需的必填字段，用于校验 AI 结构化训练推荐数据是否可直接落地为打卡记录
const WORKOUT_REQUIRED_FIELDS = {
  leg_press: ['weight', 'reps', 'sets'],
  shoulder_press: ['weight', 'reps', 'sets'],
  chest_press: ['weight', 'reps', 'sets'],
  preacher_curl: ['weight', 'reps', 'sets'],
  lat_pulldown: ['weight', 'reps', 'sets'],
  situps: ['reps', 'sets'],
  spin_bike: ['resistance', 'time'],
  treadmill: ['mode', 'speed', 'incline', 'time'],
  massage_chair: ['mode', 'duration', 'intensity']
};

// 预设 Mock 数据以便第一次打开时拥有绝佳的视觉体验 (若 LocalStorage 为空)
const initialMockWorkouts = [
  {
    id: "mock-1",
    date: getPastDateString(6),
    type: "treadmill",
    details: { mode: "walk", speed: 5.5, incline: 4, time: 25, distance: 2.29, calories: 155 },
    notes: "热身快走"
  },
  {
    id: "mock-2",
    date: getPastDateString(5),
    type: "leg_press",
    details: { weight: 50, reps: 12, sets: 3 },
    notes: "腿举第2台机器"
  },
  {
    id: "mock-3",
    date: getPastDateString(5),
    type: "shoulder_press",
    details: { weight: 20, reps: 10, sets: 3 },
    notes: "感觉右肩稍沉"
  },
  {
    id: "mock-4",
    date: getPastDateString(4),
    type: "spin_bike",
    details: { resistance: 8, time: 20 },
    notes: "阻力偏轻"
  },
  {
    id: "mock-5",
    date: getPastDateString(3),
    type: "chest_press",
    details: { weight: 30, reps: 12, sets: 3 },
    notes: "胸推，状态良好"
  },
  {
    id: "mock-6",
    date: getPastDateString(3),
    type: "massage_chair",
    details: { mode: "自动舒缓", duration: 30, intensity: 2 },
    notes: "全身酸痛按摩"
  },
  {
    id: "mock-7",
    date: getPastDateString(1),
    type: "leg_press",
    details: { weight: 60, reps: 10, sets: 4 },
    notes: "加重量了，小腿有点酸"
  },
  {
    id: "mock-8",
    date: getPastDateString(1),
    type: "situps",
    details: { reps: 20, sets: 3 },
    notes: "腰腹练习"
  },
  {
    id: "mock-9",
    date: getPastDateString(0), // 今天
    type: "treadmill",
    details: { mode: "run", speed: 8.5, incline: 2, time: 30, distance: 4.25, calories: 310 },
    notes: "今天跑得很爽，浑身湿透"
  }
];

// 初始化加载
document.addEventListener("DOMContentLoaded", () => {
  refreshHeaderDate();
  syncThemeToggleIcon();

  loadData();
  setupEventListeners();

  // 渲染各项页面数据
  updateStats();
  renderHistory();
  renderAiRecommendations();
  renderChatSessionMessages();
  renderChatHistoryList();

  // 默认启动估算值计算
  updateCalorieEstimate();

  // 如果配置了 GitHub Token，开机进行一次静默云同步，拉取最新记录
  if (state.settings.githubToken) {
    syncWithGithub(true);
  }
});

// 刷新顶部日期展示 (页签切换时也会调用，保证 PWA 长期驻留后台跨天后日期依然正确)
function refreshHeaderDate() {
  const d = new Date();
  const dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  document.getElementById("current-date").textContent = dateStr;
}

// ==========================================================================
// 日间/夜间模式切换 (Theme Toggle)
// 注意：实际主题在 <head> 内联脚本中已提前设好 data-theme 属性以避免首次渲染闪烁，
// 这里只需要在 DOM 就绪后把切换按钮的图标同步成当前主题
// ==========================================================================
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("chocozap_theme", next);
  syncThemeToggleIcon();
  // 主题切换后折线图颜色跟随 CSS 变量重绘一次即可，坐标本身不受影响
}

function syncThemeToggleIcon() {
  const btn = document.getElementById("theme-toggle-btn");
  if (!btn) return;
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  btn.textContent = current === "light" ? "☀️" : "🌙";
}

// 从 LocalStorage 加载数据
function loadData() {
  const hasRunBefore = localStorage.getItem("chocozap_has_run_before");
  const storedWorkouts = localStorage.getItem("chocozap_workouts");
  const storedSettings = localStorage.getItem("chocozap_settings");

  // 加载已删除记录的墓碑表
  try {
    state.deletedIds = JSON.parse(localStorage.getItem("chocozap_deleted") || "{}") || {};
  } catch (e) {
    state.deletedIds = {};
  }

  // 加载 AI 训练推荐列表
  try {
    state.aiRecommendations = JSON.parse(localStorage.getItem("chocozap_ai_recommendations") || "[]") || [];
  } catch (e) {
    state.aiRecommendations = [];
  }

  // 加载 AI 多会话聊天记录
  try {
    state.chatSessions = JSON.parse(localStorage.getItem("chocozap_chat_sessions") || "[]") || [];
  } catch (e) {
    state.chatSessions = [];
  }
  state.activeChatSessionId = localStorage.getItem("chocozap_active_chat_session") || null;
  if (!state.chatSessions.some(s => s.id === state.activeChatSessionId)) {
    state.activeChatSessionId = state.chatSessions.length > 0 ? state.chatSessions[0].id : null;
  }

  if (!hasRunBefore) {
    // 首次打开：加载预设 mock 数据并初始化设置，打上 has_run_before 标记
    state.workouts = initialMockWorkouts;
    state.settings = {
      weight: 70,
      apiKey: '',
      apiModel: 'gemini-2.5-flash',
      githubToken: '',
      githubGistId: ''
    };
    localStorage.setItem("chocozap_workouts", JSON.stringify(state.workouts));
    localStorage.setItem("chocozap_settings", JSON.stringify(state.settings));
    localStorage.setItem("chocozap_has_run_before", "true");
  } else {
    // 非首次打开：直接读取已存储的数据 (如果 workouts 被删除了则默认空数组，防止重置后重新加载 mock)
    state.workouts = storedWorkouts ? JSON.parse(storedWorkouts) : [];
    
    if (storedSettings) {
      state.settings = JSON.parse(storedSettings);
    } else {
      state.settings = {
        weight: 70,
        apiKey: '',
        apiModel: 'gemini-2.5-flash',
        githubToken: '',
        githubGistId: ''
      };
      localStorage.setItem("chocozap_settings", JSON.stringify(state.settings));
    }
  }
  
  // 将设置数据反映到 UI 控件中
  document.getElementById("setting-weight").value = state.settings.weight;
  document.getElementById("setting-api-key").value = state.settings.apiKey || "";
  document.getElementById("setting-api-model").value = state.settings.apiModel || 'gemini-2.5-flash';
  document.getElementById("setting-github-token").value = state.settings.githubToken || "";
  document.getElementById("setting-github-gist-id").value = state.settings.githubGistId || "";

  // 更新云同步配置状态文本
  const syncStatus = document.getElementById("github-sync-status");
  if (syncStatus) {
    if (state.settings.githubToken && state.settings.githubGistId) {
      syncStatus.textContent = "已关联云端存储";
      syncStatus.style.color = "var(--neon-blue)";
    } else if (state.settings.githubToken) {
      syncStatus.textContent = "已配置Token，待首次同步";
      syncStatus.style.color = "var(--text-secondary)";
    } else {
      syncStatus.textContent = "未配置同步";
      syncStatus.style.color = "var(--text-secondary)";
    }
  }
}

// 辅助函数：生成本地时区的 YYYY-MM-DD 字符串
// 注意：不能用 toISOString()，它返回的是 UTC 日期。对于东八/九区用户，
// 本地凌晨到早上 8-9 点之间 UTC 日期还停留在"昨天"，会导致打卡日期错一天
function getLocalDateString(d = new Date()) {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

// 辅助函数：把 YYYY-MM-DD 按本地时区解析为 Date
// (new Date("YYYY-MM-DD") 会按 UTC 零点解析，在西半球时区会偏移到前一天)
function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 辅助函数：生成过去某一天的 YYYY-MM-DD 字符串
function getPastDateString(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return getLocalDateString(d);
}

// ==========================================================================
// 2. 交互逻辑与事件绑定 (UI Interactions & Events)
// ==========================================================================
function setupEventListeners() {
  // 运动项目选择器（Pill 选择）
  const pills = document.querySelectorAll(".exercise-pill");
  pills.forEach(pill => {
    pill.addEventListener("click", () => {
      pills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      
      const type = pill.getAttribute("data-type");
      setupFormForType(type);
    });
  });
}

// 标签栏切换 (Tab Switch)
function switchTab(tabName) {
  // 移除所有导航项和视图的激活状态
  document.querySelectorAll(".nav-item").forEach(item => {
    item.classList.remove("active");
  });
  document.querySelectorAll(".app-view").forEach(view => {
    view.classList.remove("active");
  });
  
  // 激活对应的导航和视图
  const activeNavItem = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
  if (activeNavItem) activeNavItem.classList.add("active");
  
  const activeView = document.getElementById(`view-${tabName}`);
  if (activeView) activeView.classList.add("active");

  refreshHeaderDate();

  // 重新渲染相关的数据/折线图 (有些界面需要动态重画)
  if (tabName === 'dashboard') {
    updateStats();
  } else if (tabName === 'history') {
    renderHistory();
  }
}

// 快捷方式直接跳转并选择项目
function startQuickLog(type) {
  switchTab('log');
  const targetPill = document.querySelector(`.exercise-pill[data-type="${type}"]`);
  if (targetPill) {
    targetPill.click();
  }
}

// 步进器调整数值 (Stepper Value Adjust)
function adjustValue(inputId, delta) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  let val = parseFloat(input.value) || 0;
  val += delta;
  
  // 约束最大最小值
  const min = input.getAttribute("min");
  const max = input.getAttribute("max");
  if (min !== null && val < parseFloat(min)) val = parseFloat(min);
  if (max !== null && val > parseFloat(max)) val = parseFloat(max);
  
  // 判断是否有小数决定格式化
  const step = input.getAttribute("step");
  if (step && step.includes(".")) {
    input.value = val.toFixed(1);
  } else {
    input.value = Math.round(val);
  }
  
  // 手动触发 change 事件以便更新估计数值
  const event = new Event('change');
  input.dispatchEvent(event);
}

// 预设值快速设定 (Preset Settings)
function setPreset(inputId, value) {
  const input = document.getElementById(inputId);
  if (input) {
    input.value = value;
    const event = new Event('change');
    input.dispatchEvent(event);
  }
}

// 连动更新 Slider 标识文字
function updateSliderVal(badgeId, value) {
  const badge = document.getElementById(badgeId);
  if (badge) {
    badge.textContent = parseFloat(value).toFixed(1).replace(".0", "");
  }
}

// 根据运动类型动态控制表单的渲染
function setupFormForType(type) {
  // 隐藏所有特定表单组
  document.querySelectorAll(".form-group-set").forEach(group => {
    group.style.display = "none";
  });
  
  // 显示表单容器，隐藏默认提示
  document.getElementById("form-container").style.display = "block";
  document.getElementById("form-placeholder").style.display = "none";
  
  document.getElementById("input-exercise-type").value = type;

  // 初始化打卡日期选择器：默认今天，且不允许选择未来日期 (支持补记过去漏打的卡)
  const dateInput = document.getElementById("input-workout-date");
  if (dateInput) {
    const today = getLocalDateString();
    dateInput.value = today;
    dateInput.max = today;
  }

  const formTitle = document.getElementById("form-title");
  const formBadge = document.getElementById("form-badge-type");
  
  // 基于最后一次该项目的健身记录设定默认参数，提供极其丝滑的体验
  const lastWorkout = state.workouts
    .filter(w => w.type === type)
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  
  switch(type) {
    case 'leg_press':
      formTitle.textContent = "腿举 (Leg Press)";
      formBadge.textContent = "力量训练";
      document.getElementById("group-strength").style.display = "block";
      if (lastWorkout && lastWorkout.details) {
        document.getElementById("input-weight").value = lastWorkout.details.weight;
        document.getElementById("input-reps").value = lastWorkout.details.reps;
        document.getElementById("input-sets").value = lastWorkout.details.sets;
        document.getElementById("input-extra-reps").value = lastWorkout.details.extraReps || "";
      } else {
        document.getElementById("input-weight").value = 50;
        document.getElementById("input-reps").value = 12;
        document.getElementById("input-sets").value = 3;
        document.getElementById("input-extra-reps").value = "";
      }
      break;

    case 'shoulder_press':
      formTitle.textContent = "肩推 (Shoulder Press)";
      formBadge.textContent = "力量训练";
      document.getElementById("group-strength").style.display = "block";
      if (lastWorkout && lastWorkout.details) {
        document.getElementById("input-weight").value = lastWorkout.details.weight;
        document.getElementById("input-reps").value = lastWorkout.details.reps;
        document.getElementById("input-sets").value = lastWorkout.details.sets;
        document.getElementById("input-extra-reps").value = lastWorkout.details.extraReps || "";
      } else {
        document.getElementById("input-weight").value = 20;
        document.getElementById("input-reps").value = 10;
        document.getElementById("input-sets").value = 3;
        document.getElementById("input-extra-reps").value = "";
      }
      break;

    case 'chest_press':
      formTitle.textContent = "胸推 (Chest Press)";
      formBadge.textContent = "力量训练";
      document.getElementById("group-strength").style.display = "block";
      if (lastWorkout && lastWorkout.details) {
        document.getElementById("input-weight").value = lastWorkout.details.weight;
        document.getElementById("input-reps").value = lastWorkout.details.reps;
        document.getElementById("input-sets").value = lastWorkout.details.sets;
        document.getElementById("input-extra-reps").value = lastWorkout.details.extraReps || "";
      } else {
        document.getElementById("input-weight").value = 30;
        document.getElementById("input-reps").value = 12;
        document.getElementById("input-sets").value = 3;
        document.getElementById("input-extra-reps").value = "";
      }
      break;

    case 'preacher_curl':
      formTitle.textContent = "牧师椅 (Preacher Curl)";
      formBadge.textContent = "力量训练";
      document.getElementById("group-strength").style.display = "block";
      if (lastWorkout && lastWorkout.details) {
        document.getElementById("input-weight").value = lastWorkout.details.weight;
        document.getElementById("input-reps").value = lastWorkout.details.reps;
        document.getElementById("input-sets").value = lastWorkout.details.sets;
        document.getElementById("input-extra-reps").value = lastWorkout.details.extraReps || "";
      } else {
        document.getElementById("input-weight").value = 15;
        document.getElementById("input-reps").value = 12;
        document.getElementById("input-sets").value = 3;
        document.getElementById("input-extra-reps").value = "";
      }
      break;

    case 'lat_pulldown':
      formTitle.textContent = "高位下拉 (Lat Pulldown)";
      formBadge.textContent = "力量训练";
      document.getElementById("group-strength").style.display = "block";
      if (lastWorkout && lastWorkout.details) {
        document.getElementById("input-weight").value = lastWorkout.details.weight;
        document.getElementById("input-reps").value = lastWorkout.details.reps;
        document.getElementById("input-sets").value = lastWorkout.details.sets;
        document.getElementById("input-extra-reps").value = lastWorkout.details.extraReps || "";
      } else {
        document.getElementById("input-weight").value = 35;
        document.getElementById("input-reps").value = 12;
        document.getElementById("input-sets").value = 3;
        document.getElementById("input-extra-reps").value = "";
      }
      break;

    case 'situps':
      formTitle.textContent = "仰卧起坐 (Sit-ups)";
      formBadge.textContent = "腰腹核心";
      document.getElementById("group-situps").style.display = "block";
      if (lastWorkout && lastWorkout.details) {
        document.getElementById("input-situps-reps").value = lastWorkout.details.reps;
        document.getElementById("input-situps-sets").value = lastWorkout.details.sets;
        document.getElementById("input-situps-extra-reps").value = lastWorkout.details.extraReps || "";
      } else {
        document.getElementById("input-situps-reps").value = 15;
        document.getElementById("input-situps-sets").value = 3;
        document.getElementById("input-situps-extra-reps").value = "";
      }
      break;
      
    case 'spin_bike':
      formTitle.textContent = "动感单车 (Spin Bike)";
      formBadge.textContent = "有氧燃脂";
      document.getElementById("group-spin-bike").style.display = "block";
      if (lastWorkout && lastWorkout.details) {
        document.getElementById("input-bike-resistance").value = lastWorkout.details.resistance;
        document.getElementById("input-bike-time").value = lastWorkout.details.time;
      } else {
        document.getElementById("input-bike-resistance").value = 8;
        document.getElementById("input-bike-time").value = 20;
      }
      break;
      
    case 'treadmill':
      formTitle.textContent = "跑步机 (Treadmill)";
      formBadge.textContent = "有氧训练";
      document.getElementById("group-treadmill").style.display = "block";
      if (lastWorkout && lastWorkout.details) {
        const mode = lastWorkout.details.mode || "walk";
        document.querySelector(`input[name="treadmill-mode"][value="${mode}"]`).checked = true;
        document.getElementById("input-treadmill-speed").value = lastWorkout.details.speed;
        updateSliderVal('treadmill-speed-val', lastWorkout.details.speed);
        document.getElementById("input-treadmill-incline").value = lastWorkout.details.incline;
        updateSliderVal('treadmill-incline-val', lastWorkout.details.incline);
        document.getElementById("input-treadmill-time").value = lastWorkout.details.time;
      } else {
        document.querySelector(`input[name="treadmill-mode"][value="walk"]`).checked = true;
        document.getElementById("input-treadmill-speed").value = 6.0;
        updateSliderVal('treadmill-speed-val', 6.0);
        document.getElementById("input-treadmill-incline").value = 3;
        updateSliderVal('treadmill-incline-val', 3);
        document.getElementById("input-treadmill-time").value = 30;
      }
      updateCalorieEstimate();
      break;
      
    case 'massage_chair':
      formTitle.textContent = "按摩椅 (Massage Chair)";
      formBadge.textContent = "拉伸放松";
      document.getElementById("group-massage-chair").style.display = "block";
      if (lastWorkout && lastWorkout.details) {
        document.getElementById("input-massage-mode").value = lastWorkout.details.mode;
        document.getElementById("input-massage-duration").value = lastWorkout.details.duration;
        document.querySelector(`input[name="massage-intensity"][value="${lastWorkout.details.intensity}"]`).checked = true;
      } else {
        document.getElementById("input-massage-mode").value = "自动舒缓";
        document.getElementById("input-massage-duration").value = "30";
        document.querySelector(`input[name="massage-intensity"][value="2"]`).checked = true;
      }
      break;
      
    case 'custom':
      formTitle.textContent = "自定义项目 (Custom)";
      formBadge.textContent = "其他";
      document.getElementById("group-custom").style.display = "block";
      document.getElementById("input-custom-name").value = "";
      document.getElementById("input-custom-value").value = "";
      document.getElementById("input-custom-sets").value = "";
      break;
  }
}

// ==========================================================================
// 3. 卡路里与有氧指标计算算法 (Calorie Algorithm)
// ==========================================================================
function updateCalorieEstimate() {
  const isTreadmillVisible = document.getElementById("group-treadmill").style.display === "block";
  if (!isTreadmillVisible) return;

  const mode = document.querySelector('input[name="treadmill-mode"]:checked').value; // 'walk' or 'run'
  const speed = parseFloat(document.getElementById("input-treadmill-speed").value) || 0; // km/h
  const incline = parseFloat(document.getElementById("input-treadmill-incline").value) || 0; // %
  const time = parseFloat(document.getElementById("input-treadmill-time").value) || 0; // min

  const est = computeTreadmillEstimate(mode, speed, incline, time);
  document.getElementById("est-distance").innerHTML = `${est.distance.toFixed(2)} <small>km</small>`;
  document.getElementById("est-calories").innerHTML = `${est.calories} <small>kcal</small>`;

  return { distance: parseFloat(est.distance.toFixed(2)), calories: est.calories };
}

// 纯函数版跑步机估算 (不依赖 DOM)，供表单实时预览和 AI 推荐一键打卡复用，保证两处口径一致
function computeTreadmillEstimate(mode, speed, incline, time) {
  // 1. 距离计算: Speed(km/h) * Time(min) / 60
  const distance = speed * (time / 60);

  // 2. 卡路里计算采用 ACSM（美国运动医学学会）公式：
  // 速度转化：1 km/h = 16.667 米/分钟
  const speedMetersPerMin = speed * 16.667;
  const gradeFraction = incline / 100;

  let met = 3.5; // 基础代谢 1 MET = 3.5 ml/kg/min VO2

  if (mode === "walk" || speed < 6.0) {
    // 步行公式: VO2 = 0.1 * speed + 1.8 * speed * grade + 3.5
    const vo2 = 0.1 * speedMetersPerMin + 1.8 * speedMetersPerMin * gradeFraction + 3.5;
    met = vo2 / 3.5;
  } else {
    // 跑步公式: VO2 = 0.2 * speed + 0.9 * speed * grade + 3.5
    const vo2 = 0.2 * speedMetersPerMin + 0.9 * speedMetersPerMin * gradeFraction + 3.5;
    met = vo2 / 3.5;
  }

  // 安全限制合理范围
  if (met < 2.0) met = 2.0;
  if (met > 18.0) met = 18.0;

  // 用户身体重量
  const weight = state.settings.weight || 70;

  // 消耗卡路里公式: kcal = (MET * 3.5 * weight * time) / 200
  const calories = Math.round((met * 3.5 * weight * time) / 200);

  return { distance: parseFloat(distance.toFixed(2)), calories };
}

// ==========================================================================
// 4. 保存运动记录 (Save Log)
// ==========================================================================
function saveWorkout(event) {
  event.preventDefault();
  
  const type = document.getElementById("input-exercise-type").value;
  if (!type) return;
  
  const notes = document.getElementById("input-notes").value.trim();

  // 打卡日期：优先取用户在日期选择器中选定的日期 (支持补记)，默认为本地时区的今天
  const dateToday = getLocalDateString();
  const dateInput = document.getElementById("input-workout-date");
  let workoutDate = (dateInput && dateInput.value) ? dateInput.value : dateToday;
  if (workoutDate > dateToday) workoutDate = dateToday; // 禁止未来日期
  
  let details = {};
  
  // 提取对应表单参数
  if (['leg_press', 'shoulder_press', 'chest_press', 'preacher_curl', 'lat_pulldown'].includes(type)) {
    details = {
      weight: parseFloat(document.getElementById("input-weight").value) || 0,
      reps: parseInt(document.getElementById("input-reps").value) || 0,
      sets: parseInt(document.getElementById("input-sets").value) || 0,
      // 组外次数：正式组数之外，力竭/额外加练的次数，可选
      extraReps: parseInt(document.getElementById("input-extra-reps").value) || 0
    };
  } else if (type === 'situps') {
    details = {
      reps: parseInt(document.getElementById("input-situps-reps").value) || 0,
      sets: parseInt(document.getElementById("input-situps-sets").value) || 0,
      extraReps: parseInt(document.getElementById("input-situps-extra-reps").value) || 0
    };
  } else if (type === 'spin_bike') {
    details = {
      resistance: parseInt(document.getElementById("input-bike-resistance").value) || 0,
      time: parseInt(document.getElementById("input-bike-time").value) || 0
    };
  } else if (type === 'treadmill') {
    const est = updateCalorieEstimate();
    details = {
      mode: document.querySelector('input[name="treadmill-mode"]:checked').value,
      speed: parseFloat(document.getElementById("input-treadmill-speed").value) || 0,
      incline: parseFloat(document.getElementById("input-treadmill-incline").value) || 0,
      time: parseInt(document.getElementById("input-treadmill-time").value) || 0,
      distance: est.distance,
      calories: est.calories
    };
  } else if (type === 'massage_chair') {
    details = {
      mode: document.getElementById("input-massage-mode").value,
      duration: parseInt(document.getElementById("input-massage-duration").value) || 0,
      intensity: parseInt(document.querySelector('input[name="massage-intensity"]:checked').value) || 2
    };
  } else if (type === 'custom') {
    const customName = document.getElementById("input-custom-name").value.trim();
    if (!customName) {
      alert("请输入自定义项目的运动名称！");
      return;
    }
    details = {
      name: customName,
      value: document.getElementById("input-custom-value").value.trim(),
      sets: parseInt(document.getElementById("input-custom-sets").value) || null
    };
  }
  
  // 构建单条 Workout 对象 (id 附加随机后缀，避免同一毫秒内连续打卡产生重复 id)
  const newWorkout = {
    id: "workout-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    date: workoutDate,
    type: type,
    details: details,
    notes: notes
  };
  
  // 插入到记录库最前端并存储
  state.workouts.unshift(newWorkout);
  localStorage.setItem("chocozap_workouts", JSON.stringify(state.workouts));
  
  // 重置表单备注
  document.getElementById("input-notes").value = "";
  
  // 提示打卡成功 (iOS 震动微动效)
  const submitBtn = document.querySelector(".btn-submit-workout");
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = "🎉 打卡成功！";
  submitBtn.style.background = "linear-gradient(135deg, #39ff14, #00f0ff)";
  
  // 如果配置了 GitHub Token，进行一次静默云同步，把新记录推上云端
  if (state.settings.githubToken) {
    syncWithGithub(true);
  }

  setTimeout(() => {
    submitBtn.innerHTML = originalText;
    submitBtn.style.background = "";
    // 跳转至历史页签
    switchTab('history');
  }, 1200);
}

// 删除某条打卡记录
function deleteWorkout(id) {
  if (confirm("确定要删除这条打卡记录吗？此操作无法撤销。")) {
    state.workouts = state.workouts.filter(w => w.id !== id);
    // 写入墓碑：云同步合并时据此排除该记录，防止删除后被云端数据"复活"
    state.deletedIds[id] = Date.now();
    localStorage.setItem("chocozap_workouts", JSON.stringify(state.workouts));
    localStorage.setItem("chocozap_deleted", JSON.stringify(state.deletedIds));
    renderHistory();
    updateStats();
    
    // 如果配置了 GitHub Token，进行静默云同步，同步删除操作到云端
    if (state.settings.githubToken) {
      syncWithGithub(true);
    }
  }
}

// ==========================================================================
// 5. 统计与仪表盘数据展示 (Dashboard & Streak)
// ==========================================================================
function updateStats() {
  const workouts = state.workouts;
  
  // A. 累计打卡次数
  document.getElementById("stat-total-days").textContent = workouts.length;
  
  // B. 连续打卡天数 (Streak 算法)
  // 获取所有独立发生锻炼的日期
  const workoutDates = [...new Set(workouts.map(w => w.date))].sort((a, b) => new Date(b) - new Date(a));
  
  let streak = 0;
  const todayStr = getLocalDateString();
  const yesterdayStr = getPastDateString(1);

  if (workoutDates.length > 0) {
    const newestDate = workoutDates[0];

    // 如果最新打卡日期既不是今天也不是昨天，说明连续已经断了
    if (newestDate === todayStr || newestDate === yesterdayStr) {
      streak = 1;
      let checkDate = parseLocalDate(newestDate);

      for (let i = 1; i < workoutDates.length; i++) {
        // 前一天
        checkDate.setDate(checkDate.getDate() - 1);
        const expectedDateStr = getLocalDateString(checkDate);
        
        if (workoutDates[i] === expectedDateStr) {
          streak++;
        } else {
          break; // 不连续了，停止
        }
      }
    }
  }
  document.getElementById("stat-streak").innerHTML = `${streak} <small>天</small>`;
  
  // C. 今日完成目标环形进度
  // 设定每日运动打卡的目标（例如 3 项运动）
  const targetCount = 3;
  const todayWorkouts = workouts.filter(w => w.date === todayStr);
  const todayCount = todayWorkouts.length;
  
  document.getElementById("today-summary").textContent = `今天已打卡 ${todayCount} 项运动`;
  
  const percentage = Math.min(Math.round((todayCount / targetCount) * 100), 100);
  document.getElementById("progress-percentage").textContent = `${percentage}%`;
  
  // 环形动画计算 (半径 40, 周长 2 * PI * 40 = 251.2)
  const ring = document.querySelector(".progress-ring-bar");
  if (ring) {
    const strokeOffset = 251.2 - (percentage / 100) * 251.2;
    ring.style.strokeDashoffset = strokeOffset;
  }
  
  // D. 本周运动折线图绘制
  drawWeeklyChart();

  // E. 力量/有氧趋势分析
  renderTrendAnalysis();
}

// 力量训练 vs 有氧训练的类型分类，供趋势分析和统计使用
const STRENGTH_TYPES = ['leg_press', 'shoulder_press', 'chest_press', 'preacher_curl', 'lat_pulldown', 'situps'];
const CARDIO_TYPES = ['treadmill', 'spin_bike'];

// 趋势分析模块：最近30天力量/有氧/其他占比 + 最近4周力量容量与有氧时长趋势
function renderTrendAnalysis() {
  const proportionBar = document.getElementById("trend-proportion-bar");
  if (!proportionBar) return; // 页面还未加入该模块时直接跳过

  const today = new Date();

  // A. 近 30 天 力量/有氧/其他 占比
  const cutoff30 = new Date(today);
  cutoff30.setDate(cutoff30.getDate() - 29);
  const cutoff30Str = getLocalDateString(cutoff30);

  let strengthCount = 0, cardioCount = 0, otherCount = 0;
  state.workouts.forEach(w => {
    if (w.date < cutoff30Str) return;
    if (STRENGTH_TYPES.includes(w.type)) strengthCount++;
    else if (CARDIO_TYPES.includes(w.type)) cardioCount++;
    else otherCount++;
  });
  const total = strengthCount + cardioCount + otherCount;

  const strengthPct = total > 0 ? Math.round((strengthCount / total) * 100) : 0;
  const cardioPct = total > 0 ? Math.round((cardioCount / total) * 100) : 0;
  const otherPct = total > 0 ? 100 - strengthPct - cardioPct : 0;

  if (total === 0) {
    proportionBar.innerHTML = `<div class="trend-bar-segment trend-bar-empty" style="width:100%"></div>`;
  } else {
    proportionBar.innerHTML = `
      <div class="trend-bar-segment trend-bar-strength" style="width:${strengthPct}%" title="力量+核心 ${strengthCount}次"></div>
      <div class="trend-bar-segment trend-bar-cardio" style="width:${cardioPct}%" title="有氧 ${cardioCount}次"></div>
      <div class="trend-bar-segment trend-bar-other" style="width:${otherPct}%" title="其他 ${otherCount}次"></div>
    `;
  }
  document.getElementById("trend-legend-strength").textContent = `力量 ${strengthCount}次 (${strengthPct}%)`;
  document.getElementById("trend-legend-cardio").textContent = `有氧 ${cardioCount}次 (${cardioPct}%)`;
  document.getElementById("trend-legend-other").textContent = `其他 ${otherCount}次 (${otherPct}%)`;

  // B. 近 4 周 力量训练容量 (Σ weight×reps×sets) 与 有氧时长 (分钟) 趋势
  // weekBuckets[3] 是本周（含今天往前推 6 天），weekBuckets[0] 是最早的一周
  const weekVolume = [0, 0, 0, 0];
  const weekCardioMinutes = [0, 0, 0, 0];

  state.workouts.forEach(w => {
    const d = parseLocalDate(w.date);
    const diffDays = Math.floor((today - d) / 86400000);
    if (diffDays < 0 || diffDays >= 28) return;
    const weekIdx = 3 - Math.floor(diffDays / 7);

    if (STRENGTH_TYPES.includes(w.type) && w.details && w.details.weight) {
      weekVolume[weekIdx] += (w.details.weight || 0) * (w.details.reps || 0) * (w.details.sets || 0);
    }
    if (w.type === 'treadmill' || w.type === 'spin_bike') {
      weekCardioMinutes[weekIdx] += (w.details.time || 0);
    }
  });

  renderTrendMiniBars("trend-volume-bars", weekVolume, "kg");
  renderTrendMiniBars("trend-cardio-bars", weekCardioMinutes, "分钟");
}

// 绘制 4 周迷你柱状趋势图 (纯 DOM/CSS，不用 SVG，轻量实现)
function renderTrendMiniBars(containerId, values, unit) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const maxVal = Math.max(...values, 1);
  const weekLabels = ["3周前", "2周前", "上周", "本周"];

  container.innerHTML = values.map((val, idx) => {
    const heightPct = Math.max(Math.round((val / maxVal) * 100), val > 0 ? 6 : 2);
    const isCurrent = idx === values.length - 1;
    return `
      <div class="trend-mini-bar-col">
        <span class="trend-mini-bar-value">${val > 0 ? Math.round(val) : ''}</span>
        <div class="trend-mini-bar-track">
          <div class="trend-mini-bar-fill ${isCurrent ? 'trend-mini-bar-current' : ''}" style="height:${heightPct}%"></div>
        </div>
        <span class="trend-mini-bar-label">${weekLabels[idx]}</span>
      </div>
    `;
  }).join('');
}

// 原生绘制发光的 SVG 趋势折线图
function drawWeeklyChart() {
  const container = document.getElementById("weekly-chart-container");
  if (!container) return;
  
  // 获取近 7 天的数据分布
  const labels = [];
  const counts = [];
  
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = getLocalDateString(d);
    
    // 日期简称 (如 "7.03" 或 "周五")
    const weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    labels.push(i === 0 ? "今天" : weekDays[d.getDay()]);
    
    // 统计当日打卡数量
    const dayCount = state.workouts.filter(w => w.date === dateStr).length;
    counts.push(dayCount);
  }
  
  // SVG 宽高
  const width = container.clientWidth || 350;
  const height = 110;
  const paddingX = 30;
  const paddingY = 20;
  
  const maxVal = Math.max(...counts, 2); // 至少是2作Y轴上限
  
  // 映射点坐标
  const points = counts.map((val, idx) => {
    const x = paddingX + (idx / (counts.length - 1)) * (width - paddingX * 2);
    const y = height - paddingY - (val / maxVal) * (height - paddingY * 2);
    return { x, y, val };
  });
  
  // 构建 SVG 路径 (平滑贝塞尔曲线)
  let dPath = "";
  if (points.length > 0) {
    dPath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      // 控制点
      const cpX1 = p0.x + (p1.x - p0.x) / 2;
      const cpY1 = p0.y;
      const cpX2 = p0.x + (p1.x - p0.x) / 2;
      const cpY2 = p1.y;
      dPath += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }
  }
  
  // 下方填充渐变阴影路径
  let fillPath = "";
  if (points.length > 0) {
    fillPath = `${dPath} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;
  }
  
  // 组合成 SVG HTML
  let svgHTML = `
    <svg class="chart-svg" width="${width}" height="${height}">
      <!-- 渐变阴影滤镜 -->
      <defs>
        <linearGradient id="chart-fill-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#ffd000" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#ffd000" stop-opacity="0" />
        </linearGradient>
        <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      
      <!-- 背景网格横线 -->
      <line x1="${paddingX}" y1="${paddingY}" x2="${width - paddingX}" y2="${paddingY}" stroke="rgba(255,255,255,0.03)" stroke-width="1" />
      <line x1="${paddingX}" y1="${(height - paddingY * 2) / 2 + paddingY}" x2="${width - paddingX}" y2="${(height - paddingY * 2) / 2 + paddingY}" stroke="rgba(255,255,255,0.03)" stroke-width="1" />
      <line x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}" stroke="rgba(255,255,255,0.07)" stroke-width="1.5" />
      
      <!-- 渐变填充阴影 -->
      <path d="${fillPath}" fill="url(#chart-fill-grad)" />
      
      <!-- 趋势曲线 -->
      <path d="${dPath}" fill="none" stroke="#ffd000" stroke-width="3" filter="url(#neon-glow)" />
      
      <!-- 点与标示 -->
  `;
  
  points.forEach((p, idx) => {
    // 绘制活跃状态的数据点
    const isActive = p.val > 0;
    svgHTML += `
      <circle cx="${p.x}" cy="${p.y}" r="${isActive ? 4 : 2}" fill="${isActive ? '#ffd000' : 'rgba(255,255,255,0.2)'}" stroke="${isActive ? '#ffffff' : 'none'}" stroke-width="1.5" />
    `;
    
    // 如果有锻炼数值，在点上方写个小数字
    if (isActive) {
      svgHTML += `
        <text x="${p.x}" y="${p.y - 10}" fill="#ffd000" font-size="10" font-weight="700" text-anchor="middle" font-family="Outfit">${p.val}</text>
      `;
    }
    
    // X轴标签
    svgHTML += `
      <text x="${p.x}" y="${height - 4}" fill="${idx === 6 ? '#ffffff' : 'rgba(255,255,255,0.4)'}" font-size="10" font-weight="500" text-anchor="middle">${labels[idx]}</text>
    `;
  });
  
  svgHTML += `</svg>`;
  container.innerHTML = svgHTML;
}

// ==========================================================================
// 6. 渲染历史打卡记录 (Render History)
// ==========================================================================
function renderHistory() {
  const container = document.getElementById("history-list-container");
  if (!container) return;
  
  const filterType = document.getElementById("filter-exercise-type").value;
  
  // 筛选记录
  let filtered = state.workouts;
  if (filterType !== "all") {
    filtered = filtered.filter(w => w.type === filterType);
  }
  
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-emoji">🧘‍♀️</div>
        <p>暂无相关健身记录，快去打卡吧！</p>
      </div>
    `;
    return;
  }
  
  // 按照日期分组
  const groups = {};
  filtered.forEach(w => {
    if (!groups[w.date]) groups[w.date] = [];
    groups[w.date].push(w);
  });
  
  // 排序日期 (最新的排在最前面)
  const sortedDates = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a));
  
  let html = "";

  // 转换日期语义化 (如 今天 / 昨天)
  const todayStr = getLocalDateString();
  const yesterdayStr = getPastDateString(1);

  sortedDates.forEach(dateStr => {
    let dateDisplay = dateStr;
    const parts = dateStr.split('-');
    const formattedStr = `${parseInt(parts[1])}月${parseInt(parts[2])}日`;
    
    if (dateStr === todayStr) {
      dateDisplay = `今天 - ${formattedStr}`;
    } else if (dateStr === yesterdayStr) {
      dateDisplay = `昨天 - ${formattedStr}`;
    } else {
      dateDisplay = `${parts[0]}年${formattedStr}`;
    }
    
    html += `
      <div class="history-day-group">
        <div class="history-date-header">${dateDisplay}</div>
    `;
    
    groups[dateStr].forEach(item => {
      let icon = "⚙️";
      let title = "健身运动";
      let stats = "";
      
      switch(item.type) {
        case 'leg_press':
          icon = "🦵";
          title = "腿举 (Leg Press)";
          stats = `${item.details.weight}kg × ${item.details.reps}次 × ${item.details.sets}组` + (item.details.extraReps ? ` (+组外${item.details.extraReps}次)` : "");
          break;
        case 'shoulder_press':
          icon = "💪";
          title = "肩推 (Shoulder Press)";
          stats = `${item.details.weight}kg × ${item.details.reps}次 × ${item.details.sets}组` + (item.details.extraReps ? ` (+组外${item.details.extraReps}次)` : "");
          break;
        case 'chest_press':
          icon = "🏋️";
          title = "胸推 (Chest Press)";
          stats = `${item.details.weight}kg × ${item.details.reps}次 × ${item.details.sets}组` + (item.details.extraReps ? ` (+组外${item.details.extraReps}次)` : "");
          break;
        case 'preacher_curl':
          icon = "🧘";
          title = "牧师椅 (Preacher Curl)";
          stats = `${item.details.weight}kg × ${item.details.reps}次 × ${item.details.sets}组` + (item.details.extraReps ? ` (+组外${item.details.extraReps}次)` : "");
          break;
        case 'lat_pulldown':
          icon = "🔽";
          title = "高位下拉 (Lat Pulldown)";
          stats = `${item.details.weight}kg × ${item.details.reps}次 × ${item.details.sets}组` + (item.details.extraReps ? ` (+组外${item.details.extraReps}次)` : "");
          break;
        case 'situps':
          icon = "🧗";
          title = "仰卧起坐 (Sit-ups)";
          stats = `${item.details.reps}次 × ${item.details.sets}组` + (item.details.extraReps ? ` (+组外${item.details.extraReps}次)` : "");
          break;
        case 'spin_bike':
          icon = "🚴";
          title = "动感单车 (Spin Bike)";
          stats = `阻力 ${item.details.resistance}档 | 骑行 ${item.details.time}分钟`;
          break;
        case 'treadmill':
          icon = "🏃";
          title = item.details.mode === "walk" ? "跑步机 (快走)" : "跑步机 (慢跑)";
          stats = `${item.details.time}分钟 | 速度 ${item.details.speed}km/h | 坡度 ${item.details.incline}% | ${item.details.distance}km | 约 ${item.details.calories}kcal`;
          break;
        case 'massage_chair':
          icon = "💆";
          title = `按摩椅 (${item.details.mode})`;
          const intensityMap = { 1: "弱", 2: "中", 3: "强" };
          stats = `时长 ${item.details.duration}分钟 | 力度：${intensityMap[item.details.intensity] || "中"}`;
          break;
        case 'custom':
          icon = "⚙️";
          title = item.details.name || "自定义项目";
          stats = `${item.details.value || ""}` + (item.details.sets ? ` × ${item.details.sets}组` : "");
          break;
      }
      
      html += `
        <div class="glass history-item-card">
          <div class="history-item-left">
            <div class="history-item-avatar">${icon}</div>
            <div class="history-item-details">
              <span class="history-item-title">${title}</span>
              <span class="history-item-stats">${stats}</span>
              ${item.notes ? `<span class="history-item-note">💬 ${item.notes}</span>` : ''}
            </div>
          </div>
          <div class="history-item-right">
            <button class="delete-btn" onclick="deleteWorkout('${item.id}')" title="删除记录">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;
    });
    
    html += `</div>`;
  });
  
  container.innerHTML = html;
}

// ==========================================================================
// 7. AI 健身教练逻辑 (AI Coach integration with Gemini)
// ==========================================================================

// 将健身数据打包转换为面向大语言模型的精美 Markdown 提示词 (免 Key/直连通用)
function generateWorkoutSummaryPrompt() {
  const weight = state.settings.weight || 70;
  const recentWorkouts = state.workouts.slice(0, 30); // 提取最近 30 次记录

  const equipmentListStr = EQUIPMENT_ROSTER.map(e => `- ${e.label}：${e.note}`).join("\n");

  let prompt = `你是一位专业且充满亲和力的 ChocoZAP 健身私人教练。请为我分析我最近的运动成果并提供针对性建议。

【重要限制：ChocoZAP 门店实际可用的器材清单】
${equipmentListStr}

请严格注意：你所有的训练建议、动作推荐，必须只从上面这份器材清单里选择。ChocoZAP 是一家小型 24 小时便利健身房，没有杠铃深蹲架、龙门架、壶铃、单杠等常见大型健身房器械，所以请不要提及或推荐清单之外的动作和器材。如果某个训练目标（比如练背、练腿弯举）在清单里没有直接对应的器材，请从清单中挑选功能最相近的替代动作，并说明这是替代方案。

另外请注意：ChocoZAP 的力量训练器械（腿举、肩推、胸推、牧师椅、高位下拉）配重片只能以 5kg 为最小单位调整，不支持 2.5kg 这种半档，所以你给出的所有重量建议必须是 5 的整数倍（如 20kg、25kg、30kg），不要出现 2.5kg 的倍数。

【我的个人档案】
- 体重: ${weight} kg

【我最近的健身打卡历史 (最新排在最前)】
`;

  if (recentWorkouts.length === 0) {
    prompt += "（尚无记录。我刚刚开始在 ChocoZAP 健身，请指导我如何入门并分配力量与有氧运动）\n";
  } else {
    recentWorkouts.forEach((w, index) => {
      const typeStr = {
        leg_press: "腿举 (力量)",
        shoulder_press: "肩推 (力量)",
        chest_press: "胸推 (力量)",
        preacher_curl: "牧师椅二头弯举 (力量)",
        lat_pulldown: "高位下拉 (力量)",
        situps: "仰卧起坐 (核心)",
        spin_bike: "动感单车 (有氧)",
        treadmill: "跑步机 (有氧)",
        massage_chair: "按摩椅放松 (拉伸)",
        custom: "自定义项目"
      }[w.type] || "其他";

      let detailsStr = "";
      if (['leg_press', 'shoulder_press', 'chest_press', 'preacher_curl', 'lat_pulldown'].includes(w.type)) {
        detailsStr = `${w.details.weight}kg x ${w.details.reps}次 x ${w.details.sets}组` + (w.details.extraReps ? ` + 组外${w.details.extraReps}次` : "");
      } else if (w.type === 'situps') {
        detailsStr = `${w.details.reps}次 x ${w.details.sets}组` + (w.details.extraReps ? ` + 组外${w.details.extraReps}次` : "");
      } else if (w.type === 'spin_bike') {
        detailsStr = `阻力 ${w.details.resistance}档，骑行 ${w.details.time}分钟`;
      } else if (w.type === 'treadmill') {
        detailsStr = `${w.details.mode === "walk" ? "快走" : "慢跑"}，时常 ${w.details.time}分钟，速度 ${w.details.speed}km/h，坡度 ${w.details.incline}%, 预估距离 ${w.details.distance}km, 预估消耗 ${w.details.calories}kcal`;
      } else if (w.type === 'massage_chair') {
        detailsStr = `模式 [${w.details.mode}]，放松 ${w.details.duration}分钟，力度级别 ${w.details.intensity}`;
      } else if (w.type === 'custom') {
        detailsStr = `[${w.details.name}] - 数据: ${w.details.value}` + (w.details.sets ? ` x ${w.details.sets}组` : "");
      }

      prompt += `${index + 1}. 日期: ${w.date} | 项目: ${typeStr} | 运动详情: ${detailsStr} ${w.notes ? `| 个人备注: "${w.notes}"` : ""}\n`;
    });
  }

  prompt += `
【请帮我分析以下几点】
1. 分析我近期力量训练（腿举、胸推、肩推等）和有氧运动（跑步机、单车）的分配比例是否科学？
2. 在力量训练的负荷与渐进性超负荷方面，有没有发现我的进步趋势或需要调整的地方？
3. 从脂肪燃烧、肌肉增长或体能改善的角度，给我推荐一套接下来两周在 ChocoZAP 器材上的健身动作顺序和强度建议（同样必须只使用上面清单里的器材）。
4. 结合我的体重，指出有氧运动中热量消耗效率的表现。

请用极其鼓励的口吻回答我，排版美观，使用 emoji 增加活力！`;

  return prompt;
}

// ==========================================================================
// 7.1 "Gemini的推荐" 首页模块：解析 AI 结构化训练计划、渲染、完成/拒绝
// ==========================================================================

// 只有直连 API 模式才能拿到可解析的回复，这里教会 Gemini 在"给出具体训练菜单推荐"时，
// 在人类可读的回复末尾追加一段机器可读的 JSON 计划块，方便一键转为打卡记录
function buildStructuredPlanInstruction() {
  const typeSchemaStr = Object.keys(WORKOUT_REQUIRED_FIELDS)
    .map(t => `  - "${t}": details 需要 ${WORKOUT_REQUIRED_FIELDS[t].join('、')} (均为数字，treadmill 的 mode 是 "walk" 或 "run" 字符串)`)
    .join('\n');

  return `
【结构化训练计划输出格式 —— 本次请求就是在向你要一份具体可执行的训练菜单，必须输出】
请在你正常的、给人看的回复内容结束之后，另起一行，追加一个由 <!--CHOCOZAP_PLAN_START--> 和 <!--CHOCOZAP_PLAN_END--> 包裹的 JSON 数组，
数组每一项代表一个推荐动作，格式为：
{ "type": "器材英文标识", "label": "中文名称", "intensity": "给人看的强度描述文字，例如 50kg x 12次 x 3组", "details": { ...结构化数值字段 } }
type 必须是以下英文标识之一，且 details 字段必须严格匹配对应的数值 schema：
${typeSchemaStr}
如果推荐的动作不在上述器材范围内，type 请填 "custom"，details 填 { "name": "动作名称", "value": "关键数据文字", "sets": 组数或null }。
这段 JSON 是给 App 自动解析用的，不需要在正文里重复解释它，也不要用 Markdown 代码块包裹，直接是纯 JSON 数组文本，且这次务必要输出。`;
}

// 从 AI 回复文本中提取结构化训练计划 JSON 块，返回清理后的正文 + 计划数组
function extractAiPlanFromReply(text) {
  const match = text.match(/<!--CHOCOZAP_PLAN_START-->([\s\S]*?)<!--CHOCOZAP_PLAN_END-->/);
  if (!match) return { cleanedText: text, items: [] };

  const cleanedText = (text.slice(0, match.index) + text.slice(match.index + match[0].length)).trim();
  let items = [];
  try {
    const parsed = JSON.parse(match[1].trim());
    if (Array.isArray(parsed)) items = parsed;
  } catch (e) {
    items = [];
  }
  return { cleanedText, items };
}

// 把 AI 给出的原始计划条目校验/归一化后加入推荐列表并持久化
function addAiRecommendations(rawItems) {
  const now = Date.now();
  const added = rawItems.map((item, idx) => ({
    id: "rec-" + now + "-" + idx + "-" + Math.random().toString(36).slice(2, 6),
    type: typeof item.type === 'string' ? item.type : 'custom',
    label: typeof item.label === 'string' && item.label ? item.label : '训练推荐',
    intensity: typeof item.intensity === 'string' ? item.intensity : '',
    details: (item.details && typeof item.details === 'object') ? item.details : null,
    createdAt: now
  })).filter(item => item.label);

  if (added.length === 0) return;

  state.aiRecommendations = state.aiRecommendations.concat(added);
  localStorage.setItem("chocozap_ai_recommendations", JSON.stringify(state.aiRecommendations));
  renderAiRecommendations();
}

// 渲染首页"Gemini的推荐"模块；没有待处理推荐时整个模块隐藏，避免占用首页空间
function renderAiRecommendations() {
  const section = document.getElementById("ai-recommendation-section");
  const list = document.getElementById("ai-recommendation-list");
  if (!section || !list) return;

  if (!state.aiRecommendations || state.aiRecommendations.length === 0) {
    section.style.display = "none";
    list.innerHTML = ""; // 清空残留节点，避免隐藏后 DOM 里仍留着旧的推荐卡片
    return;
  }
  section.style.display = "block";

  const iconMap = {
    leg_press: "🦵", shoulder_press: "💪", chest_press: "🏋️", preacher_curl: "🧘", lat_pulldown: "🔽",
    situps: "🧗", spin_bike: "🚴", treadmill: "🏃", massage_chair: "💆", custom: "⚙️"
  };

  list.innerHTML = state.aiRecommendations.map(rec => `
    <div class="glass ai-rec-item">
      <div class="ai-rec-left">
        <div class="ai-rec-avatar">${iconMap[rec.type] || "⚙️"}</div>
        <div class="ai-rec-details">
          <span class="ai-rec-title">${rec.label}</span>
          ${rec.intensity ? `<span class="ai-rec-intensity">${rec.intensity}</span>` : ''}
        </div>
      </div>
      <div class="ai-rec-actions">
        <button class="ai-rec-btn ai-rec-accept" onclick="acceptAiRecommendation('${rec.id}')" title="完成并打卡">✓ 完成</button>
        <button class="ai-rec-btn ai-rec-adjust" onclick="openAdjustRecDialog('${rec.id}')" title="调整强度/组数后再完成">✎ 调整</button>
        <button class="ai-rec-btn ai-rec-reject" onclick="rejectAiRecommendation('${rec.id}')" title="不需要这条推荐">✕ 拒绝</button>
      </div>
    </div>
  `).join('');
}

// ==========================================================================
// 7.3 调整 AI 推荐：完成前允许修改强度(重量)/组数/组外次数等参数
// ==========================================================================
let adjustingRecId = null;

// 力量类项目 (含重量) 统一走这一套字段；ChocoZAP 配重只能以 5kg 为单位，
// 所以这里的步进器只给 ±5，不提供 ±1，从 UI 层面就避免调出不合法的重量
function buildStrengthAdjustFields(d) {
  const weight = roundToNearestStep(d.weight, WEIGHT_STEP_KG) || WEIGHT_STEP_KG;
  return `
    <div class="form-row">
      <label>重量 (kg) <small>—— ChocoZAP 器械以 5kg 为单位调整</small></label>
      <div class="stepper-input">
        <button type="button" class="step-btn decrease" onclick="adjustValue('adjust-weight', -${WEIGHT_STEP_KG})">-5</button>
        <input type="number" id="adjust-weight" value="${weight}" min="0" max="300" step="${WEIGHT_STEP_KG}">
        <button type="button" class="step-btn increase" onclick="adjustValue('adjust-weight', ${WEIGHT_STEP_KG})">+5</button>
      </div>
    </div>
    <div class="form-row-grid">
      <div class="form-row">
        <label>每组次数</label>
        <div class="stepper-input">
          <button type="button" class="step-btn decrease" onclick="adjustValue('adjust-reps', -1)">-</button>
          <input type="number" id="adjust-reps" value="${d.reps || 12}" min="1" max="100">
          <button type="button" class="step-btn increase" onclick="adjustValue('adjust-reps', 1)">+</button>
        </div>
      </div>
      <div class="form-row">
        <label>组数</label>
        <div class="stepper-input">
          <button type="button" class="step-btn decrease" onclick="adjustValue('adjust-sets', -1)">-</button>
          <input type="number" id="adjust-sets" value="${d.sets || 3}" min="1" max="20">
          <button type="button" class="step-btn increase" onclick="adjustValue('adjust-sets', 1)">+</button>
        </div>
      </div>
    </div>
    <div class="form-row">
      <label>组外次数 <small>—— 可选，正式组数之外力竭/额外加练的次数</small></label>
      <div class="stepper-input">
        <button type="button" class="step-btn decrease" onclick="adjustValue('adjust-extra-reps', -1)">-</button>
        <input type="number" id="adjust-extra-reps" value="${d.extraReps || ''}" placeholder="0" min="0" max="100">
        <button type="button" class="step-btn increase" onclick="adjustValue('adjust-extra-reps', 1)">+</button>
      </div>
    </div>
  `;
}

function buildSitupsAdjustFields(d) {
  return `
    <div class="form-row-grid">
      <div class="form-row">
        <label>每组次数</label>
        <div class="stepper-input">
          <button type="button" class="step-btn decrease" onclick="adjustValue('adjust-reps', -5)">-5</button>
          <input type="number" id="adjust-reps" value="${d.reps || 15}" min="1" max="200">
          <button type="button" class="step-btn increase" onclick="adjustValue('adjust-reps', 5)">+5</button>
        </div>
      </div>
      <div class="form-row">
        <label>组数</label>
        <div class="stepper-input">
          <button type="button" class="step-btn decrease" onclick="adjustValue('adjust-sets', -1)">-</button>
          <input type="number" id="adjust-sets" value="${d.sets || 3}" min="1" max="20">
          <button type="button" class="step-btn increase" onclick="adjustValue('adjust-sets', 1)">+</button>
        </div>
      </div>
    </div>
    <div class="form-row">
      <label>组外次数 <small>—— 可选</small></label>
      <div class="stepper-input">
        <button type="button" class="step-btn decrease" onclick="adjustValue('adjust-extra-reps', -1)">-</button>
        <input type="number" id="adjust-extra-reps" value="${d.extraReps || ''}" placeholder="0" min="0" max="200">
        <button type="button" class="step-btn increase" onclick="adjustValue('adjust-extra-reps', 1)">+</button>
      </div>
    </div>
  `;
}

function buildSpinBikeAdjustFields(d) {
  return `
    <div class="form-row-grid">
      <div class="form-row">
        <label>阻力档位 (1-24)</label>
        <div class="stepper-input">
          <button type="button" class="step-btn decrease" onclick="adjustValue('adjust-resistance', -1)">-</button>
          <input type="number" id="adjust-resistance" value="${d.resistance || 8}" min="1" max="24">
          <button type="button" class="step-btn increase" onclick="adjustValue('adjust-resistance', 1)">+</button>
        </div>
      </div>
      <div class="form-row">
        <label>骑行时长 (分钟)</label>
        <div class="stepper-input">
          <button type="button" class="step-btn decrease" onclick="adjustValue('adjust-time', -5)">-5</button>
          <input type="number" id="adjust-time" value="${d.time || 20}" min="1" max="180">
          <button type="button" class="step-btn increase" onclick="adjustValue('adjust-time', 5)">+5</button>
        </div>
      </div>
    </div>
  `;
}

function buildTreadmillAdjustFields(d) {
  const mode = d.mode === 'run' ? 'run' : 'walk';
  return `
    <div class="form-row">
      <label>运动类型</label>
      <div class="segmented-control">
        <label class="segment-item">
          <input type="radio" name="adjust-treadmill-mode" value="walk" ${mode === 'walk' ? 'checked' : ''}>
          <span>🚶 快走</span>
        </label>
        <label class="segment-item">
          <input type="radio" name="adjust-treadmill-mode" value="run" ${mode === 'run' ? 'checked' : ''}>
          <span>🏃 跑步</span>
        </label>
      </div>
    </div>
    <div class="form-row-grid">
      <div class="form-row">
        <label>速度 (km/h)</label>
        <div class="stepper-input">
          <button type="button" class="step-btn decrease" onclick="adjustValue('adjust-speed', -0.5)">-</button>
          <input type="number" id="adjust-speed" value="${d.speed || 6}" min="2" max="20" step="0.5">
          <button type="button" class="step-btn increase" onclick="adjustValue('adjust-speed', 0.5)">+</button>
        </div>
      </div>
      <div class="form-row">
        <label>坡度 (%)</label>
        <div class="stepper-input">
          <button type="button" class="step-btn decrease" onclick="adjustValue('adjust-incline', -1)">-</button>
          <input type="number" id="adjust-incline" value="${d.incline || 0}" min="0" max="15">
          <button type="button" class="step-btn increase" onclick="adjustValue('adjust-incline', 1)">+</button>
        </div>
      </div>
    </div>
    <div class="form-row">
      <label>时长 (分钟)</label>
      <div class="stepper-input">
        <button type="button" class="step-btn decrease" onclick="adjustValue('adjust-time', -5)">-5</button>
        <input type="number" id="adjust-time" value="${d.time || 30}" min="1" max="180">
        <button type="button" class="step-btn increase" onclick="adjustValue('adjust-time', 5)">+5</button>
      </div>
    </div>
  `;
}

function buildMassageChairAdjustFields(d) {
  return `
    <div class="form-row">
      <label>按摩模式</label>
      <input type="text" id="adjust-massage-mode" value="${d.mode || '自动舒缓'}" class="glass-input">
    </div>
    <div class="form-row-grid">
      <div class="form-row">
        <label>按摩时长 (分钟)</label>
        <div class="stepper-input">
          <button type="button" class="step-btn decrease" onclick="adjustValue('adjust-duration', -15)">-15</button>
          <input type="number" id="adjust-duration" value="${d.duration || 30}" min="15" max="120">
          <button type="button" class="step-btn increase" onclick="adjustValue('adjust-duration', 15)">+15</button>
        </div>
      </div>
      <div class="form-row">
        <label>强度级别 (1弱 / 2中 / 3强)</label>
        <div class="stepper-input">
          <button type="button" class="step-btn decrease" onclick="adjustValue('adjust-intensity', -1)">-</button>
          <input type="number" id="adjust-intensity" value="${d.intensity || 2}" min="1" max="3">
          <button type="button" class="step-btn increase" onclick="adjustValue('adjust-intensity', 1)">+</button>
        </div>
      </div>
    </div>
  `;
}

function buildCustomAdjustFields(rec, d) {
  return `
    <div class="form-row">
      <label>项目名称</label>
      <input type="text" id="adjust-custom-name" value="${rec.label || ''}" class="glass-input">
    </div>
    <div class="form-row-grid">
      <div class="form-row">
        <label>关键数据 (如重量/次数)</label>
        <input type="text" id="adjust-custom-value" value="${(d && d.value) || rec.intensity || ''}" class="glass-input">
      </div>
      <div class="form-row">
        <label>组数 (非必填)</label>
        <input type="number" id="adjust-custom-sets" value="${(d && d.sets) || ''}" class="glass-input" min="1">
      </div>
    </div>
  `;
}

// 打开"调整"弹窗，根据推荐项目的类型动态渲染对应的可编辑字段
function openAdjustRecDialog(id) {
  const rec = state.aiRecommendations.find(r => r.id === id);
  if (!rec) return;

  adjustingRecId = id;
  const d = rec.details && typeof rec.details === 'object' ? rec.details : {};
  const fieldsContainer = document.getElementById("adjust-rec-fields");

  const strengthTypes = ['leg_press', 'shoulder_press', 'chest_press', 'preacher_curl', 'lat_pulldown'];
  if (strengthTypes.includes(rec.type)) {
    fieldsContainer.innerHTML = buildStrengthAdjustFields(d);
  } else if (rec.type === 'situps') {
    fieldsContainer.innerHTML = buildSitupsAdjustFields(d);
  } else if (rec.type === 'spin_bike') {
    fieldsContainer.innerHTML = buildSpinBikeAdjustFields(d);
  } else if (rec.type === 'treadmill') {
    fieldsContainer.innerHTML = buildTreadmillAdjustFields(d);
  } else if (rec.type === 'massage_chair') {
    fieldsContainer.innerHTML = buildMassageChairAdjustFields(d);
  } else {
    fieldsContainer.innerHTML = buildCustomAdjustFields(rec, d);
  }

  document.getElementById("adjust-rec-dialog-title").textContent = `调整推荐：${rec.label}`;
  document.getElementById("adjust-rec-dialog").style.display = "flex";
}

function closeAdjustRecDialog() {
  document.getElementById("adjust-rec-dialog").style.display = "none";
  adjustingRecId = null;
}

// 保存调整：根据当前弹窗里的字段读值，更新该条推荐的 details，并重新生成强度展示文字
function saveAdjustedRecommendation() {
  const rec = state.aiRecommendations.find(r => r.id === adjustingRecId);
  if (!rec) { closeAdjustRecDialog(); return; }

  const strengthTypes = ['leg_press', 'shoulder_press', 'chest_press', 'preacher_curl', 'lat_pulldown'];

  if (strengthTypes.includes(rec.type)) {
    const weight = roundToNearestStep(document.getElementById("adjust-weight").value, WEIGHT_STEP_KG);
    const reps = parseInt(document.getElementById("adjust-reps").value) || 0;
    const sets = parseInt(document.getElementById("adjust-sets").value) || 0;
    const extraReps = parseInt(document.getElementById("adjust-extra-reps").value) || 0;
    rec.details = { weight, reps, sets, extraReps };
    rec.intensity = `${weight}kg x ${reps}次 x ${sets}组` + (extraReps ? ` + 组外${extraReps}次` : "");
  } else if (rec.type === 'situps') {
    const reps = parseInt(document.getElementById("adjust-reps").value) || 0;
    const sets = parseInt(document.getElementById("adjust-sets").value) || 0;
    const extraReps = parseInt(document.getElementById("adjust-extra-reps").value) || 0;
    rec.details = { reps, sets, extraReps };
    rec.intensity = `${reps}次 x ${sets}组` + (extraReps ? ` + 组外${extraReps}次` : "");
  } else if (rec.type === 'spin_bike') {
    const resistance = parseInt(document.getElementById("adjust-resistance").value) || 0;
    const time = parseInt(document.getElementById("adjust-time").value) || 0;
    rec.details = { resistance, time };
    rec.intensity = `阻力${resistance}档，骑行${time}分钟`;
  } else if (rec.type === 'treadmill') {
    const mode = document.querySelector('input[name="adjust-treadmill-mode"]:checked').value;
    const speed = parseFloat(document.getElementById("adjust-speed").value) || 0;
    const incline = parseFloat(document.getElementById("adjust-incline").value) || 0;
    const time = parseInt(document.getElementById("adjust-time").value) || 0;
    rec.details = { mode, speed, incline, time };
    rec.intensity = `${mode === 'walk' ? '快走' : '慢跑'} ${time}分钟，速度${speed}km/h，坡度${incline}%`;
  } else if (rec.type === 'massage_chair') {
    const mode = document.getElementById("adjust-massage-mode").value.trim() || '自动舒缓';
    const duration = parseInt(document.getElementById("adjust-duration").value) || 30;
    const intensity = parseInt(document.getElementById("adjust-intensity").value) || 2;
    rec.details = { mode, duration, intensity };
    rec.intensity = `${mode}，${duration}分钟，强度${intensity}`;
  } else {
    const name = document.getElementById("adjust-custom-name").value.trim() || rec.label;
    const value = document.getElementById("adjust-custom-value").value.trim();
    const sets = parseInt(document.getElementById("adjust-custom-sets").value) || null;
    rec.label = name;
    rec.details = { name, value, sets };
    rec.intensity = value + (sets ? ` x ${sets}组` : "");
  }

  localStorage.setItem("chocozap_ai_recommendations", JSON.stringify(state.aiRecommendations));
  closeAdjustRecDialog();
  renderAiRecommendations();

  if (state.settings.githubToken) {
    syncWithGithub(true);
  }
}

// 点击"完成"：把推荐条目落地为一条今天的真实打卡记录
function acceptAiRecommendation(id) {
  const rec = state.aiRecommendations.find(r => r.id === id);
  if (!rec) return;

  const knownTypes = Object.keys(WORKOUT_REQUIRED_FIELDS);
  let type = knownTypes.includes(rec.type) ? rec.type : 'custom';
  let details = rec.details && typeof rec.details === 'object' ? { ...rec.details } : null;

  // 校验必填字段是否齐全，任一缺失就降级为 custom 类型，只保留强度文字，绝不编造数值
  if (type !== 'custom') {
    const requiredFields = WORKOUT_REQUIRED_FIELDS[type];
    const valid = details && requiredFields.every(f => details[f] !== undefined && details[f] !== null && details[f] !== '');
    if (!valid) type = 'custom';
  }

  if (type === 'custom') {
    details = {
      name: rec.label || '自定义项目',
      value: rec.intensity || '',
      sets: (details && details.sets) || null
    };
  } else if (WORKOUT_REQUIRED_FIELDS[type].includes('weight')) {
    // ChocoZAP 的力量器械配重只能以 5kg 为单位调整，即使 AI 没听话给出了 2.5kg 的半档，
    // 落地成打卡记录前也要强制取整，避免生成一条现实中根本调不出来的重量
    details.weight = roundToNearestStep(details.weight, WEIGHT_STEP_KG);
  } else if (type === 'treadmill') {
    // 距离/卡路里统一由 App 按同一套公式计算，不采信 AI 自行估算的数值，保证口径一致
    const est = computeTreadmillEstimate(details.mode, details.speed, details.incline, details.time);
    details.distance = est.distance;
    details.calories = est.calories;
  }

  const newWorkout = {
    id: "workout-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    date: getLocalDateString(),
    type: type,
    details: details,
    notes: "来自 Gemini 推荐" + (rec.intensity ? `：${rec.intensity}` : "")
  };

  state.workouts.unshift(newWorkout);
  localStorage.setItem("chocozap_workouts", JSON.stringify(state.workouts));

  removeAiRecommendation(id);

  if (state.settings.githubToken) {
    syncWithGithub(true);
  }

  renderAiRecommendations();
  updateStats();
  renderHistory();
}

// 点击"拒绝"：仅从推荐列表移除，不产生任何打卡记录
function rejectAiRecommendation(id) {
  removeAiRecommendation(id);
  renderAiRecommendations();

  // 拒绝也要同步到云端，否则另一台设备还是会看到这条已经被拒绝的推荐
  if (state.settings.githubToken) {
    syncWithGithub(true);
  }
}

// 把一条推荐从待处理列表移除，并写入墓碑——
// 推荐条目也会参与云同步，如果不打墓碑，云端旧数据合并回来时会让已完成/已拒绝的推荐"复活"
// (跟打卡记录删除时是同一套机制，两者的 id 前缀不同，可以安全共用同一张墓碑表)
function removeAiRecommendation(id) {
  state.aiRecommendations = state.aiRecommendations.filter(r => r.id !== id);
  state.deletedIds[id] = Date.now();
  localStorage.setItem("chocozap_ai_recommendations", JSON.stringify(state.aiRecommendations));
  localStorage.setItem("chocozap_deleted", JSON.stringify(state.deletedIds));
}

// 生成新一轮训练菜单时，替换掉所有尚未处理的旧推荐（而不是无限堆积）。
// 被替换掉的旧条目也要打墓碑，避免云端合并时被旧数据带回来
function setAiRecommendations(rawItems) {
  const now = Date.now();
  state.aiRecommendations.forEach(rec => { state.deletedIds[rec.id] = now; });
  localStorage.setItem("chocozap_deleted", JSON.stringify(state.deletedIds));

  state.aiRecommendations = [];
  addAiRecommendations(rawItems);
}

// 模式 B: 一键生成 Prompt 并弹出弹窗供用户复制
function packageWorkoutDataPrompt() {
  const prompt = generateWorkoutSummaryPrompt();
  
  document.getElementById("prompt-content-text").value = prompt;
  document.getElementById("prompt-dialog").style.display = "flex";
}

function closePromptDialog() {
  document.getElementById("prompt-dialog").style.display = "none";
}

function copyPromptText() {
  const textarea = document.getElementById("prompt-content-text");
  textarea.select();
  textarea.setSelectionRange(0, 99999); // 适配移动端
  
  try {
    navigator.clipboard.writeText(textarea.value).then(() => {
      alert("复制成功！可以直接粘贴给网页版 Gemini / ChatGPT 了。");
      closePromptDialog();
    });
  } catch (err) {
    // 兼容性降级处理
    document.execCommand("copy");
    alert("复制成功！(降级通道)");
    closePromptDialog();
  }
}

// ==========================================================================
// 7.2 AI 多会话聊天记录 (Chat Sessions，仿主流 AI 聊天 App 的历史对话)
// ==========================================================================
// 注意：这段文字会经过 formatChatMessageText 处理 (先转义 HTML 再解析 **粗体**/换行)，
// 所以这里只能写 Markdown 语法，不能直接写 <strong>/<br> 这类 HTML 标签，否则会被转义显示成字面文字
const CHAT_WELCOME_TEXT = `你好！我是你的 AI 健身教练。我会根据你录入的 ChocoZAP 健身记录来分析你的运动成效、建议合理的负荷与恢复周期，还可以为你定制饮食与锻炼计划。

**💡 使用方式：**
1. **API 直连对话**：在"设置"中配置 Gemini API Key，即可直接在下方输入框和我对话！
2. **免 API 一键打包**：点击下方的"打包健身数据"，我将生成一份带有你所有打卡细节的 Prompt 模板，你只需复制它即可粘贴至任何 AI 网页端进行分析。`;

function persistChatSessions() {
  localStorage.setItem("chocozap_chat_sessions", JSON.stringify(state.chatSessions));
  localStorage.setItem("chocozap_active_chat_session", state.activeChatSessionId || "");
}

// 取得当前激活的会话，如果不存在（首次使用/被删空）则新建一个
function getActiveChatSession() {
  let session = state.chatSessions.find(s => s.id === state.activeChatSessionId);
  if (!session) {
    session = { id: "chat-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6), messages: [], updatedAt: Date.now() };
    state.chatSessions.unshift(session);
    state.activeChatSessionId = session.id;
    persistChatSessions();
  }
  return session;
}

// 会话标题：取该会话第一条用户提问，截断展示；还没有提问时显示"新对话"
function getSessionTitle(session) {
  const firstUserMsg = session.messages.find(m => m.role === 'user');
  if (!firstUserMsg) return "新对话";
  const text = firstUserMsg.text.trim();
  return text.length > 16 ? text.slice(0, 16) + "…" : text;
}

function startNewChatSession() {
  const session = { id: "chat-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6), messages: [], updatedAt: Date.now() };
  state.chatSessions.unshift(session);
  state.activeChatSessionId = session.id;
  persistChatSessions();
  renderChatSessionMessages();
  renderChatHistoryList();
  closeChatHistoryPanel();
}

function switchChatSession(id) {
  if (state.activeChatSessionId === id) { closeChatHistoryPanel(); return; }
  state.activeChatSessionId = id;
  persistChatSessions();
  renderChatSessionMessages();
  renderChatHistoryList();
  closeChatHistoryPanel();
}

function deleteChatSession(id, event) {
  if (event) event.stopPropagation(); // 防止触发外层的切换会话点击
  if (!confirm("确定要删除这段对话记录吗？此操作无法撤销。")) return;

  state.chatSessions = state.chatSessions.filter(s => s.id !== id);
  if (state.activeChatSessionId === id) {
    state.activeChatSessionId = state.chatSessions.length > 0 ? state.chatSessions[0].id : null;
  }
  persistChatSessions();
  renderChatSessionMessages();
  renderChatHistoryList();
}

function toggleChatHistoryPanel() {
  const panel = document.getElementById("chat-history-panel");
  if (!panel) return;
  panel.classList.toggle("open");
  if (panel.classList.contains("open")) renderChatHistoryList();
}

function closeChatHistoryPanel() {
  const panel = document.getElementById("chat-history-panel");
  if (panel) panel.classList.remove("open");
}

// 渲染左侧历史对话列表
function renderChatHistoryList() {
  const list = document.getElementById("chat-history-list");
  if (!list) return;

  if (state.chatSessions.length === 0) {
    list.innerHTML = `<div class="chat-history-empty">暂无历史对话，发送第一条消息后会自动生成～</div>`;
    return;
  }

  const sorted = [...state.chatSessions].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  list.innerHTML = sorted.map(session => {
    const isActive = session.id === state.activeChatSessionId;
    const lastMsg = session.messages[session.messages.length - 1];
    const timeStr = lastMsg ? new Date(lastMsg.time || session.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '';
    return `
      <div class="chat-history-item ${isActive ? 'active' : ''}" onclick="switchChatSession('${session.id}')">
        <div class="chat-history-item-title">${getSessionTitle(session)}</div>
        <div class="chat-history-item-meta">
          <span>${timeStr}</span>
          <button class="chat-history-delete-btn" onclick="deleteChatSession('${session.id}', event)" title="删除">🗑</button>
        </div>
      </div>
    `;
  }).join('');
}

// 把当前激活会话的历史消息重新渲染进聊天窗口 (切换会话/刷新页面时调用)
function renderChatSessionMessages() {
  const container = document.getElementById("chat-messages-container");
  if (!container) return;
  container.innerHTML = "";

  const session = state.chatSessions.find(s => s.id === state.activeChatSessionId);
  if (!session || session.messages.length === 0) {
    appendMessage("ai", "Gemini Coach", CHAT_WELCOME_TEXT, false, false);
    return;
  }
  session.messages.forEach(m => {
    appendMessage(m.role, m.name, m.text, false, false);
  });
}

// 模式 A: API 直连对话 —— 普通聊天，不附带"结构化训练计划"输出指令，
// 所以 AI 不会在闲聊/答疑时擅自甩出一份训练菜单
async function sendChatMessage() {
  const chatInput = document.getElementById("chat-input");
  const userText = chatInput.value.trim();
  if (!userText) return;
  chatInput.value = "";

  await callGeminiCoach(userText, { wantPlan: false });
}

// 点击"生成训练菜单"按钮：唯一会真正要求 AI 输出结构化训练计划的入口，
// 用户不点这个按钮，AI 就不会主动给出可以一键打卡的推荐菜单
async function requestTrainingPlan() {
  if (!state.settings.apiKey) {
    alert('生成训练菜单需要先在"设置"页配置 Gemini API Key（免 Key 的"打包健身数据"模式无法自动生成推荐列表，只能手动复制文字）。');
    switchTab('settings');
    return;
  }

  const userText = "请帮我安排一份今天可以在 ChocoZAP 完成的具体训练菜单，包含项目、重量、组数等可执行的强度安排。";
  await callGeminiCoach(userText, { wantPlan: true });
}

// 两个入口共用的请求逻辑：发消息、带上下文调用 Gemini、渲染回复、（可选）解析结构化计划
async function callGeminiCoach(userText, { wantPlan }) {
  const apiKey = state.settings.apiKey;
  const model = state.settings.apiModel || 'gemini-2.5-flash';
  const session = getActiveChatSession();

  // 1. 将用户的提问呈现在 UI 聊天框中，并计入当前会话历史
  appendMessage("user", "你", userText);

  // 2. 检测 API Key 是否配置 (走到这里说明是普通聊天；生成菜单按钮已经在 requestTrainingPlan 里提前拦截过)
  if (!apiKey) {
    setTimeout(() => {
      appendMessage("ai", "Gemini Coach", `未检测到您的 API Key。

我已经将您的最近健身打卡数据与刚才的提问打包。请点击输入框上方的“**打包健身数据**”按钮直接复制，在网页端 Gemini/ChatGPT 提问即可！
当然，如果您希望在应用内获得直连的丝滑对话，可以在“设置”页面中输入您的 Gemini API Key。`);
    }, 600);
    return;
  }

  // 3. 系统指令：健身数据背景 + 器材白名单约束，仅在明确请求菜单时才附加结构化输出格式指令
  let systemPromptText = generateWorkoutSummaryPrompt();
  if (wantPlan) systemPromptText += "\n" + buildStructuredPlanInstruction();

  // 4. 把当前会话的历史消息转换为 Gemini 多轮对话格式，实现真正的"继续聊下去"
  //    (而不是每次都把整段历史重新塞进单条 user 消息里)
  const conversationTurns = session.messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.text }]
  }));

  // 5. 显示 AI 正在思考 (Typing...)
  const tempBubbleId = appendMessage("ai", "Gemini Coach", wantPlan ? "正在为你安排今日训练菜单，请稍候..." : "正在思考中，请稍候...", true);

  try {
    // Google Gemini API Beta 直连请求
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPromptText }] },
        contents: conversationTurns,
        // 移除 maxOutputTokens 限制，让模型自主完整回答
        generationConfig: {
          temperature: 0.7
        }
      })
    });

    const data = await response.json();

    // 移除正在思考的临时泡泡
    removeMessage(tempBubbleId);

    if (response.ok && data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
      // 无损拼接所有 parts 的 text，防止多 part 返回时导致的话语中途截断
      const rawReplyText = data.candidates[0].content.parts.map(part => part.text || "").join("");

      // 提取结构化训练计划 (只有 wantPlan 时才会真的有这段内容)，正文里不展示这段 JSON
      const { cleanedText, items } = extractAiPlanFromReply(rawReplyText);
      let displayText = cleanedText;
      if (wantPlan && items.length > 0) {
        // 新一轮菜单会替换掉之前还没处理的旧推荐，而不是无限堆积
        setAiRecommendations(items);
        // 立即静默同步到云端，避免"电脑上刚生成的菜单，手机上还没看到"
        if (state.settings.githubToken) syncWithGithub(true);
        displayText += `\n\n✅ 已为你生成 ${items.length} 条训练推荐，可以在首页「Gemini的推荐」模块查看，点击完成会自动生成今天的打卡记录。`;
      } else if (wantPlan) {
        displayText += `\n\n⚠️ 这次没能解析出结构化菜单，可以再点一次"生成训练菜单"重试。`;
      }
      appendMessage("ai", "Gemini Coach", displayText);
    } else {
      // 捕获 API 内部错误
      const errorMsg = data.error ? data.error.message : "请求 Gemini 失败，请检查 API Key 是否有效。";
      appendMessage("ai", "Gemini Coach", `❌ 发生错误：${errorMsg}`);
    }

  } catch (error) {
    removeMessage(tempBubbleId);
    appendMessage("ai", "Gemini Coach", `❌ 网络请求失败，请确保本地可以连通 Google Gemini 接口 (部分地区可能需要科学上网)。错误详情: ${error.message}`);
  }
}

// 辅助：向 UI 添加对话气泡。persist=true 时会把消息计入当前会话历史并写入 localStorage
// (回放历史会话/渲染欢迎语时传 persist=false，避免重复写入)
function appendMessage(sender, senderName, text, isPending = false, persist = true) {
  const container = document.getElementById("chat-messages-container");
  if (!container) return;

  const bubbleId = "chat-bubble-" + Date.now() + Math.random().toString(36).substr(2, 5);
  const bubble = document.createElement("div");
  bubble.id = bubbleId;
  bubble.className = `chat-bubble ${sender}-bubble`;

  // 简易格式化 Markdown
  const formattedText = formatChatMessageText(text);

  const d = new Date();
  const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  bubble.innerHTML = `
    <div class="bubble-header">
      <span class="bubble-sender">${senderName}</span>
      <span class="bubble-time">${timeStr}</span>
    </div>
    <div class="bubble-text">${formattedText}</div>
  `;

  if (isPending) {
    bubble.classList.add("chat-bubble-pending");
  }

  container.appendChild(bubble);
  // 滚动至最下方
  container.scrollTop = container.scrollHeight;

  if (persist && !isPending) {
    const session = getActiveChatSession();
    session.messages.push({ role: sender, name: senderName, text: text, time: d.getTime() });
    session.updatedAt = d.getTime();
    persistChatSessions();
    renderChatHistoryList();
  }

  return bubbleId;
}

function removeMessage(id) {
  const element = document.getElementById(id);
  if (element) element.remove();
}

// 简易 markdown 转 HTML 渲染器
function formatChatMessageText(text) {
  if (!text) return "";
  
  let formatted = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  
  // 渲染粗体 **text**
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  // 渲染斜体 *text*
  formatted = formatted.replace(/\*(.*?)\*/g, "<em>$1</em>");
  // 换行替换成 <br>
  formatted = formatted.replace(/\n/g, "<br>");
  
  return formatted;
}

// ==========================================================================
// 8. 设置数据存取与备份 (Settings & Backup/Restore)
// ==========================================================================
function saveSettings() {
  const weight = parseFloat(document.getElementById("setting-weight").value) || 70;
  const apiKey = document.getElementById("setting-api-key").value.trim();
  const apiModel = document.getElementById("setting-api-model").value;
  const githubToken = document.getElementById("setting-github-token").value.trim();
  const githubGistId = document.getElementById("setting-github-gist-id").value.trim();
  
  state.settings = {
    weight: weight,
    apiKey: apiKey,
    apiModel: apiModel,
    githubToken: githubToken,
    githubGistId: githubGistId
  };
  
  localStorage.setItem("chocozap_settings", JSON.stringify(state.settings));

  // 更新设置的同步文字
  const syncStatus = document.getElementById("github-sync-status");
  if (syncStatus) {
    if (githubToken && githubGistId) {
      syncStatus.textContent = "已关联云端存储";
      syncStatus.style.color = "var(--neon-blue)";
    } else if (githubToken) {
      syncStatus.textContent = "已配置Token，待首次同步";
      syncStatus.style.color = "var(--text-secondary)";
    } else {
      syncStatus.textContent = "未配置同步";
      syncStatus.style.color = "var(--text-secondary)";
    }
  }
}

// 导出所有数据为 JSON 下载 (已剥离敏感凭据，备份文件可安全分享)
function exportData() {
  // 深度复制设置，并剔除敏感凭据：Gemini API Key 和 GitHub Token 都不能进备份文件
  const settingsToExport = { ...state.settings };
  delete settingsToExport.apiKey;
  delete settingsToExport.githubToken;

  const dataStr = JSON.stringify({
    version: "1.1",
    workouts: state.workouts,
    deleted: state.deletedIds,
    settings: settingsToExport
  }, null, 2);
  
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  
  a.href = url;
  a.download = `chocozap_workout_backup_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 导入 JSON 备份文件 (已升级为无损双向合并算法，且强行保留本地已配置的 API Key)
function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      
      if (Array.isArray(data.workouts)) {
        // 无损去重合并算法：基于 ID 合并本地和导入的数据
        const localWorkouts = state.workouts || [];
        const importedWorkouts = data.workouts || [];
        
        const mergedMap = new Map();
        // 放入导入的历史记录 (导入备份是显式的"恢复"操作，可复活本地已删除的记录)
        importedWorkouts.forEach(w => {
          mergedMap.set(w.id, w);
          delete state.deletedIds[w.id];
        });
        // 放入本地已有的记录 (若有冲突，本地最新记录优先)
        localWorkouts.forEach(w => mergedMap.set(w.id, w));

        // 合并备份文件中的删除墓碑 (仅对本地不存在的记录生效，导入不会删除本地数据)
        if (data.deleted && typeof data.deleted === 'object') {
          Object.keys(data.deleted).forEach(id => {
            if (!mergedMap.has(id)) state.deletedIds[id] = data.deleted[id];
          });
        }
        localStorage.setItem("chocozap_deleted", JSON.stringify(state.deletedIds));

        // 转回数组并按日期从新到旧排序
        const mergedList = Array.from(mergedMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date));

        state.workouts = mergedList;
        localStorage.setItem("chocozap_workouts", JSON.stringify(state.workouts));
        
        if (data.settings) {
          // 增量融合配置，保留本地已有的 API key
          state.settings = {
            ...state.settings,
            ...data.settings,
            apiKey: state.settings.apiKey // 强行保留本地已配置的 Key
          };
          localStorage.setItem("chocozap_settings", JSON.stringify(state.settings));
          
          // 更新设置界面
          document.getElementById("setting-weight").value = state.settings.weight;
          document.getElementById("setting-api-key").value = state.settings.apiKey || "";
          document.getElementById("setting-api-model").value = state.settings.apiModel || 'gemini-2.5-flash';
        }
        
        alert("🎉 数据合并导入成功！电脑与手机的数据已完美融合。");
        // 刷新
        updateStats();
        renderHistory();
        switchTab('dashboard');
      } else {
        alert("导入失败：非合法的 ChocoZAP 备份 JSON 文件。");
      }
    } catch(err) {
      alert("导入失败：文件解析错误。");
    }
  };
  reader.readAsText(file);
}

// 清空重置数据库 (已升级为双向同步清空：若开启了云同步，将同步清空 GitHub 云端，防止刷新后从云端重新拉回)
async function resetDatabase() {
  if (!confirm("🚨 警告：这会清空你本地存储的全部健身打卡数据！确定要继续吗？")) {
    return;
  }
  if (!confirm("再一次确认：确定要彻底清除数据吗？（保留您的 API Key 和体重配置，仅清空本地和云端的打卡历史记录）")) {
    return;
  }

  const token = state.settings.githubToken;
  const gistId = state.settings.githubGistId;

  // 1. 把当前本地全部记录 + 待处理的 AI 推荐都写入删除墓碑，防止其他设备把老数据同步回来
  const now = Date.now();
  const tombstones = { ...state.deletedIds };
  (state.workouts || []).forEach(w => { tombstones[w.id] = now; });
  (state.aiRecommendations || []).forEach(r => { tombstones[r.id] = now; });

  // 2. 如果已配置云端同步，必须同步清空 GitHub Gist 云端数据，否则刷新后会自动拉回
  if (token && gistId) {
    const resetBtn = document.querySelector(".settings-card.border-danger .btn-danger");
    if (resetBtn) {
      resetBtn.disabled = true;
      resetBtn.innerHTML = "⌛ 正在同步清空云端...";
    }

    const headers = {
      "Authorization": `token ${token}`,
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json"
    };

    try {
      // 先拉取云端，把云端已有而本地没有的记录/推荐 ID 也一并写入墓碑
      const getResponse = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: "GET",
        headers: headers
      });
      if (getResponse.ok) {
        const gistDetail = await getResponse.json();
        const syncFile = gistDetail.files["chocozap_workouts.json"];
        if (syncFile && syncFile.content) {
          const parsed = parseCloudContent(syncFile.content);
          parsed.workouts.forEach(w => { tombstones[w.id] = now; });
          parsed.recommendations.forEach(r => { tombstones[r.id] = now; });
          Object.keys(parsed.deleted).forEach(id => {
            if (!tombstones[id]) tombstones[id] = parsed.deleted[id];
          });
        }
      }

      const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: "PATCH",
        headers: headers,
        body: JSON.stringify({
          files: {
            "chocozap_workouts.json": {
              "content": JSON.stringify({ workouts: [], recommendations: [], deleted: tombstones }, null, 2)
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error("云端数据更新失败");
      }
    } catch (e) {
      console.error("Failed to clear cloud Gist: ", e);
      alert("⚠️ 清空 GitHub 云端数据失败，将仅清空本地数据。错误: " + e.message);
    }
  }

  // 3. 清空本地历史/推荐并保存墓碑，保持 has_run_before 状态，防止重新加载时写入 mock 数据
  localStorage.setItem("chocozap_workouts", JSON.stringify([]));
  localStorage.setItem("chocozap_ai_recommendations", JSON.stringify([]));
  localStorage.setItem("chocozap_deleted", JSON.stringify(tombstones));
  localStorage.setItem("chocozap_has_run_before", "true");

  // 4. 重新加载页面刷新至最空状态
  location.reload();
}

// 监听窗口尺寸变化，重绘图表确保自适应宽度
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const dashboardView = document.getElementById("view-dashboard");
    if (dashboardView && dashboardView.classList.contains("active")) {
      drawWeeklyChart();
    }
  }, 250);
});

// ==========================================================================
// 9. GitHub Gist 云端自动同步功能 (GitHub Gist Cloud Sync)
// ==========================================================================

// 解析云端 Gist 文件内容：兼容旧版纯数组格式和新版 { workouts, recommendations, deleted } 对象格式
function parseCloudContent(content) {
  let workouts = [];
  let recommendations = [];
  let deleted = {};
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      workouts = parsed;
    } else if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.workouts)) workouts = parsed.workouts;
      if (Array.isArray(parsed.recommendations)) recommendations = parsed.recommendations;
      if (parsed.deleted && typeof parsed.deleted === 'object') deleted = parsed.deleted;
    }
  } catch (e) {
    // 内容损坏时视为空
  }
  return { workouts, recommendations, deleted };
}

// 墓碑保留 180 天后自动清理，防止无限膨胀 (届时所有设备早已同步过删除操作)
const TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

function pruneTombstones(deletedMap) {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  Object.keys(deletedMap).forEach(id => {
    if (!deletedMap[id] || deletedMap[id] < cutoff) delete deletedMap[id];
  });
  return deletedMap;
}

async function syncWithGithub(isSilent = false) {
  const token = state.settings.githubToken;
  let gistId = state.settings.githubGistId;
  
  const syncBtn = document.getElementById("btn-github-sync");
  const statusLabel = document.getElementById("github-sync-status");
  
  if (!token) {
    if (!isSilent) {
      alert("请先在设置中配置您的 GitHub Personal Access Token (PAT)！");
      switchTab('settings');
    }
    return;
  }
  
  // 更新 UI 状态
  if (syncBtn) {
    syncBtn.closest(".settings-action-row").classList.add("syncing");
    syncBtn.disabled = true;
    syncBtn.querySelector("span").textContent = "正在云同步...";
  }
  if (statusLabel) {
    statusLabel.textContent = "正在连接 GitHub...";
    statusLabel.style.color = "var(--text-secondary)";
    statusLabel.style.textShadow = "none";
  }
  
  const headers = {
    "Authorization": `token ${token}`,
    "Accept": "application/vnd.github.v3+json",
    "Content-Type": "application/json"
  };
  
  try {
    // 1. 如果本地没有绑定 Gist ID，先去云端搜索该账号下是否已经有已建好的 ChocoZAP 专属 Gist
    if (!gistId) {
      if (statusLabel) statusLabel.textContent = "正在云端检索已有存储...";
      
      try {
        const gistsResponse = await fetch("https://api.github.com/gists", {
          method: "GET",
          headers: headers
        });
        
        if (gistsResponse.ok) {
          const gists = await gistsResponse.json();
          // 查找是否有名为 "chocozap_workouts.json" 文件的 gist
          const foundGist = gists.find(g => g.files && g.files["chocozap_workouts.json"]);
          
          if (foundGist) {
            gistId = foundGist.id;
            state.settings.githubGistId = gistId;
            localStorage.setItem("chocozap_settings", JSON.stringify(state.settings));
            
            const gistInput = document.getElementById("setting-github-gist-id");
            if (gistInput) gistInput.value = gistId;
            
            if (statusLabel) statusLabel.textContent = "已找到云端已有存储，正在绑定...";
          }
        }
      } catch (err) {
        console.warn("云端检索失败，将尝试直接新建: ", err);
      }
    }

    // 2. 如果云端和本地确实都没有 Gist ID，说明是首次使用，创建全新的 Gist
    if (!gistId) {
      if (statusLabel) statusLabel.textContent = "正在创建全新私有云存储...";
      
      const createResponse = await fetch("https://api.github.com/gists", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          description: "ChocoZAP Workout Tracker Cloud Sync Data",
          public: false,
          files: {
            "chocozap_workouts.json": {
              "content": "[]"
            }
          }
        })
      });
      
      if (!createResponse.ok) {
        throw new Error(`创建 Gist 失败: ${createResponse.statusText} (错误码: ${createResponse.status})`);
      }
      
      const gistData = await createResponse.json();
      gistId = gistData.id;
      
      // 保存本地
      state.settings.githubGistId = gistId;
      localStorage.setItem("chocozap_settings", JSON.stringify(state.settings));
      
      const gistInput = document.getElementById("setting-github-gist-id");
      if (gistInput) gistInput.value = gistId;
      
      if (statusLabel) statusLabel.textContent = "已成功创建并绑定私有云存储！";
    }
    
    // 2. 从云端拉取已存在的数据
    if (statusLabel) statusLabel.textContent = "正在拉取云端健身记录...";
    const getResponse = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: "GET",
      headers: headers
    });
    
    if (getResponse.status === 404) {
      // 说明绑定的 Gist 已经在 GitHub 上被删除了，需要清空本地 ID 并重试
      state.settings.githubGistId = "";
      localStorage.setItem("chocozap_settings", JSON.stringify(state.settings));
      const gistInput = document.getElementById("setting-github-gist-id");
      if (gistInput) gistInput.value = "";
      throw new Error("云端绑定的存储已被删除，已为您重置。请重新点击同步以新建云存储！");
    }
    
    if (!getResponse.ok) {
      throw new Error(`获取云端数据失败: ${getResponse.statusText}`);
    }
    
    const gistDetail = await getResponse.json();
    const syncFile = gistDetail.files["chocozap_workouts.json"];

    let cloudWorkouts = [];
    let cloudRecommendations = [];
    let cloudDeleted = {};
    if (syncFile && syncFile.content) {
      const parsed = parseCloudContent(syncFile.content);
      cloudWorkouts = parsed.workouts;
      cloudRecommendations = parsed.recommendations;
      cloudDeleted = parsed.deleted;
    }

    // 3. 执行无损去重新旧合并
    if (statusLabel) statusLabel.textContent = "正在融合双端记录...";
    const localWorkouts = state.workouts || [];
    const localRecommendations = state.aiRecommendations || [];

    // 先合并双端的删除墓碑 (任意一端删除过的记录/推荐，两端都视为已删除；两者 id 前缀不同不会互相冲突)
    const mergedDeleted = pruneTombstones({ ...cloudDeleted, ...state.deletedIds });

    const mergedMap = new Map();
    // 放入云端数据
    cloudWorkouts.forEach(w => mergedMap.set(w.id, w));
    // 放入本地数据 (本地修改有更高保留优先权)
    localWorkouts.forEach(w => mergedMap.set(w.id, w));
    // 剔除所有已被删除的记录，防止被删记录借合并"复活"
    Object.keys(mergedDeleted).forEach(id => mergedMap.delete(id));

    const mergedList = Array.from(mergedMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date));

    // AI 推荐列表走同样的"按 id 合并 + 墓碑过滤"逻辑，已完成/已拒绝的条目不会被云端旧数据带回来
    const mergedRecMap = new Map();
    cloudRecommendations.forEach(r => mergedRecMap.set(r.id, r));
    localRecommendations.forEach(r => mergedRecMap.set(r.id, r));
    Object.keys(mergedDeleted).forEach(id => mergedRecMap.delete(id));
    const mergedRecList = Array.from(mergedRecMap.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // 更新本地 state 和 localStorage
    state.workouts = mergedList;
    state.aiRecommendations = mergedRecList;
    state.deletedIds = mergedDeleted;
    localStorage.setItem("chocozap_workouts", JSON.stringify(state.workouts));
    localStorage.setItem("chocozap_ai_recommendations", JSON.stringify(state.aiRecommendations));
    localStorage.setItem("chocozap_deleted", JSON.stringify(state.deletedIds));

    // 4. 将合并后的最新数据推回云端 Gist (新格式同时携带记录、AI 推荐和删除墓碑)
    if (statusLabel) statusLabel.textContent = "正在上传备份到云端...";
    const patchResponse = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: "PATCH",
      headers: headers,
      body: JSON.stringify({
        files: {
          "chocozap_workouts.json": {
            "content": JSON.stringify({ workouts: state.workouts, recommendations: state.aiRecommendations, deleted: state.deletedIds }, null, 2)
          }
        }
      })
    });
    
    if (!patchResponse.ok) {
      throw new Error(`上传云端备份失败: ${patchResponse.statusText}`);
    }
    
    // 5. 同步成功，重绘界面与状态
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    if (statusLabel) {
      statusLabel.textContent = `同步成功 (合并后共 ${state.workouts.length} 条记录，于 ${timeStr})`;
      statusLabel.style.color = "var(--neon-green)";
      statusLabel.style.textShadow = "0 0 8px rgba(57, 255, 20, 0.3)";
    }
    
    // 刷新页面渲染
    updateStats();
    renderHistory();
    renderAiRecommendations();

    if (!isSilent) {
      alert("🎉 双端数据云同步成功！打卡记录已无损合并。");
    }
    
  } catch (error) {
    console.error("Gist Sync Error: ", error);
    if (statusLabel) {
      statusLabel.textContent = `同步失败: ${error.message}`;
      statusLabel.style.color = "var(--danger-color)";
      statusLabel.style.textShadow = "none";
    }
    if (!isSilent) {
      alert(`❌ 云同步失败：${error.message}`);
    }
  } finally {
    // 恢复按钮 UI
    if (syncBtn) {
      syncBtn.closest(".settings-action-row").classList.remove("syncing");
      syncBtn.disabled = false;
      syncBtn.querySelector("span").textContent = "立即同步云端数据";
    }
  }
}
