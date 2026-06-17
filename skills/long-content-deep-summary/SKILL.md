---
name: long-content-deep-summary
description: 长内容深度摘要 Skill。用于 YouTube 长视频、播客、文章、书籍、访谈、字幕稿或 transcript 的综合总结；当用户说“提取深度摘要”“长视频总结”“综合总结”“不要只列要点”“捕捉背景框架/哲学基础/细微差别/基本假设”时使用。也用于 topic-agent 深研中把 YouTube transcript 或长文资料转成可沉淀到知识库的结构化摘要。
---

# Long Content Deep Summary

用这个 skill 把长视频、播客、文章、书籍、访谈或 transcript 转成“可进入资料包”的深度摘要。目标不是短平快亮点，而是保留论点、事实、上下文、假设、限制、矛盾和可转化含义。

## 工作流

1. 确认内容类型、标题、创作者/作者、发布日期和时长/长度；缺失时明确写“内容未指定”。
2. 读取并遵循 [references/deep-summary-prompt.md](references/deep-summary-prompt.md)。
3. 如果输入是 YouTube transcript，尽量保留时间戳；如果没有时间戳，按自然章节或主题段落组织。
4. 不引入原文之外的信息。需要背景判断时，只能指出“内容所使用/暗示的框架”，不要补外部事实。
5. 对不确定、缺失或矛盾处显式标注，不用假设填补。
6. 输出 Markdown，结构必须包含：核心论点、要点、上下文框架、详细分析、细微视角、基本假设、联系与含义。

## 与 Topic Agent 配合

- 对 `raw/youtube_transcripts/Sxxx.md`、`raw/article_extracts/Sxxx.md`、`raw/paper_summaries/Sxxx.md` 使用本 skill 时，输出建议保存到同项目的 `raw/deep_summaries/Sxxx.md`。
- 深度摘要可以作为 `SourceItem.extracted_text_path` 的补充材料，但不能替代原始链接、原始 transcript 或原文。
- 如果摘要来自二手内容，要在“细微的视角”中标记来源限制。

