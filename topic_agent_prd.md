# 选题 Agent PRD v0.4.1（批量勾选队列版）

版本：v0.4.1  
日期：2026-06-15  
运行形态：本地优先；无 UI；通过 Codex / Claude Code / Cursor 等 coding 工具的对话框使用；支持每日自动运行；MVP 完成后可推送 GitHub 供他人安装。  
产品定位：选题与证据管理 Agent，而不是全自动内容生产 Agent。  
核心目标：每天稳定发现值得进入选题库的母选题；用户可以一次确认一个或多个选题；Agent 必须把已确认选题进入队列，并逐个推进为有方向、有研究计划、有资料、有证据、有来源、有反馈记忆的内容资产，直到队列全部完成。

---

## 0. v0.4.1 相比 v0.4 的关键变化

v0.4.1 在 v0.4 工程可落地版基础上，补充“批量勾选后的串行队列处理机制”。核心变化如下：

1. **收缩 MVP 范围**  
   先跑通「每日入库 → 用户确认 → 生成方向 → 深研资料包 → 链接回填 → 反馈学习」这个闭环，不一开始追求所有外部搜索、所有视频平台、所有论文源都自动化。

2. **明确模块边界**  
   系统拆为 7 个核心模块：
   - Topic Intake Layer：信号采集层
   - Topic Strategy Engine：选题策略引擎
   - Topic Library Writer：选题库写入器
   - Selection Queue Manager：批量确认队列管理器
   - Selected Topic Workspace：确认选题工作区
   - Research & Evidence Engine：研究与证据引擎
   - Feedback & Learning Engine：反馈与学习引擎

3. **把内容规划文档降级为 Column Matcher**  
   内容规划文档只能用于写入选题库时的「栏目系列」初步匹配。它不得影响选题生成、选题评分、选题优先级、每日采集源权重。

4. **补充数据模型、状态机、评分规则、来源分级、验收标准**  
   Codex 开发时必须先实现这些底层结构，再接复杂外部搜索。

5. **成长机制从“黑盒学习”改为“可解释规则学习”**  
   用户反馈先沉淀为 `strategy_rules.yml`、`source_rules.yml`、`feedback_log.jsonl`，不做不可解释的模型自学习。

6. **CSV 不再承担全部系统状态**  
   CSV 是用户可见的选题库；内部状态由 `_topic_agent/state` 和 `_topic_agent/projects` 管理，防止用户手动改 CSV 后系统失控。

7. **新增批量勾选队列机制**  
   用户可能一次在选题库里勾选多个选题。Agent 不应把多个选题混在一起深研，而应创建 `SelectionBatch` 队列，按顺序对每个选题执行「生成方向 → 用户确认方向 → 深研 → 建知识库 → 链接回填 → 反馈」完整流程；当前选题完成后再进入下一个，直到全部勾选选题处理完成。

---

## 1. 一句话定义

选题 Agent 是一个本地运行的对话式选题与证据管理智能体。它每天自动采集热点、观点、案例和趋势信号，生成候选母选题并写入选题库；当用户人工确认一个或多个选题后，它会创建确认队列，并按顺序为每个选题生成至少 5 个选题方向，等待用户选择；用户确认当前选题方向后，Agent 才围绕该方向进行深度研究，搜索 YouTube、中文来源、文章、官方资料、论文等素材，提取正文、字幕和摘要，沉淀为 Markdown 知识库，并把所有原始来源链接汇总回填到选题库的「关联热点链接/帖子」字段。当前选题完整完成后，Agent 自动进入队列里的下一个已确认选题，直到全部完成。用户对选题、方向、资料、来源的反馈会被结构化记录，持续优化下一次的选题和资料搜索策略。

---

## 2. 产品原则

### 2.1 本地优先

MVP 阶段优先在用户本地运行，不依赖 SaaS 后台，不做 Web UI。

### 2.2 对话优先

用户主要通过 Codex / Claude Code / Cursor 等 coding 工具的对话框使用 Agent。CLI 是底层执行接口，不是主要用户体验。

### 2.3 选题策略独立

选题策略不得被栏目规划反向控制。栏目规划只用于入库时的栏目初步匹配。

### 2.4 人机协作，不追求全自动

用户确认选题、选择方向、反馈资料质量是关键节点。Agent 不应绕过用户直接进入深研或写作。

### 2.5 证据优先

确认后的深研结果必须可溯源、可查证。没有 URL、没有发布时间、没有来源身份的信息不得作为强证据。

### 2.6 可解释成长

Agent 的成长必须可查看、可修改、可回滚。所有策略变化都应记录原因和来源反馈。

---

## 3. 目标用户与核心场景

### 3.1 目标用户

主要用户是内容策略负责人、企业 AI 内容团队、创始人内容助理、视频号/公众号运营者，以及希望每天稳定获得高质量选题和证据资料的人。

### 3.2 核心场景

1. 每天自动生成候选母选题并入库。
2. 用户在选题库里人工判断哪些选题值得做，可能只确认一个，也可能一次勾选多个。
3. 用户通过对话告诉 Agent 已确认的选题范围，例如“我勾选了第 42、45、48 行”。
4. Agent 创建 `SelectionBatch` 队列，并把已确认选题逐个排队。
5. Agent 先处理队列中的第一个选题，为该选题生成至少 5 个可深入方向。
6. 用户选择或修改当前选题方向。
7. Agent 围绕当前确认方向进行深研。
8. Agent 建立 Markdown 知识库和来源索引。
9. Agent 把当前选题的原始来源链接回填到选题库。
10. 当前选题完成后，Agent 自动进入队列中的下一个选题，重复第 5-9 步，直到队列为空。
11. 用户反馈资料质量。
12. Agent 根据反馈优化下一次选题和资料搜索策略。

