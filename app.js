// ChocoZAP Pro - Local Workout Tracker Logic

// ==========================================================================
// 1. 初始化状态与本地存储 (Data Initialization)
// ==========================================================================
let state = {
  workouts: [],
  settings: {
    weight: 70,
    apiKey: '',
    apiModel: 'gemini-2.5-flash'
  },
  chatHistory: []
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
  // 设置顶部日期展示
  const d = new Date();
  const dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  document.getElementById("current-date").textContent = dateStr;

  loadData();
  setupEventListeners();
  
  // 渲染各项页面数据
  updateStats();
  renderHistory();
  
  // 默认启动估算值计算
  updateCalorieEstimate();

  // 如果配置了 GitHub Token，开机进行一次静默云同步，拉取最新记录
  if (state.settings.githubToken) {
    syncWithGithub(true);
  }
});

// 从 LocalStorage 加载数据
function loadData() {
  const hasRunBefore = localStorage.getItem("chocozap_has_run_before");
  const storedWorkouts = localStorage.getItem("chocozap_workouts");
  const storedSettings = localStorage.getItem("chocozap_settings");
  
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

// 辅助函数：生成过去某一天的 YYYY-MM-DD 字符串
function getPastDateString(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
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
      } else {
        document.getElementById("input-weight").value = 50;
        document.getElementById("input-reps").value = 12;
        document.getElementById("input-sets").value = 3;
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
      } else {
        document.getElementById("input-weight").value = 20;
        document.getElementById("input-reps").value = 10;
        document.getElementById("input-sets").value = 3;
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
      } else {
        document.getElementById("input-weight").value = 30;
        document.getElementById("input-reps").value = 12;
        document.getElementById("input-sets").value = 3;
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
      } else {
        document.getElementById("input-weight").value = 15;
        document.getElementById("input-reps").value = 12;
        document.getElementById("input-sets").value = 3;
      }
      break;
      
    case 'situps':
      formTitle.textContent = "仰卧起坐 (Sit-ups)";
      formBadge.textContent = "腰腹核心";
      document.getElementById("group-situps").style.display = "block";
      if (lastWorkout && lastWorkout.details) {
        document.getElementById("input-situps-reps").value = lastWorkout.details.reps;
        document.getElementById("input-situps-sets").value = lastWorkout.details.sets;
      } else {
        document.getElementById("input-situps-reps").value = 15;
        document.getElementById("input-situps-sets").value = 3;
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
  
  // 1. 距离计算: Speed(km/h) * Time(min) / 60
  const distance = speed * (time / 60);
  document.getElementById("est-distance").innerHTML = `${distance.toFixed(2)} <small>km</small>`;
  
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
  document.getElementById("est-calories").innerHTML = `${calories} <small>kcal</small>`;
  
  return { distance: parseFloat(distance.toFixed(2)), calories: calories };
}

// ==========================================================================
// 4. 保存运动记录 (Save Log)
// ==========================================================================
function saveWorkout(event) {
  event.preventDefault();
  
  const type = document.getElementById("input-exercise-type").value;
  if (!type) return;
  
  const notes = document.getElementById("input-notes").value.trim();
  const dateToday = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  let details = {};
  
  // 提取对应表单参数
  if (['leg_press', 'shoulder_press', 'chest_press', 'preacher_curl'].includes(type)) {
    details = {
      weight: parseFloat(document.getElementById("input-weight").value) || 0,
      reps: parseInt(document.getElementById("input-reps").value) || 0,
      sets: parseInt(document.getElementById("input-sets").value) || 0
    };
  } else if (type === 'situps') {
    details = {
      reps: parseInt(document.getElementById("input-situps-reps").value) || 0,
      sets: parseInt(document.getElementById("input-situps-sets").value) || 0
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
  
  // 构建单条 Workout 对象
  const newWorkout = {
    id: "workout-" + Date.now(),
    date: dateToday,
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
    localStorage.setItem("chocozap_workouts", JSON.stringify(state.workouts));
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
  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = getPastDateString(1);
  
  if (workoutDates.length > 0) {
    const newestDate = workoutDates[0];
    
    // 如果最新打卡日期既不是今天也不是昨天，说明连续已经断了
    if (newestDate === todayStr || newestDate === yesterdayStr) {
      streak = 1;
      let checkDate = new Date(newestDate);
      
      for (let i = 1; i < workoutDates.length; i++) {
        // 前一天
        checkDate.setDate(checkDate.getDate() - 1);
        const expectedDateStr = checkDate.toISOString().split('T')[0];
        
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
    const dateStr = d.toISOString().split('T')[0];
    
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
  
  sortedDates.forEach(dateStr => {
    // 转换日期语义化 (如 今天 / 昨天)
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayStr = getPastDateString(1);
    
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
          stats = `${item.details.weight}kg × ${item.details.reps}次 × ${item.details.sets}组`;
          break;
        case 'shoulder_press':
          icon = "💪";
          title = "肩推 (Shoulder Press)";
          stats = `${item.details.weight}kg × ${item.details.reps}次 × ${item.details.sets}组`;
          break;
        case 'chest_press':
          icon = "🏋️";
          title = "胸推 (Chest Press)";
          stats = `${item.details.weight}kg × ${item.details.reps}次 × ${item.details.sets}组`;
          break;
        case 'preacher_curl':
          icon = "🧘";
          title = "牧师椅 (Preacher Curl)";
          stats = `${item.details.weight}kg × ${item.details.reps}次 × ${item.details.sets}组`;
          break;
        case 'situps':
          icon = "🧗";
          title = "仰卧起坐 (Sit-ups)";
          stats = `${item.details.reps}次 × ${item.details.sets}组`;
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
  
  let prompt = `你是一位专业且充满亲和力的 ChocoZAP 健身私人教练。请为我分析我最近的运动成果并提供针对性建议。

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
        situps: "仰卧起坐 (核心)",
        spin_bike: "动感单车 (有氧)",
        treadmill: "跑步机 (有氧)",
        massage_chair: "按摩椅放松 (拉伸)",
        custom: "自定义项目"
      }[w.type] || "其他";
      
      let detailsStr = "";
      if (['leg_press', 'shoulder_press', 'chest_press', 'preacher_curl'].includes(w.type)) {
        detailsStr = `${w.details.weight}kg x ${w.details.reps}次 x ${w.details.sets}组`;
      } else if (w.type === 'situps') {
        detailsStr = `${w.details.reps}次 x ${w.details.sets}组`;
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
3. 从脂肪燃烧、肌肉增长或体能改善的角度，给我推荐一套接下来两周在 ChocoZAP 器材上的健身动作顺序和强度建议。
4. 结合我的体重，指出有氧运动中热量消耗效率的表现。

请用极其鼓励的口吻回答我，排版美观，使用 emoji 增加活力！`;

  return prompt;
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

// 模式 A: API 直连对话
async function sendChatMessage() {
  const chatInput = document.getElementById("chat-input");
  const userText = chatInput.value.trim();
  if (!userText) return;
  
  const apiKey = state.settings.apiKey;
  const model = state.settings.apiModel || 'gemini-2.5-flash';
  
  // 1. 将用户的提问呈现在 UI 聊天框中
  appendMessage("user", "你", userText);
  chatInput.value = "";
  
  // 2. 检测 API Key 是否配置
  if (!apiKey) {
    setTimeout(() => {
      appendMessage("ai", "Gemini Coach", `未检测到您的 API Key。
      
我已经将您的最近健身打卡数据与刚才的提问打包。请点击输入框上方的“**打包健身数据**”按钮直接复制，在网页端 Gemini/ChatGPT 提问即可！
当然，如果您希望在应用内获得直连的丝滑对话，可以在“设置”页面中输入您的 Gemini API Key。`);
    }, 600);
    return;
  }
  
  // 3. 构建发送给 API 的完整系统设定 + 健身记录 + 用户当前问题
  const gymDataPrompt = generateWorkoutSummaryPrompt();
  const apiMessageContext = `
【健身顾问系统指令与背景】
${gymDataPrompt}

【注意】上面是我的历史记录，下面是我的最新提问。请结合上面的历史记录（如果相关）回答我的问题。
用户提问："${userText}"
`;

  // 4. 显示 AI 正在思考 (Typing...)
  const tempBubbleId = appendMessage("ai", "Gemini Coach", "正在思考中，请稍候...", true);
  
  try {
    // Google Gemini API Beta 直连请求
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: apiMessageContext }]
          }
        ],
        // 可选：添加一些参数稳定输出
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1500
        }
      })
    });
    
    const data = await response.json();
    
    // 移除正在思考的临时泡泡
    removeMessage(tempBubbleId);
    
    if (response.ok && data.candidates && data.candidates[0].content.parts[0].text) {
      const replyText = data.candidates[0].content.parts[0].text;
      appendMessage("ai", "Gemini Coach", replyText);
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

// 辅助：向 UI 添加对话气泡
function appendMessage(sender, senderName, text, isPending = false) {
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

// 导出所有数据为 JSON 下载 (已剥离敏感 API Key 并确保安全传输)
function exportData() {
  // 深度复制设置，并剔除敏感的 apiKey
  const settingsToExport = { ...state.settings };
  delete settingsToExport.apiKey;

  const dataStr = JSON.stringify({
    version: "1.0",
    workouts: state.workouts,
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
        // 放入导入的历史记录
        importedWorkouts.forEach(w => mergedMap.set(w.id, w));
        // 放入本地已有的记录 (若有冲突，本地最新记录优先)
        localWorkouts.forEach(w => mergedMap.set(w.id, w));
        
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

  // 1. 如果已配置云端同步，必须发送请求清空 GitHub Gist 云端数据，否则刷新后会自动拉回
  if (token && gistId) {
    const resetBtn = document.querySelector(".settings-card.border-danger .btn-danger");
    const originalText = resetBtn ? resetBtn.innerHTML : "";
    if (resetBtn) {
      resetBtn.disabled = true;
      resetBtn.innerHTML = "⌛ 正在同步清空云端...";
    }

    try {
      const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: "PATCH",
        headers: {
          "Authorization": `token ${token}`,
          "Accept": "application/vnd.github.v3+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          files: {
            "chocozap_workouts.json": {
              "content": "[]"
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

  // 2. 清空本地历史，并保持 has_run_before 状态，防止重新加载时写入 mock 数据
  localStorage.setItem("chocozap_workouts", JSON.stringify([]));
  localStorage.setItem("chocozap_has_run_before", "true");
  
  // 3. 重新加载页面刷新至最空状态
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
    // 1. 如果没有 Gist ID，先在云端全自动创建私有 Gist
    if (!gistId) {
      if (statusLabel) statusLabel.textContent = "正在创建私有云存储...";
      
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
    if (syncFile && syncFile.content) {
      try {
        cloudWorkouts = JSON.parse(syncFile.content);
      } catch (e) {
        cloudWorkouts = [];
      }
    }
    
    // 3. 执行无损去重新旧合并
    if (statusLabel) statusLabel.textContent = "正在融合双端记录...";
    const localWorkouts = state.workouts || [];
    const mergedMap = new Map();
    
    // 放入云端数据
    cloudWorkouts.forEach(w => mergedMap.set(w.id, w));
    // 放入本地数据 (本地修改有更高保留优先权)
    localWorkouts.forEach(w => mergedMap.set(w.id, w));
    
    const mergedList = Array.from(mergedMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // 更新本地 state 和 localStorage
    state.workouts = mergedList;
    localStorage.setItem("chocozap_workouts", JSON.stringify(state.workouts));
    
    // 4. 将合并后的最新数据推回云端 Gist
    if (statusLabel) statusLabel.textContent = "正在上传备份到云端...";
    const patchResponse = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: "PATCH",
      headers: headers,
      body: JSON.stringify({
        files: {
          "chocozap_workouts.json": {
            "content": JSON.stringify(state.workouts, null, 2)
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
      statusLabel.textContent = `同步成功 (于 ${timeStr})`;
      statusLabel.style.color = "var(--neon-green)";
      statusLabel.style.textShadow = "0 0 8px rgba(57, 255, 20, 0.3)";
    }
    
    // 刷新页面渲染
    updateStats();
    renderHistory();
    
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
