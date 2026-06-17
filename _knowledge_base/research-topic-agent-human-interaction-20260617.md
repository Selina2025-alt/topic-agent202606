# 选题 Agent 人机交互形态调研笔记

调研日期：2026-06-17

调研目标：寻找比“表格勾选”更适合选题 Agent 的人机协作界面，包括卡片、问答、队列、看板、审核流和洞察管理模式。

## 关键问题

1. 类似内容选题、研究管理、需求管理、标注审核的平台如何让用户快速筛选、确认、推进候选项？
2. 哪些交互形态比表格更适合“AI 给候选，人来判断”的流程？
3. 对本项目的选题库、确认批次、深研资料包，应该保留哪些数据结构，前端改成什么体验？

## 发现

### 1. Airtable / Notion：同一份数据，多种人用视图

- Airtable Interface Designer 的核心观点是：即使底层数据组织得很好，对最终用户来说直接看完整数据层仍然繁琐；界面应该把数据切成小块，让个人或小组只处理自己需要的部分。常见场景包括待审核条目、数据看板、按用户过滤的记录、状态更新、审批和协作。
- Notion database views 也是同一逻辑：一份数据库可以同时用 table、list、board、gallery、calendar、timeline 等视图展示；每张 card 本身又是一个页面，可以承载更完整的内容。
- 对本项目启发：不要把 `topic_library.csv` 当作主要人机界面。它可以继续当底层数据；用户应看到“今日候选卡片”“待确认队列”“栏目/状态看板”“单条详情页”。

### 2. Trello / Linear：先有收件箱/队列，再决定进入工作流

- Trello 的基本模型是 board/list/card：board 承载项目，list 表示阶段，card 表示一个任务或想法，card 内可放链接、附件、清单、到期时间等上下文。
- Linear 的 Triage 是更接近本项目的模式：外部或集成创建的新 issue 先进入一个特殊 inbox，团队在进入正式工作流前先 review、update、prioritize；动作很明确：accept、duplicate、decline、snooze。这个比“表格里勾选多行”更像选题确认。
- 对本项目启发：选题 Agent 应有一个“候选收件箱”。每张选题卡只暴露 4 个主动作：采纳、稍后、拒绝、要求补资料。采纳后再进入 SelectionBatch。

### 3. Productboard / Dovetail：AI 先关联和提炼，人来验证与沉淀

- Productboard AI 自动把反馈 insight 关联到 feature，但新关联默认未验证，需要 maker 手动 verify；也支持批量勾选多个 auto-link 后验证。
- Productboard 的 prioritization workflow 强调把优先级标准显性化，而不是只靠一个选中/未选中字段。
- Dovetail/GitLab 的研究知识库模式强调把研究发现做成可搜索、简洁、易引用的 insight，并让报告/文档直接连接到原始数据和 highlights。
- 对本项目启发：每个候选选题卡应该显示“为什么推荐”“证据强度”“来源/原文”“Agent 的不确定点”，用户的操作不只是是否选题，还应能反馈“理由不成立”“来源太弱”“角度可做但要换栏目”。

### 4. Label Studio / Argilla：单条审核面板比表格更适合 AI 输出校验

- Label Studio 有 Data Manager 用来筛选、排序、批量管理任务，但真正标注/审核是在定制化的 labeling interface 里完成；还可以隐藏/显示预测、结果面板、控件。
- Label Studio 的 review workflow 面向“模型预测或多人标注后的质量确认”，目标是防止低质量标注进入训练数据。
- Argilla Feedback Dataset 的记录卡展示待评估字段，右侧是问题表单；默认看 pending records，通过 Prev/Next 前后切换，并支持搜索过滤。问题可以是单选、多选等。
- 对本项目启发：选题筛选可以做成“单条候选审核器”：左侧是选题内容和来源，右侧是固定问题：是否采纳、优先级、栏目、补充要求、拒绝原因。这样比表格复选框更适合训练 Agent 偏好。

## 初步交互候选方案

### A. 候选卡片流

形态：今日候选以卡片呈现，每张卡显示标题、栏目、来源、核心观点、推荐理由、风险和证据强度。

动作：采纳 / 稍后 / 拒绝 / 补资料。

