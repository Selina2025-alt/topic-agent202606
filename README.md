# Topic Agent

本项目是一个本地优先的选题与证据管理 Agent。当前实现聚焦 PRD 的 MVP 0 和 MVP 1 骨架：每日候选生成、Triage 工作台、CSV 安全入库、批量确认队列、5 个方向、研究计划、资料包 Markdown、链接回填、反馈日志和可解释规则学习。

## 运行方式

当前机器没有可用 Python，项目使用 Node.js CLI。缺失的通用能力优先安装 GitHub 1k+ stars 的成熟项目作为依赖。

```powershell
node bin/topic-agent.mjs init
node bin/topic-agent.mjs skills audit
node bin/topic-agent.mjs run daily
npm run web:build
npm run web
node bin/topic-agent.mjs intake rss --url https://example.com/feed.xml --limit 10 --write
node bin/topic-agent.mjs batch create --rows 1,2
node bin/topic-agent.mjs directions confirm --project TP-20260615-001 --direction D1
node bin/topic-agent.mjs research run --project TP-20260615-001
node bin/topic-agent.mjs research arxiv --project TP-20260615-001 --query "agent memory" --limit 5 --status pending
```

Windows 下也可以用：

```powershell
.\topic-agent.cmd run daily --dry-run
```

完整安装说明见 [INSTALL.md](INSTALL.md)，配置样例见 [CONFIG_EXAMPLE.md](CONFIG_EXAMPLE.md)，示例数据见 [examples/](examples/)。

## 常用命令

```powershell
node bin/topic-agent.mjs run daily --dry-run
node bin/topic-agent.mjs doctor
node bin/topic-agent.mjs acceptance
node bin/topic-agent.mjs release check
node bin/topic-agent.mjs status
node bin/topic-agent.mjs status --project TP-...
npm run web:build
npm run web
node bin/topic-agent.mjs intake rss --url https://example.com/feed.xml --limit 10
node bin/topic-agent.mjs intake manual --title "一个手动输入的选题" --url https://example.com --summary "为什么值得跟进" --write
node bin/topic-agent.mjs intake file --file .\source.md --title "本地素材里的选题"
node bin/topic-agent.mjs intake hotlist --input .\hotlist.txt --limit 20
node bin/topic-agent.mjs library validate
node bin/topic-agent.mjs library repair
node bin/topic-agent.mjs library format
node bin/topic-agent.mjs library sync-xlsx
node bin/topic-agent.mjs skills audit
node bin/topic-agent.mjs batch create --selected
node bin/topic-agent.mjs batch status
node bin/topic-agent.mjs batch next
node bin/topic-agent.mjs batch summary
node bin/topic-agent.mjs batch pause
node bin/topic-agent.mjs batch resume
node bin/topic-agent.mjs batch skip-current --reason "暂不适合本周栏目"
node bin/topic-agent.mjs batch fail-current --reason "来源不足，先失败上报"
node bin/topic-agent.mjs batch reorder --rows 2,1
node bin/topic-agent.mjs research collect --project TP-... --file .\source.md --title "官方案例" --type official_blog --tier S --status accepted
node bin/topic-agent.mjs research collect --project TP-... --url https://example.com --title "官方案例" --type official_blog --tier S --status accepted
node bin/topic-agent.mjs research arxiv --project TP-... --query "agent memory workflow" --limit 5 --status accepted
node bin/topic-agent.mjs research arxiv --project TP-... --query "tool use agents" --limit 3 --extract-pdf
node bin/topic-agent.mjs research summary-prompt --project TP-... --source S001
node bin/topic-agent.mjs research attach-summary --project TP-... --source S001 --file .\S001_deep_summary.md
node bin/topic-agent.mjs research update-source --project TP-... --source S001 --status rejected --tier D --notes "太泛"
node bin/topic-agent.mjs feedback add --project TP-... --target source:S001 --sentiment negative --text "这个来源太泛"
node bin/topic-agent.mjs feedback add --type source_negative --source S001 --text "这个来源太泛"
node bin/topic-agent.mjs feedback add --project TP-... --target direction:D1 --sentiment positive --text "老板视角更容易被采纳" --pattern "老板视角"
node bin/topic-agent.mjs feedback add --target column:工作流 --sentiment positive --text "工作流类选题应该放 JovaAI 真实场景" --column "JovaAI 真实场景" --pattern "工作流"
node bin/topic-agent.mjs feedback sync
node bin/topic-agent.mjs learn apply
node bin/topic-agent.mjs rules list --type all
node bin/topic-agent.mjs rules disable --type source --rule RULE-FB-001
node bin/topic-agent.mjs rules enable --type source --rule RULE-FB-001
node bin/topic-agent.mjs rules rollback --type source --rule RULE-FB-001
node bin/topic-agent.mjs review weekly
```

## 目录说明

