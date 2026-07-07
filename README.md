# ChocoZAP Tracker 🍫⚡

一个专为 chocoZAP 便利健身房设计的健身打卡网页应用。纯前端实现（HTML/CSS/JS），无需后端，可直接部署在 GitHub Pages 上，数据保存在浏览器本地，并可选配 GitHub Gist 云同步实现多设备互通。

## ✨ 功能特性

- **快速打卡**：内置 chocoZAP 常见器材（腿举、肩推、胸推、牧师椅、动感单车、跑步机、仰卧起坐、按摩椅），也支持自定义项目
- **智能默认值**：每个项目自动带出你上次的训练参数（重量/次数/组数），打卡只需几秒
- **补记功能**：打卡时可选择过去的日期，漏打的卡也能补上
- **卡路里估算**：跑步机项目基于 ACSM 公式，结合体重、速度、坡度实时估算距离与热量消耗
- **数据仪表盘**：连续打卡天数（Streak）、累计次数、今日目标进度环、近 7 天运动频次折线图
- **历史记录**：按日期分组浏览全部打卡，支持按项目筛选、删除单条记录
- **AI 健身教练**：
  - 配置 Gemini API Key 后可直接在应用内对话，AI 会结合你的打卡历史给出建议
  - 也可一键打包健身数据为 Prompt，粘贴到任意 AI 网页端使用（免 API Key）
- **GitHub Gist 云同步**：用你自己的 GitHub 账号作为免费私有云存储，手机/电脑数据自动合并同步，删除操作也会正确同步（墓碑机制，不会被另一台设备"复活"）
- **备份与迁移**：一键导出/导入 JSON 备份（已自动剔除 API Key 和 GitHub Token 等敏感信息）

## 🚀 部署

本项目是纯静态页面，推荐用 GitHub Pages：

1. Fork 或克隆本仓库
2. 仓库 Settings → Pages → 选择部署分支（如 `main`）
3. 访问 `https://<你的用户名>.github.io/chocozap-tracker/`

也可以直接双击 `index.html` 在本地浏览器打开使用。

> 注意：修改代码后需要 push 到 Pages 绑定的分支，GitHub 会自动重新部署（约 1-2 分钟生效）。

## ☁️ 云同步配置（可选）

1. 在 GitHub [创建一个 Personal Access Token](https://github.com/settings/tokens)，只需勾选 `gist` 权限
2. 打开应用「设置」页，粘贴 Token 并点击「立即同步云端数据」
3. 应用会自动创建一个私有 Gist 作为云存储，并绑定 Gist ID
4. 在另一台设备上填入同一个 Token，同步时会自动找到并绑定同一个 Gist

## 🤖 AI 教练配置（可选）

1. 在 [Google AI Studio](https://aistudio.google.com/apikey) 免费申请 Gemini API Key
2. 打开应用「设置」页粘贴 Key，即可在「AI教练」页直接对话

API Key 仅保存在你的浏览器 localStorage 中，不会上传到任何服务器，也不会包含在导出的备份文件里。

## 📁 项目结构

```
├── index.html   # 页面结构（五个页签：主页 / 打卡 / 历史 / AI教练 / 设置）
├── style.css    # 深色玻璃拟态风格样式
├── app.js       # 全部应用逻辑（本地存储、统计、云同步、AI 对接）
└── README.md
```

## 📝 数据格式

- 本地存储：`localStorage` 的 `chocozap_workouts`（打卡记录）、`chocozap_deleted`（删除墓碑）、`chocozap_settings`（配置）
- 云端 Gist 文件 `chocozap_workouts.json`：`{ "workouts": [...], "deleted": {...} }`（兼容读取旧版纯数组格式）
- 所有日期均按**用户本地时区**记录为 `YYYY-MM-DD`