---

## 4. 非目标范围

MVP 阶段不做以下事情：

1. 不做图形化 UI。
2. 不做自动发布到公众号、视频号、小红书。
3. 不做全自动成稿。
4. 不做复杂权限系统。
5. 不做多人协作后台。
6. 不强依赖云端数据库。
7. 不让内容规划文档影响选题策略。
8. 不自动扫描 CSV 打钩状态作为唯一触发方式；用户必须通过对话告诉 Agent 已勾选哪些选题，Agent 才创建处理队列。
9. 不一开始接入所有视频平台和论文源。
10. 不做不可解释的黑盒偏好学习。

---

## 5. 总体工作流

```text
每日自动运行
→ 采集 RawSignal
→ 生成 TopicCandidate
→ 去重与评分
→ 初步证据链接补强
→ Column Matcher 只做栏目初步匹配
→ 写入选题库 CSV
→ 生成 daily_delivery.md
→ 等待用户人工确认

用户确认第 X 行或多行
→ 创建 SelectionBatch 队列
→ 取队列中的第一个选题创建 TopicProject
→ 生成至少 5 个方向
→ 用户选择/修改当前选题方向
→ 生成 ResearchPlan
→ 搜索和抓取资料
→ 构建 source_index.md
→ 构建 evidence_map.md
→ 构建 knowledge_base.md
→ 原始链接回填 CSV
→ 标记当前 TopicProject 完成
→ 自动进入队列中的下一个选题
→ 队列全部完成后生成 batch_summary.md
→ 用户反馈
→ 更新 feedback_log 和 strategy_rules
```

---

## 6. 系统模块设计

## 6.1 Topic Intake Layer：信号采集层

### 职责

从多个来源采集候选信号，统一转为 `RawSignal`。

### 输入来源

MVP 支持：

- 本地已有 skills 输出
- 用户手动输入的链接或主题
- 本地 Markdown / txt 素材
- 手动导入的热点列表

MVP+ 支持：

- `aihot`
- `follow-builders`
- `tech-news-digest`
- `huashu-info-search`
- `huashu-research`
- `huashu-topic-gen`
- YouTube 搜索
- 中文公开文章来源
- 官方博客/RSS
- 论文检索源

### 输出

标准化 `RawSignal` 对象。

---

## 6.2 Topic Strategy Engine：选题策略引擎

### 职责

把 `RawSignal` 转为 `TopicCandidate`，并完成评分、去重和排序。

### 重要硬约束

Topic Strategy Engine 不得读取栏目规划作为评分依据。  
栏目规划不得改变：

- 哪些信号被采集
- 哪些选题被生成
- 哪些选题优先级更高
- 哪些来源权重更高
- 哪些主题被过滤

### 评分维度

每个候选选题使用 0-5 分评分：

1. 传播潜力：是否有冲突、趋势、案例、人物、数字。
2. 信息差：是否提供用户不知道但有价值的信息。
3. 企业 AI 相关度：是否能连接 AItoB、企业智能体、Agentic OS、产业 AI。
4. 案例价值：是否有企业案例、产品动作、客户故事或真实场景。
5. 可转化程度：是否能转为公众号、视频号、播客、销售材料。
6. 证据可获得性：是否容易找到一手来源、视频、文章、论文。
7. 新鲜度：是否近期发生或近期重新变得重要。
8. 差异度：是否避免和历史选题高度重复。
9. 用户偏好匹配度：是否符合历史反馈中被采纳的模式。

### 输出

排序后的 `TopicCandidate[]`。

---

## 6.3 Topic Library Writer：选题库写入器

### 职责

把候选选题写入用户 CSV 选题库。

### CSV 业务字段

只写入前 10 个字段：

1. 序号
2. 母选题ID
3. 母选题
4. 来源
5. 内容类型
6. 栏目系列
7. 选题方向/核心观点
8. 关联热点链接/帖子
9. 创建时间
10. 是否选题

### 字段规则

- `序号`：自动递增。
- `母选题ID`：入库阶段不填。
- `母选题`：母选题标题。
- `来源`：发现该选题的 skill 或来源名。
- `内容类型`：初步判断为 `行业洞察`、`利他（教程）`、`利他（信息差）` 等。
- `栏目系列`：仅由 Column Matcher 初步匹配。
- `选题方向/核心观点`：摘要、价值、核心判断、可挖掘角度。
- `关联热点链接/帖子`：入库阶段写初步链接；深研完成后回填完整原始链接汇总。
- `创建时间`：写入时间。
- `是否选题`：默认留空。

### 安全规则

- 写入前必须自动备份原 CSV。
- 读取时忽略 `Unnamed:*` 空列。
- 写入时不得扩散空列。
- 如果编码异常，优先尝试 `utf-8-sig`、`utf-8`、`gbk`。
- 如果用户手动改了 CSV，系统不得覆盖用户修改。

---

## 6.4 Column Matcher：栏目匹配器

### 职责

只负责入库时填写「栏目系列」。

### 输入

- 母选题标题
- 选题核心观点
- 内容类型
- 内容规划文档中的栏目定义

### 输出

- 栏目系列
- 匹配置信度
- 匹配理由

### 禁止事项

Column Matcher 不得影响选题生成和评分。