- `data/topic_library.csv`：底层选题库，保留原 10 个业务字段并追加 `分数`；创建时间统一为 `YYYY-MM-DD`。
- `data/topic_library.xlsx`：导出/备份辅助选题库，列宽更宽、自动换行、冻结表头；主交互请使用 Web Triage 工作台。
- `web/`：本地 Triage 工作台前端源码，构建后由 `topic-agent web` 服务。
- `_topic_agent/config/`：配置、来源分级、可解释规则。
- `_topic_agent/config/strategy_rules.yml`、`source_rules.yml`、`column_rules.yml`：可解释学习规则，可通过 `rules list/enable/disable/rollback` 查看、启停和回滚。
- `_topic_agent/config/skill_routes.yml`：把现有 `skills/` 编排到 intake、topic_generation、deep_research、content_shape 等阶段。
- `_topic_agent/config/external_tools.yml`：记录缺失能力由哪些 1k+ stars GitHub 项目补齐。
- `_topic_agent/state/`：批次、`topic_index.json`、`project_index.json`、`triage_decisions.json`、运行历史、反馈日志，以及 `candidate_state_log.jsonl` 候选状态机事件。
- `_topic_agent/daily/`：每日交付 Markdown，以及 `raw_signals_YYYY-MM-DD.json`、`topic_candidates_YYYY-MM-DD.json`、`candidate_state_log_YYYY-MM-DD.json` 快照。
- `_topic_agent/projects/TP-*/`：每个确认选题的独立工作区，包含 `research_plan.md`、`source_index.md`、`source_quality.md`、`rejected_sources.md`、`evidence_items.json`、`evidence_map.md`、`knowledge_base.md` 等资料包产物。
- `_topic_agent/projects/TP-*/archive/`：方向、确认方向、研究计划、证据图和知识库被覆盖前的历史版本。
- `_topic_agent/backups/`：每次写 CSV 前的自动备份。
- `examples/`：可分发 mock data、示例 CSV 和示例项目目录。

## 当前边界

