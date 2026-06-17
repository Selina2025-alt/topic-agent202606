# Topic Agent 安装指南

Topic Agent 是本地优先的 Node.js CLI + Web Triage 工作台。MVP 阶段不需要数据库或 SaaS 后台。

## 环境要求

- Node.js 20+
- npm
- Windows PowerShell、macOS Terminal 或 Linux shell

## 安装

```powershell
npm install
node bin/topic-agent.mjs init
node bin/topic-agent.mjs doctor
node bin/topic-agent.mjs release check
node bin/topic-agent.mjs acceptance
node bin/topic-agent.mjs status
node bin/topic-agent.mjs skills audit
npm run web:build
npm test
```

Windows 下也可以使用包装命令：

```powershell
.\topic-agent.cmd run daily --dry-run
```

## 第一次运行

```powershell
node bin/topic-agent.mjs run daily --dry-run
node bin/topic-agent.mjs run daily
npm run web:build
npm run web
node bin/topic-agent.mjs intake manual --title "一个手动输入的选题" --summary "为什么值得跟进" --write
node bin/topic-agent.mjs library format
node bin/topic-agent.mjs library sync-xlsx
node bin/topic-agent.mjs batch create --selected
node bin/topic-agent.mjs batch create --rows 1,2
node bin/topic-agent.mjs batch reorder --rows 2,1
node bin/topic-agent.mjs directions confirm --project TP-YYYYMMDD-001 --direction D1
node bin/topic-agent.mjs research run --project TP-YYYYMMDD-001
```

## 可选配置

复制 `.env.example` 为 `.env` 后按需填写。当前核心流程不要求 API key；外部搜索、通知或未来自动化能力才需要环境变量。

## 目录约定

- `data/topic_library.csv`：底层选题库，创建时间统一为 `YYYY-MM-DD`。
- `data/topic_library.xlsx`：导出/备份辅助选题库，主交互使用 Web Triage 工作台。
- `web/`：本地 Triage 工作台前端源码。
- `skills/`：项目内可用 skills。
- `_topic_agent/state/triage_decisions.json`：候选采纳、拒绝、稍后和补资料决策状态。
- `_topic_agent/config/`：策略、来源、技能路由和外部工具配置。
- `_topic_agent/projects/`：每个确认选题的资料包。
- `_topic_agent/backups/`：写 CSV 或规则文件前的备份。
- `examples/`：示例 CSV、mock 数据和示例项目。

## 验证

```powershell
npm test
npm run web:build
node bin/topic-agent.mjs doctor
node bin/topic-agent.mjs release check
node bin/topic-agent.mjs acceptance
node bin/topic-agent.mjs status
node bin/topic-agent.mjs library validate
node bin/topic-agent.mjs run daily --dry-run
node bin/topic-agent.mjs review weekly
```

GitHub 分发时，`.github/workflows/ci.yml` 会运行同一组核心检查：`npm test`、`web:build`、`doctor`、`release check` 和 `acceptance`。