---

## 6.5 Selection Queue Manager：批量确认队列管理器

### 设计背景

用户在选题库中不一定只确认一行。实际使用中，用户可能一次勾选多个候选选题，例如今天觉得 5 个选题都值得继续推进。此时 Agent 不应同时对多个选题生成方向、深研和回填，避免上下文混乱、素材串题、链接回填错误。

Agent 必须把多个已确认选题转为一个顺序处理队列：**一次只推进一个选题的完整流程，当前选题完成后再进入下一个选题，直到全部勾选选题完成。**

### 触发方式

用户通过对话明确告知，例如：

```text
我勾选了第 42、45、48 行，依次进入下一步。
今天确认第 8、12、19 个选题，按顺序处理。
我在选题库里勾选了 5 个，你先从第一个开始给方向。
这批选题是：42, 45, 48, 51。
```

MVP 不要求自动监听 CSV 中的「是否选题」字段变化。用户必须通过对话给出行号、标题或明确范围。

### 职责

1. 解析用户确认的一个或多个选题。
2. 创建 `SelectionBatch` 批次对象。
3. 为每个已确认选题生成或关联一个 `TopicProject`。
4. 维护队列顺序、当前处理项、已完成项、失败项、跳过项。
5. 保证同一时间只有一个 `TopicProject` 处于 `active` 状态。
6. 当前选题完成后，自动提示用户进入下一个选题的方向确认阶段。
7. 队列全部完成后生成 `batch_summary.md`。

### 队列处理原则

- **串行处理**：MVP 阶段不并行深研多个选题。
- **完整闭环**：一个选题必须走完方向确认、研究计划、资料收集、知识库、链接回填后，才默认进入下一个。
- **允许跳过**：用户可以说“跳过当前选题，先做下一个”。
- **允许暂停**：用户可以说“暂停这个批次”。
- **允许恢复**：用户可以说“继续上次那批勾选选题”。
- **允许重排**：用户可以说“先做第 48 行，再做第 42 行”。
- **防串题**：不同 `TopicProject` 的方向、资料、来源、链接回填必须隔离保存。

### SelectionBatch 数据模型

```yaml
batch_id: BATCH-20260615-001
created_at: 2026-06-15T10:30:00+08:00
source: user_confirmed_rows
status: active
active_project_id: TP-20260615-042
items:
  - row_number: 42
    topic_title: xxx
    project_id: TP-20260615-042
    status: active
  - row_number: 45
    topic_title: yyy
    project_id: TP-20260615-045
    status: queued
  - row_number: 48
    topic_title: zzz
    project_id: TP-20260615-048
    status: queued
completed_count: 0
total_count: 3
```

### 批次状态

```text
created
→ active
→ paused
→ active
→ completed
```

异常状态：

```text
active
→ partially_failed
→ active 或 completed_with_errors
```

### 批次完成条件

批次中所有 item 均为以下任一状态时，批次可完成：

- `completed`
- `skipped_by_user`
- `failed_with_report`

### 批次完成产物

`batch_summary.md` 必须包含：

1. 本批次确认了多少个选题。
2. 每个选题最终状态。
3. 每个选题确认的方向。
4. 每个选题知识库路径。
5. 每个选题回填了哪些原始链接。
6. 哪些选题被跳过或失败，原因是什么。
7. 本批次暴露出的策略问题。
8. 可写入反馈学习模块的规则建议。

---

## 6.6 Selected Topic Workspace：确认选题工作区

### 触发方式

由 `Selection Queue Manager` 触发。用户可以只确认一个选题，也可以确认多个选题；Selected Topic Workspace 每次只处理队列中的当前 active 选题。

用户表达示例：

```text
我确认第 42 行，进入下一步。
我勾选了第 42、45、48 行，先处理第一个。
我勾选了《xxx》，给我方向。
把第 8 个选题做深研。
继续处理这批勾选选题的下一个。
```

MVP 不要求自动监听 CSV 勾选状态。

### 职责

1. 读取当前 active 的选题行。
2. 创建或打开对应 `TopicProject`。
3. 生成至少 5 个方向。
4. 保存方向文件。
5. 等待用户确认方向。
6. 当前 `TopicProject` 完成后，通知队列管理器推进到下一个选题。

### 每个方向必须包含

- 方向 ID
- 方向标题
- 核心观点
- 适合内容形态
- 适合受众
- 需要补强的证据类型
- 可能爆点
- 潜在风险
- 推荐优先级

---

## 6.7 Research & Evidence Engine：研究与证据引擎

### 触发方式

用户确认方向后触发，例如：

```text
选方向 3，但更偏企业老板。
方向 2 和方向 5 融合一下，开始深研。
就按方向 1 做资料包。
```

### 职责

1. 生成研究计划。
2. 搜索和收集素材。
3. 提取文章正文、视频字幕、论文摘要。
4. 形成来源索引。
5. 形成证据地图。
6. 形成 Markdown 知识库。
7. 汇总原始链接并回填选题库。

### 研究计划必须回答

1. 这个方向要证明的核心论点是什么？
2. 需要哪些事实支撑？
3. 需要哪些案例支撑？
4. 需要哪些数据支撑？
5. 需要哪些人物观点支撑？
6. 需要哪些论文/理论支撑？
7. 哪些信息找不到就不能强行写？
8. YouTube 搜索关键词是什么？
9. 中文来源搜索关键词是什么？
10. 论文搜索关键词是什么？
11. 哪些来源优先？
12. 哪些来源禁止或谨慎使用？