- 已实现本地闭环和资料包骨架。
- 可以用 `npm run web:build` 和 `npm run web` 启动本地 Triage 工作台；工作台读取每日候选，支持采纳、稍后、拒绝、补资料，并把已采纳候选统一创建为 SelectionBatch。
- `run daily` 会同时保存 RawSignal、TopicCandidate 与候选状态机快照，方便追溯每日候选从哪些 skill/信号生成、如何评分去重、是否准备入库。
- CSV 读取支持 UTF-8/UTF-8 BOM/GBK；写回统一为带 BOM 的 UTF-8，并在写入前自动备份。
- `topic_index.json` 保存不写入 CSV 的 `internal_topic_key`，把候选行、项目目录和项目状态串起来，降低手动改 CSV 后的追溯风险。
- 外部搜索当前生成 pending 搜索入口，不假装已经拿到强证据。
- `research collect --type ...` 会按 `source_tiers.yml` 的 S/A/B/C/D 默认分级推断来源等级；也可以用 `--tier` 手动覆盖。
- 可以用 `research collect --url ...` 抓取网页正文，抽取结果会保存到项目的 `raw/article_extracts/`。
- 可以用 `research collect --file ...` 导入本地 Markdown/txt 素材，并标注来源等级与状态。
- 可以用 `intake rss --url ...` 从 RSS/Atom 生成候选选题，默认预览，加 `--write` 才写入 CSV。
- 可以用 `intake manual --title ... --url ... --summary ... --write` 把对话里临时想到的主题或链接转成候选选题；不加 `--write` 只预览，但仍会把原始手动信号记入 `raw_signals.jsonl`。
- 可以用 `intake file --file ...` 把本地 Markdown/txt 素材转成候选选题，用 `intake hotlist --input ...` 批量导入手动整理的热点列表；二者同样默认预览，显式加 `--write` 才入库。
- 可以用 `library repair` 清洗 CSV 字段语义，把 skill 路径移入 `来源`、把真实链接保留在 `关联热点链接/帖子`，并从最新候选回填 `分数`。
- 可以用 `library format` 把 CSV 的创建时间归一为 `YYYY-MM-DD`，清洗字段语义，并生成带列宽、自动换行、分数列和勾选列的 `data/topic_library.xlsx`；这是导出辅助，不再是主确认流程。
- 在 Web Triage 中采纳候选后，系统会把候选写入或匹配到 `topic_library.csv`，将 `是否选题` 标记为 `TRUE`，再由“创建批次”动作统一生成 SelectionBatch。
- YouTube 链接会尝试通过 `youtubei.js` 抽取视频元数据和 transcript；失败时生成字幕占位文件，便于人工补字幕。
- 长 YouTube 或长文资料可以用 `research summary-prompt --project ... --source S001` 生成 `$long-content-deep-summary` 提示文件，再用 `research attach-summary --project ... --source S001` 把最终摘要登记到 `sources.json` 和质检报告。
- 可以用 `research arxiv --project ... --query ...` 从 arXiv Atom API 检索论文，自动写入 `sources.json`、`source_index.md`、`source_quality.md` 和 `raw/paper_summaries/`；加 `--extract-pdf` 会尝试用 `pdfjs-dist` 抽取论文 PDF 正文。
- 可以用 `research update-source ...` 修正来源等级、状态和备注。
- D 级或 rejected 来源会进入项目内 `rejected_sources.md`，并从 `evidence_items.json` 与 `knowledge_base.md` 正文中排除。
- C 级来源只保留为 weak evidence 和原始链接，不进入 `knowledge_base.md` 的核心事实、案例、数据或论文支撑段落。
- 可以用 `feedback add --target direction:D1 --pattern "老板视角"` 把方向/选题偏好沉淀为 `feedback_log.jsonl` 和项目内 `feedback.md`，项目状态会进入 `feedback_collected`。
- 兼容 PRD 里的反馈别名写法，例如 `feedback add --type source_negative --source S001 --text "..."`。
- 可以用 `feedback sync` 从已有 `feedback_log.jsonl` 重建各项目的 `feedback.md`，适合迁移旧数据或修复项目级反馈产物。
- `learn apply` 会把未应用反馈转成可解释规则，并把相关项目推进到 `learning_applied`。
- 可以用 `rules list/enable/disable/rollback` 管理反馈学习生成的可解释规则；修改前会自动备份原规则文件。
- 栏目匹配只在写入 CSV 的 `栏目系列` 字段时读取 `column_rules.yml`，不会参与选题生成、评分或来源权重。
- 可以用 `status [--project TP-...]` 查看当前 active batch/project、资料包产物、来源统计和下一步建议命令。
- 重生成方向、重新确认方向、重建研究计划或知识库时，旧版本会先进入项目内 `archive/`。
- 可以用 `batch reorder --rows 48,42` 重排当前批次中尚未完成的 active/queued 选题；如果当前 active 已经确认方向或进入研究阶段，系统会要求先完成或跳过，避免资料串题。
- 可以用 `batch skip-current --reason "..."` 跳过当前 active 选题并记录原因，最终写入 `batch_summary.md`。
- 可以用 `batch fail-current --reason "..."` 把当前 active 项标记为 `failed_with_report`，自动生成 `failure_report.md` 并继续推进队列。
- `batch_summary.md` 会汇总每个选题的最终状态、确认方向、知识库路径、回填来源、跳过/失败原因，并自动派生策略问题和可写入反馈学习模块的规则建议。
- 可以用 `acceptance` 生成 PRD 第 25 节验收报告，输出 JSON 并写入 `_topic_agent/reviews/acceptance_report_YYYY-MM-DD.md`。
- 可以用 `release check` 检查 GitHub 可分发版本所需的 README、INSTALL、LICENSE、package bin、mock data、CI 和测试入口。
- 当前网页正文抽取优先使用 `@mozilla/readability` + `jsdom`，PDF 抽取使用 `pdfjs-dist`。
- 下一阶段应继续增强跨来源事实对齐、搜索结果排序和自动成稿前的证据质检。

## Skills 与外部能力

已有 `skills/` 会作为 agent 的一等资源使用：

- `aihot`、`follow-builders`、`tech-news-digest`：每日信号与热点来源。
- `huashu-topic-gen`、`huashu-wechat-creation`、`khazix-writer`：选题生成、方向拆分、公众号选题质检。
- `hv-analysis`、`huashu-research`、`huashu-info-search`：深研与竞品/产品/概念研究。
- `long-content-deep-summary`：长 YouTube、播客、文章、书籍、访谈或 transcript 的深度摘要。
- `ljg-paper`、`ljg-paper-river`：论文理解和问题演化线。
- `ljg-rank`、`ljg-think`：深度拆解与本质分析。

缺失能力已按“GitHub 1k+ stars 优先”补为 Node 依赖：

- `@mozilla/readability` / `mozilla/readability`：网页正文抽取。
- `jsdom` / `jsdom/jsdom`：HTML DOM 解析。
- `rss-parser` / `rbren/rss-parser`：RSS/Atom 解析。
- `pdfjs-dist` / `mozilla/pdf.js`：PDF 文本抽取。
- `youtubei.js` / `LuanRT/YouTube.js`：YouTube 元数据和 transcript 尝试提取。

## 验证

```powershell
node tests/smoke.mjs
```

## CI

仓库包含 `.github/workflows/ci.yml`。推送到 `main`/`master` 或打开 PR 时会在 Node.js 20 上运行：

```bash
npm ci
npm test
node bin/topic-agent.mjs doctor
node bin/topic-agent.mjs release check
node bin/topic-agent.mjs acceptance
```
