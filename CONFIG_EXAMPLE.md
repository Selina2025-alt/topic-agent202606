# Topic Agent 配置示例

所有配置默认位于 `_topic_agent/config/`。运行 `node bin/topic-agent.mjs init` 会自动生成基础配置。

## skill_routes.yml

```yaml
routes:
  intake:
    primary: [aihot, follow-builders, tech-news-digest]
    fallback: [huashu-info-search, huashu-research]
    purpose: "每日信号、热点、Builder观点、技术新闻"
  topic_generation:
    primary: [huashu-topic-gen, huashu-wechat-creation]
    support: [khazix-writer, ljg-rank, ljg-think]
    purpose: "母选题生成、角度分化、选题质检"
  deep_research:
    primary: [hv-analysis, huashu-research, huashu-info-search]
    support: [ljg-paper, ljg-paper-river, long-content-deep-summary]
    purpose: "深研资料包、论文脉络、长视频摘要、个人素材补强"
  evidence_tools:
    primary: [@mozilla/readability, jsdom, rss-parser, pdfjs-dist, youtubei.js, exceljs]
    purpose: "缺失通用能力由 1k+ stars GitHub 项目补齐"
```

## strategy_rules.yml

```yaml
rules: []

- rule_id: RULE-STRATEGY-OFFICIAL-CASE
  scope: topic
  pattern: "官方客户案例"
  action: prefer
  weight_delta: 0.4
  reason: "用户偏好可核验企业案例"
  enabled: true
```

## source_rules.yml

```yaml
prefer: []
avoid: []

- rule_id: RULE-SOURCE-YOUTUBE-DEPTH
  scope: source
  pattern: "深度访谈"
  action: prefer
  weight_delta: 0.25
  reason: "长访谈适合沉淀观点和背景框架"
  enabled: true

- rule_id: RULE-SOURCE-SECONDARY-SUMMARY
  scope: source
  pattern: "搬运"
  action: avoid
  weight_delta: -0.3
  reason: "二手搬运来源不应作为强证据"
  enabled: true
```

## column_rules.yml

栏目规则只用于写 CSV 的 `栏目系列` 字段，不参与选题生成、选题评分、来源权重或每日采集源权重。

```yaml
columns:
  - name: 企业 AI 案例
    keywords: [客户, 案例, 落地, 场景, 实践, 公司, 企业]
  - name: AI 工具教程
    keywords: [教程, 方法, 技巧, 怎么, 实操, 自动化]
  - name: JovaAI 真实场景
    keywords: [工作流, 审批, 客服, 销售, 真实场景]
rules: []

- rule_id: RULE-COLUMN-WORKFLOW
  scope: column
  pattern: "工作流"
  action: route
  column: "JovaAI 真实场景"
  weight_delta: 0
  reason: "用户反馈工作流类选题应归入 JovaAI 真实场景"
  enabled: true
```

## 规则管理命令

```powershell
node bin/topic-agent.mjs rules list --type all
node bin/topic-agent.mjs rules disable --type source --rule RULE-SOURCE-YOUTUBE-DEPTH
node bin/topic-agent.mjs rules enable --type source --rule RULE-SOURCE-YOUTUBE-DEPTH
node bin/topic-agent.mjs rules rollback --type source --rule RULE-SOURCE-YOUTUBE-DEPTH
node bin/topic-agent.mjs rules disable --type column --rule RULE-COLUMN-WORKFLOW
```

## external_tools.yml

```yaml
tools:
  - package: "@mozilla/readability"
    github: "mozilla/readability"
    stars_requirement: ">=1000"
    role: "网页正文抽取"
  - package: "pdfjs-dist"
    github: "mozilla/pdf.js"
    stars_requirement: ">=1000"
    role: "PDF/论文文本抽取"
  - package: "youtubei.js"
    github: "LuanRT/YouTube.js"
    stars_requirement: ">=1000"
    role: "YouTube 元数据和 transcript 尝试提取"
  - package: "exceljs"
    github: "exceljs/exceljs"
    stars_requirement: ">=1000"
    role: "格式化 xlsx 选题库、列宽、自动换行和勾选列"
```