---

## 6.8 Feedback & Learning Engine：反馈与学习引擎

### 职责

把用户反馈转成可解释规则，影响下一次选题和资料搜索。

### 反馈类型

1. 选题正反馈：这个选题好，以后多找类似。
2. 选题负反馈：这个选题太泛/太旧/太像资讯。
3. 方向正反馈：这个角度好。
4. 方向负反馈：这个角度不对。
5. 来源正反馈：这个来源靠谱。
6. 来源负反馈：这个来源不靠谱。
7. 素材正反馈：这个视频/文章很有用。
8. 素材负反馈：这个视频太泛、太水、太二手。
9. 栏目反馈：栏目匹配错了。
10. 研究反馈：证据不够、论文不相关、缺案例。

### 学习方式

MVP 采用规则学习：

- 写入 `feedback_log.jsonl`
- 更新 `strategy_rules.yml`
- 更新 `source_rules.yml`
- 更新 `column_rules.yml`
- 每周生成 `weekly_topic_agent_review.md`

不得直接把用户反馈埋进不可见 prompt。

---

## 7. 数据模型

## 7.1 RawSignal

```yaml
id: string
source_id: string
source_type: skill | manual | web | youtube | article | paper | local_file
title: string
summary: string
url: string | null
published_at: string | null
collected_at: string
raw_text_path: string | null
tags: list[string]
metadata: dict
```

## 7.2 TopicCandidate

```yaml
id: string
title: string
source_ids: list[string]
source_names: list[string]
content_type: 行业洞察 | 利他（教程） | 利他（信息差） | other
core_viewpoint: string
initial_links: list[string]
scores:
  spread_potential: number
  info_gap: number
  enterprise_ai_relevance: number
  case_value: number
  convertibility: number
  evidence_availability: number
  freshness: number
  novelty: number
  preference_fit: number
total_score: number
dedupe_key: string
created_at: string
```

## 7.3 TopicLibraryRow

```yaml
row_number: integer
internal_topic_key: string
序号: integer
母选题ID: string | null
母选题: string
来源: string
内容类型: string
栏目系列: string
选题方向/核心观点: string
关联热点链接/帖子: string
创建时间: string
是否选题: string | null
```

说明：`internal_topic_key` 不写入用户 CSV，可以写入内部 state，用于防止用户修改 CSV 后系统丢失关联。

## 7.4 TopicProject

```yaml
project_id: string
internal_topic_key: string
csv_row_number: integer
topic_title: string
status: string
created_at: string
updated_at: string
selected_direction_id: string | null
project_dir: string
```

## 7.5 SelectionBatch

用于管理用户一次确认多个选题后的串行处理队列。

```yaml
batch_id: string
created_at: datetime
source: user_confirmed_rows | user_confirmed_titles
status: created | active | paused | completed | partially_failed | completed_with_errors
active_project_id: string | null
items:
  - row_number: int
    topic_title: string
    project_id: string
    status: queued | active | completed | skipped_by_user | failed_with_report
    started_at: datetime | null
    completed_at: datetime | null
completed_count: int
total_count: int
notes: string
```

---

## 7.6 Direction

```yaml
direction_id: string
title: string
core_viewpoint: string
content_formats: list[string]
audiences: list[string]
required_evidence: list[string]
hooks: list[string]
risks: list[string]
priority: high | medium | low
```

## 7.7 ResearchPlan

```yaml
project_id: string
direction_id: string
main_claim: string
required_facts: list[string]
required_cases: list[string]
required_data: list[string]
required_people_views: list[string]
required_papers: list[string]
youtube_queries: list[string]
chinese_queries: list[string]
paper_queries: list[string]
preferred_sources: list[string]
blocked_sources: list[string]
unknowns: list[string]
```

## 7.8 SourceItem

```yaml
source_id: string
project_id: string
type: youtube | chinese_video | article | official_blog | paper | podcast | social_post | other
title: string
url: string
author_or_org: string | null
published_at: string | null
collected_at: string
source_tier: S | A | B | C | D
credibility_score: number
relevance_score: number
transcript_path: string | null
extracted_text_path: string | null
notes: string
status: accepted | pending | rejected
```

## 7.9 EvidenceItem

```yaml
evidence_id: string
project_id: string
claim: string
source_ids: list[string]
evidence_type: fact | data | case | quote | theory | counterpoint
strength: strong | medium | weak
notes: string
```

## 7.10 FeedbackItem

```yaml
feedback_id: string
target_type: topic | direction | source | evidence | column | research
target_id: string
sentiment: positive | negative | neutral
feedback_text: string
rule_candidate: string
created_at: string
applied_to_rules: boolean
```

## 7.11 StrategyRule

```yaml
rule_id: string
scope: topic | source | direction | column | research
pattern: string
action: prefer | avoid | boost | penalize | require | block
weight_delta: number
reason: string
created_from_feedback_id: string | null
created_at: string
enabled: boolean
```

---

## 8. 文件结构

推荐本地目录：