优点：最符合“快速选题”的心理模型；比表格更好扫读。

缺点：批量操作弱，需要配合多选模式。

### B. Triage 收件箱

形态：所有候选先进入 `待审核`，动作后进入 `已采纳`、`稍后再看`、`已拒绝`、`需补资料`。

动作：键盘快捷键或按钮：1 采纳、2 稍后、3 拒绝、4 补资料。

优点：最像 Linear，对“AI 每天吐一批候选，人类把关”很自然。

缺点：需要维护状态机，但本项目已有 TopicCandidate/SelectionBatch 状态基础。

### C. 看板

形态：按状态分列：今日候选、待补证据、已采纳、深研中、已完成、已拒绝。卡片可拖拽。

优点：能看到整个生产链路；适合管理多选题。

缺点：单张卡信息可能太少，需要详情抽屉。

### D. 单条问答审核器

形态：一次只看一个候选，Agent 问：“这个要不要做？”用户点选或自然语言回答。随后追问栏目、角度、补资料要求。

优点：训练 Agent 最好；低负担；可把用户理由沉淀成反馈规则。

缺点：扫大量候选效率比卡片墙低。

### E. 双层界面：卡片总览 + 右侧详情审核

形态：左侧是候选列表/卡片，中间或右侧是当前候选详情，右侧底部是决策面板。

优点：综合最好。既能批量浏览，又能对单条做高质量判断。

缺点：比纯卡片实现略复杂。

## 阶段摘要

### 阶段摘要（第 1 轮）

最值得借鉴的不是“Excel 真复选框”，而是四个产品模式的组合：

1. Airtable/Notion 的“底层结构化数据 + 多视图”。
2. Linear 的“候选先进入 Triage，再接受/拒绝/挂起”。
3. Productboard/Dovetail 的“AI 自动提炼/关联，人类验证，反馈变成知识”。
4. Label Studio/Argilla 的“单条记录审核面板 + 明确问题表单”。

对选题 Agent 来说，推荐不要继续把 Excel 当主界面。更好的 v1 应该是一个本地 Web UI：`Triage 卡片流 + 详情抽屉 + 四个决策动作 + 反馈理由输入`。CSV/xlsx 保留为导出和备份层。

## 来源列表

| 来源 | URL | 发布/访问日期 | 可信度 |
|---|---|---|---|
| Airtable Interface Designer | https://support.airtable.com/docs/getting-started-with-airtable-interface-designer | 2026-06-17 访问 | 高 |
| Notion database views | https://www.notion.com/help/guides/using-database-views | 2026-06-17 访问 | 高 |
| Notion board view | https://www.notion.com/help/boards | 2026-06-17 访问 | 高 |
| Linear Triage | https://linear.app/docs/triage | 2026-06-17 访问 | 高 |
| Trello 101 | https://trello.com/guide/trello-101 | 2026-06-17 访问 | 高 |
| Productboard AI auto-linking | https://support.productboard.com/hc/en-us/articles/26949590820627-Link-insights-automatically-with-Productboard-AI | 2026-06-17 访问 | 高 |
| Productboard Grid prioritization | https://support.productboard.com/hc/en-us/articles/29979937953811-Quick-start-guide-Grid-prioritization | 2026-06-17 访问 | 高 |
| Label Studio labeling interface | https://labelstud.io/guide/labeling/ | 2026-06-17 访问 | 高 |
| Label Studio Data Manager | https://labelstud.io/guide/manage_data | 2026-06-17 访问 | 高 |
| Label Studio review workflow | https://docs.humansignal.com/guide/quality | 2026-06-17 访问 | 高 |
| Argilla Feedback Dataset | https://docs.v1.argilla.io/en/v1.10.0/guides/llms/practical_guides/create_dataset.html | 2026-06-17 访问 | 高 |
| Argilla annotation UI notes | https://github.com/argilla-io/argilla/blob/develop/docs/_source/practical_guides/annotate_dataset.md | 2026-06-17 访问 | 中-高 |
| Dovetail docs | https://docs.dovetail.com/help/docs | 2026-06-17 访问 | 高 |
| GitLab Dovetail handbook | https://handbook.gitlab.com/handbook/product/ux/dovetail/ | 2026-06-17 访问 | 中-高 |
