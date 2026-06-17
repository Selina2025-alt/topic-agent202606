---
name: topic-agent
description: 本地选题与证据管理 Agent。用户说“今天跑一次选题”“打开选题工作台”“Triage 候选”“格式化选题库”“我在表格里勾选好了”“确认第 X 行”“我勾选了第 X、Y、Z 行”“选方向 D1”“开始深研”“回填链接”“记录反馈”“复盘这周选题”时，优先调用本项目的 topic-agent CLI。
---

# Topic Agent Skill

这是 `topic-agent` 的本地对话入口说明。使用时把自然语言映射为 CLI 命令，不自动跳过用户确认节点。

## 意图映射

| 用户表达 | CLI |
|---|---|
| 看看技能怎么安排 | `node bin/topic-agent.mjs skills audit` |
| 现在进度到哪了 / 下一步做什么 | `node bin/topic-agent.mjs status` |
| 验收 PRD / 看还差什么 | `node bin/topic-agent.mjs acceptance` |
| 今天跑一次选题 | `node bin/topic-agent.mjs run daily` |
| 打开选题工作台 / Triage 候选 | `npm run web:build`，然后 `npm run web` |
| 从 RSS 导入候选 | `node bin/topic-agent.mjs intake rss --url <feed-url> --limit 10 --write` |
| 我想到一个选题 / 这个链接也加入候选 | `node bin/topic-agent.mjs intake manual --title "..." --url <url> --summary "..." --write` |
| 把本地 Markdown/txt 素材转成候选 | `node bin/topic-agent.mjs intake file --file <path> --write` |
| 导入手动整理的热点列表 | `node bin/topic-agent.mjs intake hotlist --input <path> --limit 20 --write` |
| 生成今天的选题但不要写入 | `node bin/topic-agent.mjs run daily --dry-run` |
| 格式化选题库 / 看不完整 / 列宽换行 | `node bin/topic-agent.mjs library format` |
| 我在表格里勾选好了 | `node bin/topic-agent.mjs library sync-xlsx`，然后 `node bin/topic-agent.mjs batch create --selected` |
| 我确认第 42 行 | `node bin/topic-agent.mjs batch create --rows 42` |
| 我勾选了第 42、45、48 行 | `node bin/topic-agent.mjs batch create --rows 42,45,48` |
| 继续处理这批的下一个 | `node bin/topic-agent.mjs batch next` |
| 重新生成这批总结 | `node bin/topic-agent.mjs batch summary` |
| 暂停这批选题 | `node bin/topic-agent.mjs batch pause` |
| 跳过当前选题 | `node bin/topic-agent.mjs batch skip-current` |
| 当前选题失败上报 | `node bin/topic-agent.mjs batch fail-current --reason "..."` |
| 这批先做第 48 行，再做第 42 行 | `node bin/topic-agent.mjs batch reorder --rows 48,42` |
| 给这个选题 5 个方向 | `node bin/topic-agent.mjs directions generate --project <id>` |
| 选方向 D3 | `node bin/topic-agent.mjs directions confirm --project <id> --direction D3` |
| 方向 D3 更偏老板视角 | `node bin/topic-agent.mjs directions refine --project <id> --direction D3 --instruction "更偏老板视角"` |
| 开始深研 | `node bin/topic-agent.mjs research run --project <id>` |
| 导入官方案例链接 | `node bin/topic-agent.mjs research collect --project <id> --url <url> --type official_blog --tier S --status accepted` |
| 导入 YouTube 链接 | `node bin/topic-agent.mjs research collect --project <id> --url <youtube-url> --type youtube --tier A --status pending` |
| 给长视频生成深度摘要提示 | `node bin/topic-agent.mjs research summary-prompt --project <id> --source S001` |
| 登记已完成的深度摘要 | `node bin/topic-agent.mjs research attach-summary --project <id> --source S001 --file <summary.md>` |
| 查 arXiv/找论文 | `node bin/topic-agent.mjs research arxiv --project <id> --query "<关键词>" --limit 5 --status pending` |
| 抽取论文 PDF | `node bin/topic-agent.mjs research arxiv --project <id> --query "<关键词>" --limit 3 --extract-pdf` |
| 导入本地素材文件 | `node bin/topic-agent.mjs research collect --project <id> --file <path> --title "..." --tier A --status accepted` |
| 标记来源不采用 | `node bin/topic-agent.mjs research update-source --project <id> --source S001 --status rejected --tier D --notes "..."` |
| 这个来源不靠谱 | `node bin/topic-agent.mjs feedback add --project <id> --target source:S001 --sentiment negative --text "..."` |
| 按 PRD 旧写法记录来源负反馈 | `node bin/topic-agent.mjs feedback add --type source_negative --source S001 --text "..."` |
| 老板视角这种方向以后多来点 | `node bin/topic-agent.mjs feedback add --project <id> --target direction:D1 --sentiment positive --text "..." --pattern "老板视角"` |
| 栏目匹配错了 | `node bin/topic-agent.mjs feedback add --target column:<匹配关键词> --sentiment positive --text "..." --column "<正确栏目>" --pattern "<匹配关键词>"` |
| 同步旧反馈到项目 | `node bin/topic-agent.mjs feedback sync` |
| 查看学习规则 | `node bin/topic-agent.mjs rules list --type all` |
| 禁用某条规则 | `node bin/topic-agent.mjs rules disable --type source --rule <rule-id>` |
| 回滚某条规则 | `node bin/topic-agent.mjs rules rollback --type source --rule <rule-id>` |
| 复盘这周选题 | `node bin/topic-agent.mjs review weekly` |

## 硬约束

- 用户主动确认行号后，才创建批次。
- 批次内一次只推进一个 active 项目。
- 内部状态必须维护 `topic_index.json` 和 `project_index.json`，不要只依赖 CSV 行号追溯项目。
- 重生成方向、重选方向、重建研究计划或知识库前必须让旧版本进入项目 `archive/`。
- `母选题ID` 和 `是否选题` 入库阶段保持空；主确认流程使用 Web Triage，采纳后写入 `triage_decisions.json` 并将 CSV `是否选题` 标记为 `TRUE`。Excel 仅作导出辅助。
- 写 CSV 前必须备份。
- `column_rules.yml` 只用于写 CSV 的 `栏目系列`，不得进入选题评分或来源权重。
- pending 搜索链接不能当成强证据。
- C 级来源只能作为 weak evidence 和原始链接，不能写进知识库核心事实。
- D 级或 rejected 来源必须进入 `rejected_sources.md`，不得进入 `knowledge_base.md` 正文。
- 长 YouTube transcript 或长内容摘要应先用 `long-content-deep-summary` 生成，再用 `research attach-summary` 登记后进入知识库判断。
- 用户反馈必须进入 `feedback_log.jsonl`，再由 `learn apply` 生成可解释规则。
- 规则必须可查看、可禁用、可回滚；修改规则文件前必须自动备份。
- 优先使用 `skills/` 里已有能力；缺失通用能力使用 1k+ stars GitHub 项目安装的 Node 依赖。