```text
project-root/
  topic_agent/
    __init__.py
    cli.py
    config.py
    intake/
    strategy/
    library/
    matcher/
    workspace/
    research/
    feedback/
    utils/

  skills/
    topic-agent/
      SKILL.md

  _topic_agent/
    config/
      agent.yml
      skills.yml
      scoring.yml
      source_tiers.yml
      strategy_rules.yml
      source_rules.yml
      column_rules.yml
    state/
      topic_index.json
      project_index.json
      run_history.jsonl
      feedback_log.jsonl
    backups/
      topic_library_YYYYMMDD_HHMMSS.csv
    daily/
      daily_delivery_YYYY-MM-DD.md
    projects/
      TP-YYYYMMDD-001/
        project.yml
        directions.md
        selected_direction.md
        research_plan.md
        source_index.md
        evidence_map.md
        knowledge_base.md
        raw/
          youtube_transcripts/
          article_extracts/
          paper_summaries/
        feedback.md
    reviews/
      weekly_topic_agent_review_YYYY-WW.md

  data/
    topic_library.csv
```

---

## 9. 状态机

## 9.1 TopicCandidate 状态

```text
raw_signal_collected
→ candidate_generated
→ candidate_scored
→ candidate_deduped
→ candidate_ready_for_library
→ library_written
```

## 9.2 SelectionBatch 状态

```text
created
→ active
→ completed
```

可选状态：

```text
active
→ paused
→ active

active
→ partially_failed
→ active

active
→ completed_with_errors
```

## 9.3 TopicProject 状态

```text
library_written
→ queued_in_batch
→ user_selected
→ project_created
→ directions_generated
→ direction_confirmed
→ research_planned
→ sources_collected
→ evidence_mapped
→ knowledge_base_built
→ links_backfilled
→ project_completed
→ feedback_collected
→ learning_applied
```

## 9.4 状态规则

| 状态 | 触发 | 产物 | 是否可重复执行 | 失败恢复 |
|---|---|---|---|---|
| batch_created | 用户说确认第 X 行或多行 | batch.yml | 否，同一批次重复则提示已有批次 | 可创建新批次或恢复旧批次 |
| batch_active | 创建批次后 | active_project pointer | 是 | 可暂停/恢复/重排 |
| queued_in_batch | 批次内非当前选题 | item 状态更新 | 是 | 可跳过/重排 |
| user_selected | 当前选题进入 active | project.yml | 否，重复则打开已有项目 | 可重新指定行号或项目 |
| directions_generated | 创建项目后 | directions.md | 是，旧版本归档 | 保留项目，重生成方向 |
| direction_confirmed | 用户选方向 | selected_direction.md | 是，旧版本归档 | 重新选择方向 |
| research_planned | 确认方向后 | research_plan.md | 是 | 重生成计划 |
| sources_collected | 执行研究计划 | source_index.md | 是，增量追加 | 标记失败来源 |
| evidence_mapped | 来源收集后 | evidence_map.md | 是 | 弱证据标记 pending |
| knowledge_base_built | evidence map 完成后 | knowledge_base.md | 是 | 保留旧版归档 |
| links_backfilled | knowledge base 完成后 | 更新 CSV 字段 | 是，追加去重 | 写入前备份 |
| project_completed | 链接回填完成后 | project.yml 状态更新 | 是 | 可重新打开项目 |
| batch_advanced | project_completed 后 | 下一个 active item | 是 | 可手动指定下一个 |
| batch_completed | 所有 item 完成/跳过/失败上报后 | batch_summary.md | 是 | 可重生成总结 |
| learning_applied | 用户反馈后 | strategy_rules.yml | 是 | 规则可禁用/回滚 |

---

## 10. 来源分级规则

### S 级：一手强证据

- 官方博客
- 官方产品文档
- 官方客户案例
- 公司新闻稿
- 论文原文
- 发布会原片
- 创始人/高管原始访谈

### A 级：高可信二手资料

- 权威媒体深度报道
- 高质量行业研究报告
- 知名播客访谈
- 可信客户故事
- 专业会议演讲整理

### B 级：可参考资料

- 专业博客
- 技术社区长文
- 行业分析文章
- 有明确作者和日期的中文深度文章

### C 级：辅助理解资料

- 中文媒体转述
- 自媒体解读
- 二手总结
- 没有完整上下文的短视频切片

### D 级：默认不采纳

- 无明确出处
- 无发布日期
- 疑似搬运
- 疑似 AI 洗稿
- 无法验证的社交平台截图

### 使用规则

- 核心事实必须优先使用 S/A 级来源。
- B 级可作为辅助分析。
- C 级只能辅助理解，不得作为核心证据。
- D 级默认进入 rejected_sources，不进入 knowledge_base 正文。

---

## 11. 对话意图映射

Codex Skill 需要把自然语言映射到底层 CLI。

| 用户表达 | 意图 | 底层动作 |
|---|---|---|
| 今天跑一次选题 | daily_run | `topic-agent run daily` |
| 生成今天的选题但不要写入 | dry_run | `topic-agent run daily --dry-run` |
| 我确认第 42 行 | select_topic | `topic-agent batch create --rows 42` |
| 我勾选了第 42、45、48 行 | create_selection_batch | `topic-agent batch create --rows 42,45,48` |
| 继续处理这批的下一个 | batch_next | `topic-agent batch next --batch <id>` |
| 暂停这批选题 | batch_pause | `topic-agent batch pause --batch <id>` |
| 跳过当前选题 | batch_skip_current | `topic-agent batch skip-current --batch <id>` |
| 给这个选题 5 个方向 | generate_directions | `topic-agent directions generate --project <id>` |
| 选方向 3 | confirm_direction | `topic-agent directions confirm --project <id> --direction D3` |
| 方向 3 更偏老板视角 | refine_direction | `topic-agent directions refine --project <id> --direction D3 --instruction ...` |
| 开始深研 | research_run | `topic-agent research run --project <id>` |
| 把链接回填选题库 | backfill_links | `topic-agent library backfill-links --project <id>` |
| 这个来源不靠谱 | feedback_source_negative | `topic-agent feedback add --type source_negative ...` |
| 以后多找这种官方案例 | feedback_source_positive | `topic-agent feedback add --type source_positive ...` |
| 复盘这周选题 | weekly_review | `topic-agent review weekly` |

---

## 12. CLI 命令设计

```bash
topic-agent init

topic-agent run daily

topic-agent run daily --dry-run

topic-agent library validate

topic-agent library append --input candidates.json

topic-agent batch create --rows 42

topic-agent batch create --rows 42,45,48

topic-agent batch status --batch BATCH-20260615-001

topic-agent batch next --batch BATCH-20260615-001

topic-agent batch pause --batch BATCH-20260615-001

topic-agent batch resume --batch BATCH-20260615-001

topic-agent batch skip-current --batch BATCH-20260615-001

topic-agent topic select --row 42

topic-agent directions generate --project TP-20260615-001

topic-agent directions confirm --project TP-20260615-001 --direction D3

topic-agent directions refine --project TP-20260615-001 --direction D3 --instruction "更偏企业老板视角"

topic-agent research plan --project TP-20260615-001

topic-agent research collect --project TP-20260615-001

topic-agent research build-kb --project TP-20260615-001

topic-agent library backfill-links --project TP-20260615-001

topic-agent feedback add --project TP-20260615-001 --target source:S001 --sentiment negative --text "这个视频太泛"

topic-agent learn apply

topic-agent review weekly
```

---

## 13. 每日交付 Markdown 格式

文件：`_topic_agent/daily/daily_delivery_YYYY-MM-DD.md`

必须包含：

```markdown
# 每日选题交付 YYYY-MM-DD

## 今日概览
- 新增候选：N 个
- 已写入选题库：N 个
- 建议重点看：Top 3
- 被过滤重复：N 个

## Top 选题
### 1. 母选题标题
- 来源：xxx
- 内容类型：xxx
- 栏目初步匹配：xxx
- 核心观点：xxx
- 为什么值得做：xxx
- 初步链接：xxx
- 风险：xxx
- 评分摘要：xxx

## 今日被过滤选题
- xxx：原因

## 今日策略观察
- 哪类信号变多
- 哪类来源有效
- 下次建议
```

---

## 14. 方向生成输出格式

文件：`directions.md`

```markdown
# 选题方向建议

母选题：xxx
来源：xxx
核心观点：xxx

## 方向 D1：xxx
- 核心观点：xxx
- 适合内容形态：短视频 / 公众号 / 播客 / 销售材料
- 适合受众：企业老板 / AI 从业者 / 销售对象
- 需要补强证据：案例、数据、视频、论文
- 爆点：xxx
- 风险：xxx
- 推荐优先级：高

## 方向 D2：xxx
...

## 建议提问
你可以回复：
1. 选方向 D1
2. D1 和 D3 融合
3. D2 更偏老板视角
4. 全部重写，方向更尖锐
```

---

## 15. ResearchPlan 格式

文件：`research_plan.md`

```markdown
# Research Plan

## 1. 确认方向
方向：xxx
核心论点：xxx

## 2. 必须证明的问题
1. xxx
2. xxx
3. xxx

## 3. 需要寻找的证据
### 案例
- xxx

### 数据
- xxx

### 人物观点
- xxx

### 论文/理论
- xxx

## 4. 搜索关键词
### YouTube
- xxx

### 中文来源
- xxx

### 论文
- xxx

## 5. 优先来源
- 官方博客
- 官方客户案例
- 高管访谈
- 论文原文

## 6. 谨慎来源
- 无出处中文二手文章
- 短视频搬运号

## 7. 不确定事项
- xxx 找不到就不能强行写
```

---

## 16. Source Index 格式

文件：`source_index.md`

```markdown
# Source Index

| ID | 等级 | 类型 | 标题 | 来源/作者 | 日期 | URL | 状态 | 备注 |
|---|---|---|---|---|---|---|---|---|
| S001 | S | official_blog | xxx | xxx | 2026-xx-xx | https://... | accepted | 官方一手资料 |
| S002 | A | youtube | xxx | xxx | 2026-xx-xx | https://... | pending | 需要核对字幕 |
```

---

## 17. Evidence Map 格式

文件：`evidence_map.md`

```markdown
# Evidence Map

## 核心论点 1：xxx

### 强证据
- [S001] xxx 支撑了什么。
- [S003] xxx 支撑了什么。

### 中等证据
- [S004] xxx。

### 仍缺证据
- 缺少具体客户案例。
- 缺少可引用数据。

## 核心论点 2：xxx
...
```

---

## 18. Knowledge Base 格式

文件：`knowledge_base.md`

```markdown
# 选题知识库：xxx

## 1. 选题一句话判断
xxx

## 2. 背景
xxx

## 3. 核心事实
- xxx [S001]
- xxx [S002]

## 4. 关键案例
xxx

## 5. 关键人物观点
xxx

## 6. 可引用数据
xxx

## 7. 论文/理论支撑
xxx

## 8. 可转化内容角度
xxx

## 9. 风险与不确定性
xxx

## 10. 原始来源链接汇总
- [S001] xxx: https://...
- [S002] xxx: https://...
```

---

## 19. 选题库链接回填规则

深研完成后，系统必须把该项目的所有 accepted / pending 原始链接汇总回填到 CSV 对应行的「关联热点链接/帖子」字段。

### 回填格式

建议格式：

```text
[初步来源]
https://...

[深研来源]
S001 官方博客：https://...
S002 YouTube：https://...
S003 论文：https://...
S004 中文文章：https://...
```

### 回填规则

- 不覆盖已有链接，只去重追加。
- 写入前备份 CSV。
- 如果字段过长，可以只写 Top 10 链接，并附本地知识库路径。
- 完整来源仍以 `source_index.md` 为准。

---

## 20. 反馈学习规则

## 20.1 用户反馈示例

```text
这个 YouTube 视频太泛，以后少找这种。
这个官方客户案例很有用，以后多找类似。
这个方向太像行业新闻，不够像企业老板会关心的问题。
这个栏目匹配错了，应该放 JovaAI 真实场景。
这篇文章是二手转述，别作为核心证据。
```

## 20.2 写入 feedback_log.jsonl

每条反馈必须结构化保存。

```json
{"feedback_id":"FB-001","target_type":"source","target_id":"S002","sentiment":"negative","feedback_text":"这个 YouTube 视频太泛","rule_candidate":"降低该频道和泛资讯类视频权重","created_at":"2026-06-15T09:00:00","applied_to_rules":false}
```

## 20.3 更新规则示例

`source_rules.yml`：

```yaml
prefer:
  - pattern: "official customer story"
    action: boost
    weight_delta: 0.3
    reason: "用户反馈官方客户案例有用"

avoid:
  - pattern: "泛资讯类 YouTube 视频"
    action: penalize
    weight_delta: -0.4
    reason: "用户反馈该类视频太泛"
```

---

## 21. 核心指标

系统需要在 weekly review 中追踪：

| 指标 | 定义 | 目标 |
|---|---|---|
| 入库命中率 | 被用户确认的选题数 / 入库选题数 | 持续提升 |
| 方向采纳率 | 用户采纳方向数 / 生成方向数 | 持续提升 |
| 素材采纳率 | accepted 来源数 / 总来源数 | 持续提升 |
| 强证据覆盖率 | 有 S/A 级来源支撑的核心论点比例 | 越高越好 |
| 链接回填完成率 | 已回填链接项目数 / 深研项目数 | 100% |
| 返工率 | 用户要求重找/重做次数 | 持续下降 |
| 栏目匹配修正率 | 用户修改栏目次数 / 入库选题数 | 持续下降 |

---

## 22. 周复盘格式

文件：`weekly_topic_agent_review_YYYY-WW.md`

```markdown
# Weekly Topic Agent Review

## 1. 本周数据
- 入库选题：N
- 用户确认：N
- 深研项目：N
- 回填完成：N

## 2. 命中率
- 入库命中率：xx%
- 方向采纳率：xx%
- 素材采纳率：xx%

## 3. 高质量来源
- xxx

## 4. 低质量来源
- xxx

## 5. 用户反馈总结
- xxx

## 6. 已更新规则
- xxx

## 7. 下周策略建议
- xxx
```

---

## 23. MVP 分期

## 23.1 MVP 0：本地工作流跑通

目标：先让 Agent 成为稳定的本地选题工作台助手。

必须实现：

1. `topic-agent init`
2. CSV validate / backup / append
3. 忽略 `Unnamed:*` 空列
4. skills.yml 注册表
5. 从本地 skills 输出或手动输入生成候选
6. 生成 5-10 个母选题
7. 评分、去重、排序
8. Column Matcher 初步栏目匹配
9. 写入选题库前 10 个字段
10. 生成 daily_delivery.md
11. 用户确认第 X 行或多行后创建 SelectionBatch
12. 为批次中的当前 active 选题创建 TopicProject
13. 生成至少 5 个方向
14. 保存 directions.md
15. 当前项目完成后可推进到批次中的下一个选题
16. 保存基础 feedback_log.jsonl

验收标准：

- 连续 3 次 dry-run 不报错。
- 连续 3 次写入 CSV 不破坏原文件。
- 用户能通过对话确认某一行并得到 5 个方向。
- 用户能通过对话确认多行，系统创建批次队列，并且一次只处理一个 active 选题。

---

## 23.2 MVP 1：确认选题后的深研资料包

目标：把一个确认选题变成可写作、可查证的资料包。

必须实现：

1. 创建项目目录。
2. 生成 selected_direction.md。
3. 生成 research_plan.md。
4. 支持 YouTube 搜索或手动 YouTube 链接导入。
5. 支持网页文章链接导入与正文提取。
6. 支持中文来源链接导入。
7. 生成 source_index.md。
8. 生成 evidence_map.md。
9. 生成 knowledge_base.md。
10. 原始链接回填 CSV。
11. 用户可以对来源做正负反馈。

验收标准：

- 任意一个确认选题能生成完整项目目录。
- source_index 至少包含 5 个来源。
- knowledge_base 中每个核心事实都能追溯到 source_id。
- CSV 的「关联热点链接/帖子」成功追加深研链接。

---

## 23.3 MVP 2：可解释策略成长

目标：让系统越来越符合用户偏好。

必须实现：

1. 记录选题采纳率。
2. 记录方向采纳率。
3. 记录素材采纳率。
4. 记录被拒绝来源。
5. 记录高质量来源。
6. 自动生成 weekly review。
7. 根据反馈更新 `strategy_rules.yml`。
8. 根据反馈更新 `source_rules.yml`。
9. 规则可启用、禁用、回滚。

验收标准：

- 用户一次负反馈能生成一条可解释规则候选。
- 下一次搜索时能看到该规则参与评分。
- weekly review 能展示本周策略变化。

---

## 23.4 MVP 3：GitHub 可分发版本

目标：让其他用户可以在自己的 coding 工具中安装和使用。

必须实现：

1. README.md
2. INSTALL.md
3. CONFIG_EXAMPLE.md
4. `.env.example`
5. `skills/topic-agent/SKILL.md`
6. 示例 CSV
7. 示例项目目录
8. 测试用 mock data
9. 基础单元测试
10. GitHub Actions 可选

---

## 24. Codex 开发优先级

Codex 不要先接复杂外部工具。优先顺序：

1. 搭项目骨架。
2. 做配置系统。
3. 做 CSV 安全读写。
4. 做内部状态库。
5. 做候选选题数据模型。
6. 做评分和去重。
7. 做每日交付 Markdown。
8. 做用户确认行号 → 创建项目。
9. 做 5 方向生成。
10. 做研究计划。
11. 做 source_index / evidence_map / knowledge_base 模板。
12. 做链接回填。
13. 做反馈日志。
14. 做规则学习。
15. 再接 YouTube、网页抓取、论文源。

---

## 25. 验收清单

### 基础验收

- [ ] 可以初始化项目。
- [ ] 可以识别选题库字段。
- [ ] 可以备份 CSV。
- [ ] 可以写入候选选题。
- [ ] 不破坏 CSV 原有内容。
- [ ] `母选题ID` 默认不填。
- [ ] `是否选题` 默认不填。
- [ ] `栏目系列` 只由 Column Matcher 填写。

### 每日选题验收

- [ ] 可以生成 daily_delivery.md。
- [ ] 可以输出 Top 选题。
- [ ] 可以说明选题来源。
- [ ] 可以说明为什么值得做。
- [ ] 可以说明初步链接。

### 确认选题验收

- [ ] 用户说“确认第 X 行”后能创建单选题批次并创建项目。
- [ ] 用户说“我勾选了第 X、Y、Z 行”后能创建 SelectionBatch 队列。
- [ ] 队列内同一时间只有一个 active TopicProject。
- [ ] 当前 TopicProject 完成后，系统能提示进入下一个 queued 选题。
- [ ] 可以生成至少 5 个方向。
- [ ] 每个方向包含核心观点、证据需求、风险。

### 深研验收

- [ ] 可以生成 research_plan.md。
- [ ] 可以生成 source_index.md。
- [ ] 可以生成 evidence_map.md。
- [ ] 可以生成 knowledge_base.md。
- [ ] 可以把链接回填到 CSV。

### 反馈学习验收

- [ ] 可以记录用户反馈。
- [ ] 可以生成规则候选。
- [ ] 可以把规则应用到下一次评分。
- [ ] 可以生成 weekly review。

---

## 26. 风险与应对

### 风险 1：MVP 太大导致开发失焦

应对：严格按 MVP 0 → MVP 1 → MVP 2 开发，不提前接所有外部源。

### 风险 2：CSV 被用户手动修改导致状态丢失

应对：建立内部 `internal_topic_key` 和 `project_index.json`。

### 风险 3：资料质量不稳定

应对：来源分级 + 用户反馈 + rejected_sources。

### 风险 4：Agent 看似学习但实际没变化

应对：所有反馈必须转成规则，并在 weekly review 中展示是否生效。

### 风险 5：栏目策略再次污染选题策略

应对：代码层隔离 Topic Strategy Engine 和 Column Matcher；评分逻辑不得 import Column Matcher。

### 风险 6：链接回填字段过长

应对：CSV 只回填 Top 10 原始链接 + 本地知识库路径，完整来源保存在 source_index.md。

---

## 27. 给 Codex 的最终开发指令

请基于本 PRD 开发 `topic-agent`。第一阶段不要追求全网搜索能力，而要优先完成稳定闭环：

```text
CSV 安全读写
→ 每日候选生成
→ 入库
→ 用户确认
→ 5 个方向
→ 研究计划
→ Markdown 知识库模板
→ 链接回填
→ 反馈日志
```

严格遵守以下硬约束：

1. 内容规划文档只能用于栏目匹配，不得影响选题策略。
2. `母选题ID` 入库阶段不填。
3. `是否选题` 入库阶段不填。
4. 写入 CSV 前必须备份。
5. 深研原始链接必须回填到「关联热点链接/帖子」。
6. 深研知识库默认保存为 Markdown。
7. 用户主动告诉 Agent 后才进入确认选题后的下一步。
8. 成长机制必须可解释、可查看、可修改、可回滚。



---

## 附录：v0.4.1 对 Codex 的新增开发指令

在 v0.4 的基础上，Codex 必须新增 `SelectionBatch` 和批量勾选队列机制：

1. 用户可以一次确认一行，也可以一次确认多行。
2. 所有确认入口统一先创建 `SelectionBatch`，即使只有一行，也可以视为单 item 批次。
3. 批次中的选题必须串行推进，MVP 不允许多个选题同时深研。
4. 每个选题必须有独立 `TopicProject` 目录，防止方向、资料、证据和链接回填串题。
5. 当前选题完成 `links_backfilled` 后，才能默认进入下一个 queued 选题。
6. 用户可暂停、恢复、跳过、重排批次。
7. 批次完成后必须生成 `batch_summary.md`。
8. 对话入口要支持：“我勾选了第 42、45、48 行”“继续下一个”“暂停这批”“跳过当前”。
