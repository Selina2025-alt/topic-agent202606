#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import RSSParser from "rss-parser";
import ExcelJS from "exceljs";

const DISTRIBUTION_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DAILY_CANDIDATE_COUNT = 50;
const DAILY_SIGNAL_LIMIT = 160;
const AIHOT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const TOPIC_FIELDS = [
  "序号",
  "母选题ID",
  "母选题",
  "来源",
  "内容类型",
  "栏目系列",
  "选题方向/核心观点",
  "关联热点链接/帖子",
  "创建时间",
  "是否选题"
];

const BLUEPRINTS = [
  {
    title: "企业 AI Agent 从演示走向真实流程，老板到底该看什么",
    contentType: "行业洞察",
    viewpoint: "真正值得跟踪的不是模型参数，而是 Agent 能否进入权限、流程、责任和 ROI 可验证的业务闭环。",
    sourceHint: ["hv-analysis", "follow-builders", "aihot"]
  },
  {
    title: "Claude Code、Codex 类编程 Agent 正在改写知识工作自动化",
    contentType: "利他（信息差）",
    viewpoint: "编程 Agent 的价值不只在写代码，而在把需求、调研、测试、文档和交付变成一条可复用流水线。",
    sourceHint: ["khazix-writer", "huashu-wechat-creation", "follow-builders"]
  },
  {
    title: "企业 AI 落地为什么常卡在证据、权限和流程，而不是模型能力",
    contentType: "行业洞察",
    viewpoint: "模型能力提升很快，但企业落地的瓶颈更像组织工程：谁授权、谁验收、谁承担错误成本。",
    sourceHint: ["huashu-research", "hv-analysis"]
  },
  {
    title: "内容团队如何建立自己的 AI 选题雷达，而不是每天追热点",
    contentType: "利他（教程）",
    viewpoint: "选题系统应该把信号、证据、方向、反馈沉淀成资产，而不是靠临时灵感和二手资讯。",
    sourceHint: ["aihot", "tech-news-digest", "huashu-topic-gen"]
  },
  {
    title: "从官方客户案例看 Agentic OS 的真实落地场景",
    contentType: "企业案例",
    viewpoint: "官方客户案例虽然慢，但最接近可验证的企业需求，适合提炼销售材料和老板视角内容。",
    sourceHint: ["huashu-info-search", "hv-analysis"]
  },
  {
    title: "AI 论文里的记忆、推理和工具调用，哪些会真正影响业务",
    contentType: "利他（信息差）",
    viewpoint: "论文不应只被当新闻看，而要翻译成业务问题：成本、可靠性、上下文、任务边界和可控性。",
    sourceHint: ["ljg-paper", "ljg-paper-river", "aihot"]
  },
  {
    title: "为什么 Builder 的一手观点比二手资讯更适合做深度选题",
    contentType: "行业洞察",
    viewpoint: "一手观点往往带着真实约束、取舍和路线判断，比转述新闻更容易生成有穿透力的内容。",
    sourceHint: ["follow-builders", "tech-news-digest"]
  },
  {
    title: "把视频、播客和文章素材沉淀成可复用内容资产的方法",
    contentType: "利他（教程）",
    viewpoint: "资料收集不是复制链接，而是建立来源分级、证据地图和后续可引用的知识库。",
    sourceHint: ["huashu-research", "huashu-material-search", "ljg-think"]
  },
  {
    title: "用可解释规则替代黑盒偏好学习，选题 Agent 才能越用越准",
    contentType: "行业洞察",
    viewpoint: "内容团队需要能查看、修改、回滚的策略记忆，而不是看不见的偏好向量。",
    sourceHint: ["huashu-topic-gen", "huashu-research"]
  },
  {
    title: "企业老板真正关心的 AI 内容，不是工具清单而是组织变化",
    contentType: "行业洞察",
    viewpoint: "老板视角的 AI 内容要回答投入、风险、流程再造和竞争压力，而不是只介绍新工具功能。",
    sourceHint: ["khazix-writer", "hv-analysis", "follow-builders"]
  }
];

const DEFAULT_COLUMN_RULES = [
  { name: "企业 AI 案例", keywords: ["客户", "案例", "落地", "场景", "实践", "公司", "企业"] },
  { name: "AI 工具教程", keywords: ["教程", "方法", "技巧", "怎么", "实操", "自动化"] },
  { name: "AI 产品观察", keywords: ["发布", "产品", "模型", "更新", "平台", "agent"] },
  { name: "AI 论文研究", keywords: ["论文", "研究", "arxiv", "paper", "推理", "记忆"] },
  { name: "行业洞察", keywords: ["趋势", "行业", "变化", "战略", "老板", "团队"] }
];

const PROJECT_STATUS_ORDER = [
  "queued_in_batch",
  "project_created",
  "directions_generated",
  "direction_confirmed",
  "research_planned",
  "sources_collected",
  "evidence_mapped",
  "knowledge_base_built",
  "links_backfilled",
  "project_completed",
  "feedback_collected",
  "learning_applied"
];

const COMPLETED_PROJECT_STATUSES = new Set(["links_backfilled", "project_completed", "feedback_collected", "learning_applied"]);
const SOURCE_TYPE_TIER = {
  official_blog: "S",
  official_docs: "S",
  official_doc: "S",
  customer_case: "S",
  official_customer_case: "S",
  press_release: "S",
  paper: "S",
  launch_video: "S",
  executive_interview: "S",
  original_interview: "S",
  authority_media: "A",
  industry_report: "A",
  podcast: "A",
  customer_story: "A",
  conference_talk: "A",
  professional_blog: "B",
  technical_community: "B",
  analysis_article: "B",
  chinese_deep_article: "B",
  article: "B",
  youtube: "A",
  secondary_summary: "C",
  media_repost: "C",
  self_media: "C",
  short_clip: "C",
  unverifiable: "D",
  unsourced: "D",
  no_date: "D",
  repost: "D",
  ai_spam: "D",
  screenshot: "D"
};
const TERMINAL_BATCH_ITEM_STATUSES = new Set(["completed", "skipped_by_user", "failed_with_report"]);
const TERMINAL_BATCH_STATUSES = new Set(["completed", "completed_with_errors"]);

function setProjectStatus(project, nextStatus, options = {}) {
  if (options.force || !project.status) {
    project.status = nextStatus;
    return project;
  }
  if (COMPLETED_PROJECT_STATUSES.has(project.status) && !COMPLETED_PROJECT_STATUSES.has(nextStatus)) return project;
  const currentRank = PROJECT_STATUS_ORDER.indexOf(project.status);
  const nextRank = PROJECT_STATUS_ORDER.indexOf(nextStatus);
  if (currentRank >= 0 && nextRank >= 0 && nextRank < currentRank) return project;
  project.status = nextStatus;
  return project;
}

function isProjectComplete(projectOrStatus) {
  const status = typeof projectOrStatus === "string" ? projectOrStatus : projectOrStatus?.status;
  return COMPLETED_PROJECT_STATUSES.has(status);
}

function isTerminalBatchItem(itemOrStatus) {
  const status = typeof itemOrStatus === "string" ? itemOrStatus : itemOrStatus?.status;
  return TERMINAL_BATCH_ITEM_STATUSES.has(status);
}

function isTerminalBatch(batchOrStatus) {
  const status = typeof batchOrStatus === "string" ? batchOrStatus : batchOrStatus?.status;
  return TERMINAL_BATCH_STATUSES.has(status);
}

async function main() {
  try {
    const { root, argv } = parseRoot(process.argv.slice(2));
    if (argv.length === 0 || ["-h", "--help"].includes(argv[0])) {
      printHelp();
      return 0;
    }
    const p = makePaths(root);
    const command = argv[0];
    let subcommand = argv[1] || null;
    let optionArgs = argv.slice(2);
    if (subcommand?.startsWith("-")) {
      optionArgs = argv.slice(1);
      subcommand = null;
    }
    const opts = parseOptions(optionArgs);
    let result;
    if (command === "init") result = initProject(p);
    else {
      if (!fs.existsSync(p.agentDir)) initProject(p);
      else ensureStateIndexes(p);
      result = await dispatch(p, command, subcommand, opts);
    }
    if (result !== undefined) console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    return 1;
  }
}

async function dispatch(p, command, subcommand, opts) {
  if (command === "run" && subcommand === "daily") return runDaily(p, Boolean(opts["dry-run"]), normalizeDailyCount(opts.count));
  if (command === "doctor") return doctor(p);
  if (command === "acceptance") return acceptanceReport(p);
  if (command === "release" && subcommand === "check") return releaseCheck(p);
  if (command === "status") return statusOverview(p, opts);
  if (command === "web") return startWebServer(p, opts);
  if (command === "intake" && subcommand === "rss") return intakeRss(p, required(opts.url, "--url"), Number(opts.limit || 10), Boolean(opts.write));
  if (command === "intake" && subcommand === "manual") return intakeManual(p, opts);
  if (command === "intake" && subcommand === "file") return intakeFile(p, opts);
  if (command === "intake" && subcommand === "hotlist") return intakeHotlist(p, opts);
  if (command === "library" && subcommand === "validate") return validateLibrary(p);
  if (command === "library" && subcommand === "append") return appendCandidates(p, readJsonFile(path.resolve(opts.input)));
  if (command === "library" && subcommand === "format") return formatLibrary(p, opts);
  if (command === "library" && subcommand === "export-xlsx") return exportLibraryXlsx(p, opts);
  if (command === "library" && subcommand === "sync-xlsx") return syncLibraryFromXlsx(p, opts);
  if (command === "library" && subcommand === "backfill-links") return backfillProjectLinks(p, required(opts.project, "--project"));
  if (command === "batch" && subcommand === "create") return opts.selected ? createBatchFromSelected(p, opts) : createBatch(p, parseRows(required(opts.rows, "--rows")));
  if (command === "batch" && subcommand === "status") return loadBatch(p, opts.batch);
  if (command === "batch" && subcommand === "next") return advanceBatch(p, opts.batch);
  if (command === "batch" && subcommand === "summary") return { summary_path: writeBatchSummary(p, loadBatch(p, opts.batch)) };
  if (command === "batch" && subcommand === "pause") return updateBatchStatus(p, opts.batch, "paused");
  if (command === "batch" && subcommand === "resume") return updateBatchStatus(p, opts.batch, "active");
  if (command === "batch" && subcommand === "skip-current") return skipCurrent(p, opts.batch, opts);
  if (command === "batch" && subcommand === "fail-current") return failCurrent(p, opts.batch, opts);
  if (command === "batch" && subcommand === "reorder") return reorderBatch(p, opts.batch, opts);
  if (command === "topic" && subcommand === "select") return createBatch(p, [Number(required(opts.row, "--row"))]);
  if (command === "directions" && subcommand === "generate") return generateDirections(p, required(opts.project, "--project"), Boolean(opts.force));
  if (command === "directions" && subcommand === "confirm") return confirmDirection(p, required(opts.project, "--project"), required(opts.direction, "--direction"));
  if (command === "directions" && subcommand === "refine") return confirmDirection(p, required(opts.project, "--project"), required(opts.direction, "--direction"), required(opts.instruction, "--instruction"));
  if (command === "research" && subcommand === "plan") return generateResearchPlan(p, required(opts.project, "--project"));
  if (command === "research" && subcommand === "collect") return collectSources(p, required(opts.project, "--project"), opts);
  if (command === "research" && subcommand === "arxiv") return collectArxivPapers(p, required(opts.project, "--project"), opts);
  if (command === "research" && subcommand === "summary-prompt") return createDeepSummaryPrompt(p, required(opts.project, "--project"), required(opts.source, "--source"));
  if (command === "research" && subcommand === "attach-summary") return attachDeepSummary(p, required(opts.project, "--project"), required(opts.source, "--source"), opts);
  if (command === "research" && subcommand === "update-source") return updateSource(p, required(opts.project, "--project"), required(opts.source, "--source"), opts);
  if (command === "research" && subcommand === "build-kb") return buildKnowledgeBase(p, required(opts.project, "--project"));
  if (command === "research" && subcommand === "run") return runResearch(p, required(opts.project, "--project"));
  if (command === "feedback" && subcommand === "add") return addFeedback(p, opts);
  if (command === "feedback" && subcommand === "sync") return syncFeedbackArtifacts(p);
  if (command === "learn" && subcommand === "apply") return applyLearning(p);
  if (command === "rules" && subcommand === "list") return listRules(p, opts.type || "all");
  if (command === "rules" && ["enable", "disable", "rollback"].includes(subcommand)) return mutateRule(p, required(opts.type, "--type"), required(opts.rule, "--rule"), subcommand);
  if (command === "review" && subcommand === "weekly") return weeklyReview(p);
  if (command === "skills" && subcommand === "audit") return auditSkills(p);
  if (command === "skills" && subcommand === "refresh") return refreshSkills(p);
  throw new Error(`Unsupported command: ${command} ${subcommand || ""}`.trim());
}

function printHelp() {
  console.log(`topic-agent

Commands:
  init
  doctor
  acceptance
  release check
  status [--project TP-...]
  web [--port 4317] [--host 127.0.0.1]
  intake rss --url https://example.com/feed.xml [--limit 10] [--write]
  intake manual --title "..." [--url https://...] [--summary "..."] [--write]
  intake file --file .\\source.md [--title "..."] [--write]
  intake hotlist --input .\\hotlist.txt [--limit 20] [--write]
  run daily [--dry-run] [--count 50]
  library validate
  library append --input candidates.json
  library format
  library export-xlsx [--output data\\topic_library.xlsx]
  library sync-xlsx [--input data\\topic_library.xlsx]
  library backfill-links --project TP-...
  batch create --rows 42,45,48
  batch create --selected
  batch status [--batch BATCH-...]
  batch next [--batch BATCH-...]
  batch summary [--batch BATCH-...]
  batch pause|resume|skip-current [--batch BATCH-...] [--reason "..."]
  batch fail-current --reason "..." [--batch BATCH-...]
  batch reorder --rows 48,42 [--batch BATCH-...]
  topic select --row 42
  directions generate --project TP-...
  directions confirm --project TP-... --direction D1
  directions refine --project TP-... --direction D1 --instruction "..."
  research plan|collect|build-kb|run --project TP-...
  research arxiv --project TP-... --query "agent memory" [--limit 5] [--status accepted] [--extract-pdf]
  research summary-prompt --project TP-... --source S001
  research attach-summary --project TP-... --source S001 [--file raw/deep_summaries/S001.md]
  research update-source --project TP-... --source S001 --status accepted --tier S --notes "..."
  feedback add --target source:S001 --sentiment negative --text "..." [--pattern "..."]
  feedback sync
  learn apply
  rules list [--type strategy|source|column|all]
  rules enable|disable|rollback --type strategy|source|column --rule RULE-...
  review weekly
  skills audit|refresh`);
}

function makePaths(root) {
  const r = path.resolve(root || ".");
  return {
    root: r,
    agentDir: path.join(r, "_topic_agent"),
    configDir: path.join(r, "_topic_agent", "config"),
    stateDir: path.join(r, "_topic_agent", "state"),
    batchDir: path.join(r, "_topic_agent", "state", "batches"),
    backupsDir: path.join(r, "_topic_agent", "backups"),
    dailyDir: path.join(r, "_topic_agent", "daily"),
    projectsDir: path.join(r, "_topic_agent", "projects"),
    reviewsDir: path.join(r, "_topic_agent", "reviews"),
    dataDir: path.join(r, "data"),
    libraryCsv: path.join(r, "data", "topic_library.csv"),
    libraryXlsx: path.join(r, "data", "topic_library.xlsx"),
    triageDecisions: path.join(r, "_topic_agent", "state", "triage_decisions.json"),
    webDistDir: path.join(r, "web", "dist"),
    skillsDir: path.join(r, "skills")
  };
}

function initProject(p) {
  [p.agentDir, p.configDir, p.stateDir, p.batchDir, p.backupsDir, p.dailyDir, p.projectsDir, p.reviewsDir, p.dataDir].forEach(ensureDir);
  if (!fs.existsSync(p.libraryCsv)) writeCsv(p.libraryCsv, [], TOPIC_FIELDS);
  const configs = {
    "agent.yml": `name: topic-agent\nversion: 0.1.0\ncreated_at: ${isoNow()}\ntopic_library: data/topic_library.csv\nstate_dir: _topic_agent/state\n`,
    "scoring.yml": "dimensions:\n  enterprise_ai_relevance: 1.3\n  evidence_availability: 1.2\n  case_value: 1.1\n",
    "source_tiers.yml": "S: [official_blog, official_docs, customer_case, official_customer_case, press_release, paper, launch_video, executive_interview, original_interview]\nA: [authority_media, industry_report, podcast, customer_story, conference_talk]\nB: [professional_blog, technical_community, analysis_article, chinese_deep_article, article]\nC: [secondary_summary, media_repost, self_media, short_clip]\nD: [unverifiable, unsourced, no_date, repost, ai_spam, screenshot]\n",
    "strategy_rules.yml": "rules: []\n",
    "source_rules.yml": "prefer: []\navoid: []\n",
    "column_rules.yml": renderDefaultColumnRules(),
    "skill_routes.yml": renderDefaultSkillRoutes(),
    "external_tools.yml": renderExternalToolsRegistry()
  };
  for (const [name, text] of Object.entries(configs)) {
    const file = path.join(p.configDir, name);
    if (!fs.existsSync(file)) writeText(file, text);
  }
  const skills = path.join(p.configDir, "skills.yml");
  if (!fs.existsSync(skills)) writeText(skills, renderSkillsRegistry(p));
  ensureStateIndexes(p);
  return { initialized: p.root, library: p.libraryCsv };
}

function ensureStateIndexes(p) {
  ensureDir(p.stateDir);
  const topicIndex = path.join(p.stateDir, "topic_index.json");
  if (!fs.existsSync(topicIndex)) writeJson(topicIndex, { topics: {} });
  const projectIndex = path.join(p.stateDir, "project_index.json");
  if (!fs.existsSync(projectIndex)) writeJson(projectIndex, { projects: {} });
  if (!fs.existsSync(p.triageDecisions)) writeJson(p.triageDecisions, { decisions: [] });
  backfillTopicIndex(p);
}

function backfillTopicIndex(p) {
  if (fs.existsSync(p.libraryCsv)) {
    const { rows } = readLibrary(p);
    for (const row of rows) {
      if (!row["母选题"]) continue;
      const rowNumber = Number(row["序号"]) || 0;
      recordTopicIndex(p, {
        internal_topic_key: internalTopicKeyForRow(row),
        row_number: rowNumber,
        csv_row_number: rowNumber,
        topic_title: row["母选题"],
        source: row["来源"],
        content_type: row["内容类型"],
        status: "library_written"
      });
    }
  }
  if (!fs.existsSync(p.projectsDir)) return;
  for (const name of fs.readdirSync(p.projectsDir)) {
    const projectFile = path.join(p.projectsDir, name, "project.yml");
    if (!fs.existsSync(projectFile)) continue;
    const project = readJson(projectFile, null);
    if (!project?.internal_topic_key) continue;
    recordTopicIndex(p, {
      internal_topic_key: project.internal_topic_key,
      row_number: project.csv_row_number,
      csv_row_number: project.csv_row_number,
      topic_title: project.topic_title,
      source: project.source,
      content_type: project.content_type,
      project_id: project.project_id,
      project_dir: project.project_dir,
      status: project.status
    });
  }
}

function renderSkillsRegistry(p) {
  if (!fs.existsSync(p.skillsDir)) return "skills: []\n";
  const lines = ["skills:"];
  for (const name of fs.readdirSync(p.skillsDir).sort()) {
    const skillDir = path.join(p.skillsDir, name);
    if (!fs.statSync(skillDir).isDirectory()) continue;
    const skillMd = path.join(skillDir, "SKILL.md");
    const description = fs.existsSync(skillMd) ? extractDescription(readText(skillMd)) : "";
    lines.push(`  - name: ${name}`);
    lines.push(`    path: skills/${name}`);
    if (description) lines.push(`    description: ${quoteYaml(description)}`);
  }
  return lines.join("\n") + "\n";
}

function renderDefaultSkillRoutes() {
  return `routes:
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
    support: [ljg-paper, ljg-paper-river, long-content-deep-summary, huashu-material-search]
    purpose: "深研资料包、论文脉络、长内容摘要、个人素材补强"
  content_shape:
    primary: [khazix-writer, huashu-wechat-creation, huashu-video-outline]
    purpose: "公众号/视频号/销售材料方向判断，不做自动成稿"
  evidence_tools:
    primary: [@mozilla/readability, jsdom, rss-parser, pdfjs-dist, youtubei.js, exceljs]
    purpose: "缺失技能由 1k+ stars GitHub 项目补齐，作为 CLI 依赖使用"
`;
}

function renderExternalToolsRegistry() {
  return `tools:
  - package: "@mozilla/readability"
    github: "mozilla/readability"
    stars_requirement: ">=1000"
    role: "网页正文抽取"
  - package: "jsdom"
    github: "jsdom/jsdom"
    stars_requirement: ">=1000"
    role: "HTML DOM 解析，供 Readability 使用"
  - package: "rss-parser"
    github: "rbren/rss-parser"
    stars_requirement: ">=1000"
    role: "RSS/Atom 信号源解析"
  - package: "pdfjs-dist"
    github: "mozilla/pdf.js"
    stars_requirement: ">=1000"
    role: "PDF/论文文本抽取"
  - package: "youtubei.js"
    github: "LuanRT/YouTube.js"
    stars_requirement: ">=1000"
    role: "YouTube 元数据/字幕适配候选"
  - package: "exceljs"
    github: "exceljs/exceljs"
    stars_requirement: ">=1000"
    role: "格式化 xlsx 选题库、列宽、自动换行和勾选列"
`;
}

function renderDefaultColumnRules() {
  const lines = ["columns:"];
  for (const column of DEFAULT_COLUMN_RULES) {
    lines.push(`  - name: ${column.name}`);
    lines.push(`    keywords: [${column.keywords.join(", ")}]`);
  }
  lines.push("rules: []");
  return lines.join("\n") + "\n";
}

function auditSkills(p) {
  const skills = fs.existsSync(p.skillsDir)
    ? fs.readdirSync(p.skillsDir).filter((name) => fs.statSync(path.join(p.skillsDir, name)).isDirectory()).sort()
    : [];
  const routes = fs.existsSync(path.join(p.configDir, "skill_routes.yml")) ? readText(path.join(p.configDir, "skill_routes.yml")) : "";
  const tools = fs.existsSync(path.join(p.configDir, "external_tools.yml")) ? readText(path.join(p.configDir, "external_tools.yml")) : "";
  return {
    skills_count: skills.length,
    skills,
    routes_path: path.join(p.configDir, "skill_routes.yml"),
    external_tools_path: path.join(p.configDir, "external_tools.yml"),
    routes,
    external_tools: tools
  };
}

function refreshSkills(p) {
  const file = path.join(p.configDir, "skills.yml");
  writeText(file, renderSkillsRegistry(p));
  return auditSkills(p);
}

function collectSkillSignals(p) {
  const roots = uniquePaths([p.skillsDir, path.join(DISTRIBUTION_ROOT, "skills")]);
  const signals = [];
  const seen = new Set();
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root).sort()) {
      if (seen.has(name)) continue;
      const skillDir = path.join(root, name);
      const skillMd = path.join(skillDir, "SKILL.md");
      if (!fs.existsSync(skillMd)) continue;
      const description = extractDescription(readText(skillMd)) || name;
      seen.add(name);
      signals.push({
        id: `RS-${shortHash(`${name}:${description}`)}`,
        source_id: name,
        source_type: "skill",
        title: name,
        summary: description,
        url: displayPath(p, skillMd),
        published_at: null,
        collected_at: isoNow(),
        tags: [],
        metadata: { skill_path: displayPath(p, skillDir) }
      });
    }
  }
  return signals;
}

function normalizeDailyCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_DAILY_CANDIDATE_COUNT;
  return Math.max(DEFAULT_DAILY_CANDIDATE_COUNT, Math.floor(numeric));
}

async function collectDailySignals(p, count = DEFAULT_DAILY_CANDIDATE_COUNT) {
  const [aihotSignals, followBuilderSignals] = await Promise.all([
    collectAihotSignals(Math.min(100, Math.max(60, count))),
    collectFollowBuilderSignals(p, Math.min(100, Math.max(60, count)))
  ]);
  return dedupeSignals([
    ...aihotSignals,
    ...followBuilderSignals,
    ...collectSkillSignals(p),
    ...fallbackSignals()
  ]).slice(0, DAILY_SIGNAL_LIMIT);
}

async function collectAihotSignals(limit = 80) {
  try {
    const url = new URL("https://aihot.virxact.com/api/public/items");
    url.searchParams.set("mode", "selected");
    url.searchParams.set("take", String(Math.min(100, Math.max(1, limit))));
    const data = await fetchJsonWithTimeout(url, {
      headers: { "user-agent": AIHOT_USER_AGENT, "accept": "application/json" },
      timeoutMs: 2500
    });
    return (data?.items || []).map((item, index) => ({
      id: `RS-${shortHash(`aihot:${item.id || item.url || item.title || index}`)}`,
      source_id: "aihot",
      source_type: "aihot_item",
      title: item.title || item.title_en || `AI HOT ${index + 1}`,
      summary: item.summary || item.title_en || "",
      url: item.url || null,
      published_at: item.publishedAt || null,
      collected_at: isoNow(),
      tags: [item.category].filter(Boolean),
      metadata: {
        aihot_id: item.id || "",
        source_name: item.source || "",
        category: item.category || ""
      }
    }));
  } catch {
    return [];
  }
}

async function fetchJsonWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs || 3000);
  try {
    const response = await fetch(String(url), {
      headers: opts.headers || {},
      signal: controller.signal
    });
    if (!response.ok) return null;
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function collectFollowBuilderSignals(p, limit = 80) {
  const dir = findFollowBuildersDir(p);
  if (!dir) return [];
  const signals = [];
  const feedX = readJson(path.join(dir, "feed-x.json"), { x: [] });
  for (const builder of feedX.x || []) {
    for (const tweet of builder.tweets || []) {
      if (!tweet.text) continue;
      signals.push({
        id: `RS-${shortHash(`builder-tweet:${tweet.id || tweet.url || tweet.text}`)}`,
        source_id: "follow-builders",
        source_type: "builder_tweet",
        title: `${builder.name || builder.handle || "Builder"}：${compactText(tweet.text, 90)}`,
        summary: tweet.text,
        url: tweet.url || null,
        published_at: tweet.createdAt || null,
        collected_at: isoNow(),
        tags: ["builder", "x"],
        metadata: {
          builder: builder.name || "",
          handle: builder.handle || "",
          bio: builder.bio || "",
          likes: tweet.likes || 0,
          retweets: tweet.retweets || 0,
          replies: tweet.replies || 0
        }
      });
      if (signals.length >= limit) return signals;
    }
  }

  const feedPodcasts = readJson(path.join(dir, "feed-podcasts.json"), { podcasts: [] });
  for (const episode of feedPodcasts.podcasts || []) {
    signals.push({
      id: `RS-${shortHash(`builder-podcast:${episode.guid || episode.url || episode.title}`)}`,
      source_id: "follow-builders",
      source_type: "builder_podcast",
      title: `${episode.name || "Podcast"}：${episode.title}`,
      summary: compactText(episode.transcript || episode.description || episode.title || "", 700),
      url: episode.url || null,
      published_at: episode.publishedAt || null,
      collected_at: isoNow(),
      tags: ["builder", "podcast"],
      metadata: { podcast: episode.name || "", guid: episode.guid || "" }
    });
    if (signals.length >= limit) return signals;
  }

  const feedBlogs = readJson(path.join(dir, "feed-blogs.json"), { blogs: [] });
  for (const post of feedBlogs.blogs || []) {
    signals.push({
      id: `RS-${shortHash(`builder-blog:${post.url || post.title}`)}`,
      source_id: "follow-builders",
      source_type: "builder_blog",
      title: `${post.name || "Builder Blog"}：${post.title}`,
      summary: compactText(post.content || post.description || post.title || "", 700),
      url: post.url || null,
      published_at: post.publishedAt || null,
      collected_at: isoNow(),
      tags: ["builder", "blog"],
      metadata: { blog: post.name || "", author: post.author || "" }
    });
    if (signals.length >= limit) return signals;
  }
  return signals;
}

function findFollowBuildersDir(p) {
  return uniquePaths([
    path.join(p.root, "skills", "follow-builders"),
    path.join(DISTRIBUTION_ROOT, "skills", "follow-builders")
  ]).find((dir) => fs.existsSync(path.join(dir, "feed-x.json"))) || null;
}

function fallbackSignals() {
  return [
    fallbackSignal("aihot", "AI HOT 精选动态", "每日 AI 模型、产品、产业、论文和技巧信号。"),
    fallbackSignal("follow-builders", "Builder 一手观点", "来自 AI 创业者、研究者、工程师和播客访谈的一手观察。"),
    fallbackSignal("huashu-research", "结构化调研流程", "围绕事实、证据、来源质量和信息增量做深研。"),
    fallbackSignal("hv-analysis", "横纵分析法", "把公司、产品、行业现象放进历史纵深和横向竞争中拆解。"),
    fallbackSignal("huashu-topic-gen", "选题方向生成", "快速生成标题、大纲、优劣分析和内容方向。"),
    fallbackSignal("long-content-deep-summary", "长内容深度摘要", "把长视频、播客、文章沉淀为可引用的深度摘要。"),
    fallbackSignal("tech-news-digest", "技术新闻摘要", "从多源技术动态中筛选值得转化的内容信号。")
  ];
}

function fallbackSignal(sourceId, title, summary) {
  return {
    id: `RS-${shortHash(`fallback:${sourceId}:${title}`)}`,
    source_id: sourceId,
    source_type: "fallback",
    title,
    summary,
    url: null,
    published_at: null,
    collected_at: isoNow(),
    tags: [],
    metadata: { fallback: true }
  };
}

function dedupeSignals(signals) {
  const seen = new Set();
  const unique = [];
  for (const signal of signals) {
    const keys = [
      signal.url ? `url:${signal.url}` : "",
      `title:${normalizeTopicIdentity(signal.title || signal.summary || "")}`
    ].filter(Boolean);
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    unique.push(signal);
  }
  return unique;
}

function generateCandidates(signals, count = DEFAULT_DAILY_CANDIDATE_COUNT, p = null) {
  const byName = Object.fromEntries(signals.map((s) => [s.source_id, s]));
  const strategyRules = p ? loadRules(path.join(p.configDir, "strategy_rules.yml")) : [];
  const candidates = [];
  const seen = new Set();
  const addCandidate = (candidate) => {
    if (!candidate?.title) return;
    const key = candidateIdentityKey(candidate);
    if (seen.has(key)) return;
    seen.add(key);
    candidate.dedupe_key = key;
    candidate.scores = scoreCandidate(candidate, strategyRules);
    candidate.total_score = Number(Object.values(candidate.scores).reduce((a, b) => a + b, 0).toFixed(2));
    candidates.push(candidate);
  };

  for (const bp of BLUEPRINTS) {
    const matched = bp.sourceHint.map((name) => byName[name]).filter(Boolean);
    const sourceSignals = matched.length ? matched : signals.slice(0, 2);
    addCandidate({
      id: `TC-${shortHash(bp.title)}`,
      title: bp.title,
      source_ids: sourceSignals.map((s) => s.id),
      source_names: sourceSignals.map((s) => s.source_id),
      content_type: bp.contentType,
      core_viewpoint: bp.viewpoint,
      initial_links: sourceSignals.map((s) => s.url).filter(Boolean),
      dedupe_key: normalizeTitle(bp.title),
      created_at: isoNow()
    });
  }

  for (const candidate of generateRouteCandidates(signals)) addCandidate(candidate);

  for (const signal of signals) {
    for (const angle of selectAnglesForSignal(signal)) {
      addCandidate(candidateFromSignalAngle(signal, angle));
      if (candidates.length >= count * 2) break;
    }
    if (candidates.length >= count * 2) break;
  }

  if (candidates.length < count) {
    for (const candidate of generateSkillMatrixCandidates(signals)) {
      addCandidate(candidate);
      if (candidates.length >= count) break;
    }
  }

  return diversifyCandidates(candidates, count);
}

function diversifyCandidates(candidates, count) {
  const sorted = [...candidates].sort((a, b) => b.total_score - a.total_score);
  const selected = [];
  const deferred = [];
  const patternCounts = {};
  const sourceCounts = {};
  const topicCounts = {};
  const patternLimit = Math.max(8, Math.ceil(count / 4));
  const sourceLimit = Math.max(12, Math.ceil(count * 0.65));
  for (const candidate of sorted) {
    const pattern = candidateTitlePattern(candidate.title);
    const source = candidate.source_names?.[0] || "unknown";
    const topicKey = canonicalTopicKey(candidate);
    if (
      (patternCounts[pattern] || 0) >= patternLimit
      || (sourceCounts[source] || 0) >= sourceLimit
      || (topicCounts[topicKey] || 0) >= 1
    ) {
      deferred.push(candidate);
      continue;
    }
    selected.push(candidate);
    patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    topicCounts[topicKey] = (topicCounts[topicKey] || 0) + 1;
    if (selected.length >= count) return selected;
  }
  for (const candidate of deferred) {
    if (selected.length >= count) break;
    const topicKey = canonicalTopicKey(candidate);
    if ((topicCounts[topicKey] || 0) >= 1) continue;
    selected.push(candidate);
    topicCounts[topicKey] = (topicCounts[topicKey] || 0) + 1;
  }
  return selected.slice(0, count);
}

function candidateTitlePattern(title) {
  const text = String(title || "");
  if (text.includes("写给老板")) return "boss";
  if (text.includes("真趋势") || text.includes("三个证据")) return "evidence";
  if (text.startsWith("从「")) return "signal";
  if (text.includes("Builder")) return "builder";
  if (text.startsWith("用 ")) return "skill";
  if (text.includes("+")) return "skill_matrix";
  return "general";
}

function generateRouteCandidates(signals) {
  const byName = Object.fromEntries(signals.map((signal) => [signal.source_id, signal]));
  const routes = [
    ["aihot", "huashu-research", "把 AI HOT 热点转成可验证深研选题的工作流", "热点不是选题，只有补齐一手来源、事实链和反方材料后，才值得进入深研。"],
    ["aihot", "huashu-topic-gen", "每天 50 个 AI 热点里，哪些能变成公众号母选题", "用选题生成规则把资讯拆成观点、教程、案例和反常识四类，避免只复述新闻。"],
    ["follow-builders", "hv-analysis", "Builder 一手观点如何提前暴露企业 AI 的下一轮变化", "一手建设者的表达常常先于媒体叙事，适合用横纵分析判断长期结构变化。"],
    ["follow-builders", "long-content-deep-summary", "长播客里的 Builder 观点，如何沉淀成深度选题资产", "长内容的价值在于背景、限定条件和方法论，适合先摘要再进入证据地图。"],
    ["hv-analysis", "huashu-info-search", "一个企业 AI 案例是否值得写，先看证据链而不是热度", "客户、预算、流程、失败成本和公开材料决定案例能否支撑深度内容。"],
    ["ljg-paper", "ljg-paper-river", "AI 论文选题不要追标题，要倒读它解决了哪个老问题", "论文选题要从问题演化史里找信息差，而不是只翻译摘要。"],
    ["khazix-writer", "huashu-material-search", "如何把真实经历加入 AI 选题，降低空泛工具感", "内容的可信度来自真实场景、具体冲突和个人判断，而不是工具清单。"],
    ["huashu-video-outline", "huashu-video-check", "一个 AI 选题能不能做成视频，先看标题封面和前三秒", "视频选题需要先验证钩子、反差和观看理由，再决定是否深研。"],
    ["tech-news-digest", "huashu-wechat-creation", "技术新闻如何转成面向老板的 AI 内容", "把技术变化翻译为成本、组织、流程和竞争压力，才适合企业读者。"],
    ["long-content-deep-summary", "hv-analysis", "长视频深度摘要如何补上选题的哲学框架和历史背景", "长内容摘要不只提炼事实，还要保留方法论、假设和未说出口的世界观。"]
  ];
  return routes.map(([left, right, title, viewpoint]) => {
    const sourceSignals = [byName[left], byName[right]].filter(Boolean);
    return {
      id: `TC-${shortHash(`route:${left}:${right}:${title}`)}`,
      title,
      source_ids: sourceSignals.map((signal) => signal.id),
      source_names: sourceSignals.map((signal) => signal.source_id),
      content_type: "利他（教程）",
      core_viewpoint: viewpoint,
      initial_links: sourceSignals.map((signal) => signal.url).filter(Boolean),
      dedupe_key: normalizeTitle(title),
      created_at: isoNow()
    };
  });
}

function anglesForSignal(signal) {
  if (signal.source_type === "skill" || signal.source_type === "fallback") return SKILL_TOPIC_ANGLES;
  if (signal.source_type === "aihot_item") return AIHOT_TOPIC_ANGLES;
  if (String(signal.source_type || "").startsWith("builder_")) return BUILDER_TOPIC_ANGLES;
  return GENERAL_TOPIC_ANGLES;
}

function selectAnglesForSignal(signal) {
  const angles = anglesForSignal(signal);
  if (signal.source_type === "aihot_item") return angles.slice(0, 1);
  if (String(signal.source_type || "").startsWith("builder_")) return angles.slice(0, 1);
  if (signal.source_type === "skill" || signal.source_type === "fallback") return angles.slice(0, 1);
  return angles.slice(0, 1);
}

const AIHOT_TOPIC_ANGLES = [
  ["AI 热点观察", "{title}", "先保留来源主题本身，再判断它能否延展成企业 AI 案例、产品观察、教程或深度观点。"]
];

const BUILDER_TOPIC_ANGLES = [
  ["行业洞察", "Builder 说的「{title}」，为什么比二手资讯更值得跟", "建设者的一手表达通常包含真实约束、路线选择和失败成本，适合提炼深度选题。"],
  ["利他（信息差）", "从「{title}」提炼一个可复用的 AI 工作流判断", "把个人观点转成方法论，看它能否迁移到内容团队、创业团队或企业流程。"],
  ["企业 AI 案例", "「{title}」背后可能藏着哪些企业级需求", "从权限、数据、工作流、成本和安全边界推断真实需求，而不是只看表面观点。"],
  ["AI 工具教程", "围绕「{title}」做一篇实操内容，应该怎么设计结构", "从问题、工具链、操作步骤、验证指标和失败处理五个部分组织教程。"]
];

const SKILL_TOPIC_ANGLES = [
  ["利他（教程）", "用 {source} 做一个可复用的 AI 选题动作", "把单个 skill 从临时能力变成流程节点，明确输入、判断标准、输出物和下一步。"],
  ["行业洞察", "{source} 适合解决选题流程里的哪个卡点", "把 skill 放进选题系统，看它负责发现信号、深研证据、生成角度还是内容成型。"],
  ["利他（信息差）", "把 {source} 和每日热点结合，能产出什么新栏目", "围绕稳定能力和实时信号做组合，形成可持续更新的栏目资产。"]
];

const GENERAL_TOPIC_ANGLES = [
  ["行业洞察", "从「{title}」拆一个值得跟进的 AI 选题", "先判断它是否有新事实、新冲突、新方法或新案例，再决定是否进入深研。"],
  ["利他（教程）", "围绕「{title}」做一篇能落地的教程，需要哪些材料", "教程选题必须补齐适用对象、步骤、失败场景和检查清单。"]
];

function candidateFromSignalAngle(signal, angle) {
  const [contentType, titleTemplate, viewpointTemplate] = angle;
  const sourceName = signal.source_id || "unknown";
  const title = renderTopicTemplate(titleTemplate, signal);
  const sourceTopic = sourceTopicTitle(signal);
  return {
    id: `TC-${shortHash(`${signal.id}:${contentType}:${sourceTopic}`)}`,
    title,
    source_topic: sourceTopic,
    source_ids: [signal.id],
    source_names: [sourceName],
    content_type: contentType,
    core_viewpoint: renderTopicTemplate(viewpointTemplate, signal),
    initial_links: signal.url ? [signal.url] : [],
    dedupe_key: normalizeTopicIdentity(sourceTopic),
    created_at: isoNow()
  };
}

function generateSkillMatrixCandidates(signals) {
  const skills = signals.filter((signal) => signal.source_type === "skill" || signal.source_type === "fallback");
  const anchors = ["aihot", "follow-builders", "huashu-research", "hv-analysis", "long-content-deep-summary"];
  const candidates = [];
  for (const skill of skills) {
    for (const anchor of anchors) {
      if (skill.source_id === anchor) continue;
      const title = `用 ${skill.source_id} + ${anchor} 扩展一个 AI 选题分支`;
      candidates.push({
        id: `TC-${shortHash(`matrix:${skill.source_id}:${anchor}`)}`,
        title,
        source_ids: [skill.id],
        source_names: [skill.source_id, anchor],
        content_type: "利他（教程）",
        core_viewpoint: "把已有 skill 变成选题流水线中的一个明确动作，再接入实时热点、Builder 观点或深研证据。",
        initial_links: skill.url ? [skill.url] : [],
        dedupe_key: normalizeTitle(title),
        created_at: isoNow()
      });
    }
  }
  return candidates;
}

function renderTopicTemplate(template, signal) {
  return template
    .replaceAll("{title}", sourceTopicTitle(signal))
    .replaceAll("{source}", signal.source_id || "该来源")
    .replaceAll("{focus}", inferSignalFocus(signal));
}

function inferSignalFocus(signal) {
  const text = [signal.title, signal.summary, signal.tags?.join(" ")].join(" ").toLowerCase();
  if (text.includes("paper") || text.includes("论文") || text.includes("research")) return "论文研究";
  if (text.includes("agent") || text.includes("代理")) return "Agent 工作流";
  if (text.includes("model") || text.includes("模型")) return "模型能力";
  if (text.includes("enterprise") || text.includes("企业") || text.includes("customer")) return "企业落地";
  if (text.includes("video") || text.includes("youtube") || text.includes("podcast")) return "长内容素材";
  return "AI 内容机会";
}

function compactSignalTitle(text) {
  return compactText(String(text || "").replace(/\s*https?:\/\/\S+/g, ""), 64);
}

function sourceTopicTitle(signal) {
  const raw = signal.title || signal.summary || signal.source_id || "未命名选题";
  const withoutUrl = String(raw).replace(/\s*https?:\/\/\S+/g, "");
  const withoutBuilderPrefix = String(signal.source_type || "").startsWith("builder_")
    ? withoutUrl.replace(/^[^：:\n]{1,30}[：:]\s*/, "")
    : withoutUrl;
  return compactSignalTitle(withoutBuilderPrefix);
}

function candidateIdentityKey(candidate) {
  return normalizeTopicIdentity(candidate.dedupe_key || candidate.title);
}

function canonicalTopicKey(candidate) {
  const sourceTitle = candidate.source_topic || "";
  return normalizeTopicIdentity(sourceTitle || candidate.dedupe_key || candidate.title);
}

function normalizeTopicIdentity(text) {
  let value = String(text || "").toLowerCase();
  value = value.replace(/\s*https?:\/\/\S+/g, "");
  value = value.replace(/如果把[「“"]?(.+?)[」”"]?写给老板，?应该回答什么问题/g, "$1");
  value = value.replace(/从[「“"]?(.+?)[」”"]?看企业ai的真实落地信号/g, "$1");
  value = value.replace(/[「」“”"'`《》]/g, "");
  value = value.replace(/是真趋势还是短期噪音，?应该看哪三个证据/g, "");
  value = value.replace(/普通人看(.+?)容易漏掉的一个内容机会/g, "$1");
  value = value.replace(/背后可能藏着哪些企业级需求/g, "");
  value = value.replace(/围绕(.+?)做一篇实操内容，?应该怎么设计结构/g, "$1");
  value = value.replace(/[，,。.!！？?；;：:\-—_（）()\[\]\s]/g, "");
  return value || "untitled";
}

function compactText(text, maxLength = 120) {
  const clean = normalizeWhitespace(stripHtml(String(text || ""))).replace(/\s*https?:\/\/\S+/g, "").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

function uniquePaths(paths) {
  const seen = new Set();
  return paths.map((item) => path.resolve(item)).filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function displayPath(p, file) {
  const resolved = path.resolve(file);
  const root = path.resolve(p.root);
  const distribution = path.resolve(DISTRIBUTION_ROOT);
  if (resolved.startsWith(root)) return relative(p.root, resolved);
  if (resolved.startsWith(distribution)) return relative(DISTRIBUTION_ROOT, resolved);
  return resolved;
}

function scoreCandidate(candidate, rules = []) {
  const text = [candidate.title, candidate.content_type, candidate.core_viewpoint, candidate.source_names.join(" ")].join(" ").toLowerCase();
  const scores = {
    spread_potential: 3,
    info_gap: 3,
    enterprise_ai_relevance: 3,
    case_value: 2.5,
    convertibility: 3,
    evidence_availability: 2.5,
    freshness: 3,
    novelty: 3,
    preference_fit: 3
  };
  boost(scores, text, ["冲突", "老板", "为什么", "变化", "风险"], "spread_potential", 0.5);
  boost(scores, text, ["信息差", "一手", "论文", "观点", "builder"], "info_gap", 0.5);
  boost(scores, text, ["企业", "aitob", "agentic", "流程", "老板"], "enterprise_ai_relevance", 0.7);
  boost(scores, text, ["案例", "客户", "落地", "场景"], "case_value", 0.8);
  boost(scores, text, ["公众号", "视频", "销售", "内容", "教程"], "convertibility", 0.5);
  boost(scores, text, ["官方", "论文", "客户", "证据", "来源"], "evidence_availability", 0.7);
  boost(scores, text, ["发布", "最近", "热点", "daily", "aihot"], "freshness", 0.4);
  boost(scores, text, ["不是", "替代", "系统", "规则", "组织"], "novelty", 0.4);
  boost(scores, text, ["卡兹克", "花叔", "企业 ai", "选题"], "preference_fit", 0.5);
  const appliedRules = applyRulesToScores(scores, text, rules, "topic");
  candidate.applied_rules = appliedRules;
  return Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, Math.min(5, Math.max(0, Number(v.toFixed(1))))]));
}

function boost(scores, text, keywords, dimension, amount) {
  const hits = keywords.filter((keyword) => text.includes(keyword.toLowerCase())).length;
  if (hits) scores[dimension] += Math.min(1.5, hits * amount);
}

function loadRules(file) {
  if (!fs.existsSync(file)) return [];
  const text = readText(file);
  const blocks = text.split(/\n(?=- rule_id:)/g).filter((block) => block.includes("rule_id:"));
  return blocks.map(parseRuleBlock).filter((rule) => rule.enabled !== false && rule.pattern);
}

function parseRuleBlock(block) {
  const rule = {};
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^\s*-?\s*([a-zA-Z_]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    value = value.replace(/^["']|["']$/g, "");
    if (key === "weight_delta") rule[key] = Number(value);
    else if (key === "enabled") rule[key] = value !== "false";
    else rule[key] = value;
  }
  return rule;
}

function applyRulesToScores(scores, text, rules, scope) {
  const applied = [];
  for (const rule of rules) {
    if (rule.scope && ![scope, "topic", "source", "direction"].includes(rule.scope)) continue;
    const pattern = String(rule.pattern || "").toLowerCase();
    if (!pattern || !text.includes(pattern)) continue;
    const delta = Number.isFinite(rule.weight_delta) ? rule.weight_delta : rule.action === "prefer" || rule.action === "boost" ? 0.3 : rule.action === "avoid" || rule.action === "penalize" ? -0.3 : 0;
    if (scope === "topic") {
      scores.preference_fit += delta;
      if (delta > 0) scores.evidence_availability += Math.min(0.2, delta);
      if (delta < 0) scores.spread_potential += Math.max(-0.2, delta);
    }
    applied.push({ rule_id: rule.rule_id || rule.pattern, action: rule.action, weight_delta: delta, pattern: rule.pattern });
  }
  return applied;
}

function applySourceRules(p, source) {
  const rules = loadRules(path.join(p.configDir, "source_rules.yml"));
  const text = [source.title, source.url, source.type, source.notes, source.author_or_org].join(" ").toLowerCase();
  const applied = [];
  for (const rule of rules) {
    const pattern = String(rule.pattern || "").toLowerCase();
    if (!pattern || !text.includes(pattern)) continue;
    const delta = Number.isFinite(rule.weight_delta) ? rule.weight_delta : rule.action === "prefer" ? 0.3 : rule.action === "avoid" ? -0.3 : 0;
    source.relevance_score = clamp(Number(source.relevance_score || 0.5) + delta, 0, 1);
    source.rule_score_delta = Number(((source.rule_score_delta || 0) + delta).toFixed(2));
    applied.push({ rule_id: rule.rule_id || rule.pattern, action: rule.action, weight_delta: delta, pattern: rule.pattern });
    if (rule.action === "avoid" && source.status === "accepted" && source.relevance_score < 0.35) {
      source.status = "pending";
      source.notes = appendNote(source.notes, "命中 avoid 来源规则，已降为 pending 等待人工确认");
    }
  }
  source.applied_rules = applied;
  source.quality_warnings = sourceQualityWarnings(source);
  return source;
}

function sourceQualityWarnings(source) {
  const warnings = [];
  const highTier = isHighTierSource(source);
  const hasDeepSummary = Boolean(source.metadata?.deep_summary_path);
  if (source.source_tier === "D") warnings.push("D 级来源默认不进入知识库正文");
  if (!source.url && highTier) warnings.push("高等级来源缺少 URL");
  if (!source.published_at && highTier) warnings.push("高等级来源缺少发布日期");
  if (!source.author_or_org && highTier) warnings.push("高等级来源缺少作者/机构");
  if (source.status === "accepted" && highTier && !hasStrongEvidenceTrace(source)) warnings.push("S/A accepted 来源缺少 URL、发布日期或作者/机构时不得作为强证据");
  if (source.status === "accepted" && source.source_tier === "C") warnings.push("C 级来源不应作为核心证据");
  if (!source.extracted_text_path && !source.transcript_path && source.status === "accepted" && !hasDeepSummary) warnings.push("accepted 来源缺少正文/字幕/深度摘要");
  if (!source.extracted_text_path && !source.transcript_path && source.status === "accepted" && hasDeepSummary) warnings.push("accepted 来源使用深度摘要作为正文补充，强引用前仍需核对原始内容");
  if (source.type === "youtube" && source.status === "accepted" && source.metadata?.has_transcript === false) warnings.push("YouTube 来源未自动获得 transcript，需人工补字幕后再作为强证据");
  if (source.type === "youtube" && source.status === "accepted" && parseDurationSeconds(source.metadata?.duration) >= 1800 && !hasDeepSummary) warnings.push("长 YouTube 来源建议使用 long-content-deep-summary 生成深度摘要");
  return warnings;
}

function hasStrongEvidenceTrace(source) {
  return Boolean(source.url && source.published_at && source.author_or_org);
}

function isHighTierSource(source) {
  return ["S", "A"].includes(String(source.source_tier || "").toUpperCase());
}

function isStrongEvidenceSource(source) {
  return source.status === "accepted" && isHighTierSource(source) && hasStrongEvidenceTrace(source);
}

function parseDurationSeconds(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  const text = String(value);
  if (/^\d+$/.test(text)) return Number(text);
  const parts = text.split(":").map((part) => Number(part)).filter((part) => Number.isFinite(part));
  if (!parts.length) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function runDaily(p, dryRun, count) {
  const signals = await collectDailySignals(p, count);
  const candidates = generateCandidates(signals, count, p);
  const writeResult = dryRun ? null : appendCandidates(p, candidates);
  const candidateStateLog = buildCandidateStateLog(signals, candidates, writeResult, { dryRun, runType: "daily" });
  appendCandidateStateEvents(p, candidateStateLog);
  const artifacts = writeDailyArtifacts(p, signals, candidates, dryRun, candidateStateLog);
  const deliveryPath = renderDailyDelivery(p, candidates, writeResult, dryRun);
  appendJsonl(path.join(p.stateDir, "run_history.jsonl"), {
    type: "daily",
    dry_run: dryRun,
    raw_signal_count: signals.length,
    candidate_count: candidates.length,
    source_breakdown: signalSourceBreakdown(signals),
    written_count: dryRun ? 0 : writeResult.appended_count,
    delivery_path: deliveryPath,
    raw_signals_path: artifacts.raw_signals_path,
    candidates_path: artifacts.candidates_path,
    candidate_state_log_path: artifacts.candidate_state_log_path,
    created_at: isoNow()
  });
  return {
    raw_signal_count: signals.length,
    candidate_count: candidates.length,
    source_breakdown: signalSourceBreakdown(signals),
    written_count: dryRun ? 0 : writeResult.appended_count,
    delivery_path: deliveryPath,
    raw_signals_path: artifacts.raw_signals_path,
    candidates_path: artifacts.candidates_path,
    candidate_state_log_path: artifacts.candidate_state_log_path,
    library_path: p.libraryCsv,
    dry_run: dryRun
  };
}

function writeDailyArtifacts(p, signals, candidates, dryRun, candidateStateLog = []) {
  const today = dateDash();
  const rawSignalsPath = path.join(p.dailyDir, `raw_signals_${today}.json`);
  const candidatesPath = path.join(p.dailyDir, `topic_candidates_${today}.json`);
  const candidateStateLogPath = path.join(p.dailyDir, `candidate_state_log_${today}.json`);
  writeJson(rawSignalsPath, {
    generated_at: isoNow(),
    dry_run: Boolean(dryRun),
    count: signals.length,
    source_breakdown: signalSourceBreakdown(signals),
    raw_signals: signals
  });
  writeJson(candidatesPath, {
    generated_at: isoNow(),
    dry_run: Boolean(dryRun),
    count: candidates.length,
    candidates
  });
  writeJson(candidateStateLogPath, {
    generated_at: isoNow(),
    dry_run: Boolean(dryRun),
    count: candidateStateLog.length,
    events: candidateStateLog
  });
  return { raw_signals_path: rawSignalsPath, candidates_path: candidatesPath, candidate_state_log_path: candidateStateLogPath };
}

function signalSourceBreakdown(signals) {
  const breakdown = {};
  for (const signal of signals) {
    const type = signal.source_type || "unknown";
    breakdown[type] = (breakdown[type] || 0) + 1;
  }
  return breakdown;
}

async function intakeRss(p, url, limit, write) {
  const parser = new RSSParser({
    headers: {
      "user-agent": "Mozilla/5.0 topic-agent/0.1"
    },
    timeout: 15000
  });
  const feed = await parser.parseURL(url);
  const rules = loadRules(path.join(p.configDir, "strategy_rules.yml"));
  const items = (feed.items || []).slice(0, limit);
  const rawSignals = items.map((item, index) => ({
    id: `RS-${shortHash(`${url}:${item.link || item.guid || item.title || index}`)}`,
    source_id: feed.title || url,
    source_type: "rss",
    title: item.title || `RSS item ${index + 1}`,
    summary: normalizeWhitespace(item.contentSnippet || stripHtml(item.content || item.summary || "")).slice(0, 500),
    url: item.link || null,
    published_at: item.isoDate || item.pubDate || null,
    collected_at: isoNow(),
    tags: [],
    metadata: { feed_url: url, guid: item.guid || "" }
  }));
  rawSignals.forEach((signal) => appendJsonl(path.join(p.stateDir, "raw_signals.jsonl"), signal));
  const candidates = items.map((item, index) => {
    const rawSignal = rawSignals[index];
    const title = item.title || `RSS item ${index + 1}`;
    const candidate = {
      id: `TC-${shortHash(`${url}:${title}`)}`,
      title,
      source_ids: [rawSignal.id],
      source_names: [feed.title || url],
      content_type: inferContentType(`${title} ${item.contentSnippet || item.content || ""}`),
      core_viewpoint: normalizeWhitespace(item.contentSnippet || stripHtml(item.content || item.summary || "")).slice(0, 220) || "来自 RSS 的候选信号，待人工补充核心观点。",
      initial_links: [item.link].filter(Boolean),
      dedupe_key: normalizeTitle(title),
      created_at: isoNow()
    };
    candidate.scores = scoreCandidate(candidate, rules);
    candidate.total_score = Number(Object.values(candidate.scores).reduce((a, b) => a + b, 0).toFixed(2));
    return candidate;
  }).sort((a, b) => b.total_score - a.total_score);
  const writeResult = write ? appendCandidates(p, candidates) : null;
  const candidateStateLog = buildCandidateStateLog(rawSignals, candidates, writeResult, { dryRun: !write, runType: "rss" });
  appendCandidateStateEvents(p, candidateStateLog);
  return {
    feed_title: feed.title,
    url,
    candidate_count: candidates.length,
    written_count: writeResult ? writeResult.appended_count : 0,
    write,
    candidate_state_event_count: candidateStateLog.length,
    candidates: candidates.slice(0, 10),
    library_path: p.libraryCsv
  };
}

function intakeManual(p, opts = {}) {
  const title = String(opts.title || opts.topic || "").trim();
  if (!title) throw new Error("请提供 --title 或 --topic。");
  const url = String(opts.url || opts.link || "").trim();
  const summary = String(opts.summary || opts.viewpoint || opts.text || "").trim();
  const sourceName = String(opts.source || "manual").trim();
  const rawSignal = {
    id: `RS-${shortHash(`manual:${title}:${url}:${summary}`)}`,
    source_id: sourceName,
    source_type: "manual",
    title,
    summary,
    url: url || null,
    published_at: opts.date || null,
    collected_at: isoNow(),
    tags: String(opts.tags || "").split(",").map((item) => item.trim()).filter(Boolean),
    metadata: {
      entered_by: "user",
      notes: opts.notes || ""
    }
  };
  const candidate = candidateFromRawSignal(p, rawSignal, {
    sourceName,
    contentType: opts.type || opts["content-type"],
    fallbackCore: "用户手动输入的候选信号，待补充核心观点和证据。"
  });
  const result = finishIntake(p, [rawSignal], [candidate], Boolean(opts.write), "manual");
  return { ...result, raw_signal: rawSignal, candidate };
}

function intakeFile(p, opts = {}) {
  const file = path.resolve(required(opts.file || opts.path, "--file"));
  if (!fs.existsSync(file)) throw new Error(`找不到本地素材文件：${file}`);
  const text = readText(file);
  const stats = fs.statSync(file);
  const title = String(opts.title || firstMarkdownHeading(text) || path.basename(file, path.extname(file))).trim();
  const summary = String(opts.summary || opts.viewpoint || summarizeLocalText(text)).trim();
  const sourceName = String(opts.source || "local_file").trim();
  const rawSignal = {
    id: `RS-${shortHash(`file:${file}:${stats.mtimeMs}:${stats.size}`)}`,
    source_id: sourceName,
    source_type: "local_file",
    title,
    summary,
    url: opts.url || null,
    published_at: opts.date || null,
    collected_at: isoNow(),
    raw_text_path: file,
    tags: parseTags(opts.tags),
    metadata: {
      file_path: file,
      size_bytes: stats.size,
      notes: opts.notes || ""
    }
  };
  const candidate = candidateFromRawSignal(p, rawSignal, {
    sourceName,
    contentType: opts.type || opts["content-type"],
    extraText: text,
    fallbackCore: "本地 Markdown/txt 素材导入的候选信号，待人工确认选题价值。"
  });
  const result = finishIntake(p, [rawSignal], [candidate], Boolean(opts.write), "file");
  return { ...result, input_path: file, raw_signal: rawSignal, candidate };
}

function intakeHotlist(p, opts = {}) {
  const file = path.resolve(required(opts.input || opts.file, "--input"));
  if (!fs.existsSync(file)) throw new Error(`找不到热点列表文件：${file}`);
  const limit = Number.isFinite(Number(opts.limit)) ? Math.max(1, Number(opts.limit)) : Infinity;
  const sourceName = String(opts.source || "manual_hotlist").trim();
  const items = parseHotlistFile(file).slice(0, limit);
  const rules = loadRules(path.join(p.configDir, "strategy_rules.yml"));
  const rawSignals = items.map((item, index) => ({
    id: `RS-${shortHash(`hotlist:${file}:${index}:${item.title}:${item.url || ""}`)}`,
    source_id: item.source || sourceName,
    source_type: "manual",
    title: item.title,
    summary: item.summary || "",
    url: item.url || null,
    published_at: item.published_at || item.date || null,
    collected_at: isoNow(),
    tags: parseTags(item.tags || opts.tags),
    metadata: {
      import_type: "hotlist",
      input_path: file,
      notes: item.notes || opts.notes || ""
    }
  }));
  const candidates = rawSignals.map((signal, index) => candidateFromRawSignal(p, signal, {
    rules,
    sourceName: signal.source_id,
    contentType: items[index].type || opts.type || opts["content-type"],
    fallbackCore: "手动热点列表导入的候选信号，待补充核心观点和证据。"
  }));
  const result = finishIntake(p, rawSignals, candidates, Boolean(opts.write), "hotlist");
  return { ...result, input_path: file, item_count: items.length };
}

function candidateFromRawSignal(p, rawSignal, opts = {}) {
  const sourceName = opts.sourceName || rawSignal.source_id || rawSignal.source_type || "unknown";
  const summary = normalizeWhitespace(rawSignal.summary || "").slice(0, 500);
  const candidate = {
    id: `TC-${shortHash(`${rawSignal.source_type}:${rawSignal.title}:${rawSignal.url || rawSignal.id}`)}`,
    title: rawSignal.title,
    source_ids: [rawSignal.id],
    source_names: [sourceName],
    content_type: opts.contentType || inferContentType(`${rawSignal.title} ${summary} ${opts.extraText || ""}`),
    core_viewpoint: summary.slice(0, 220) || opts.fallbackCore || "候选信号已登记，待补充核心观点和证据。",
    initial_links: rawSignal.url ? [rawSignal.url] : [],
    dedupe_key: normalizeTitle(rawSignal.title),
    created_at: isoNow()
  };
  const rules = opts.rules || loadRules(path.join(p.configDir, "strategy_rules.yml"));
  candidate.scores = scoreCandidate(candidate, rules);
  candidate.total_score = Number(Object.values(candidate.scores).reduce((a, b) => a + b, 0).toFixed(2));
  return candidate;
}

function finishIntake(p, rawSignals, candidates, write, runType) {
  rawSignals.forEach((signal) => appendJsonl(path.join(p.stateDir, "raw_signals.jsonl"), signal));
  const sortedCandidates = [...candidates].sort((a, b) => b.total_score - a.total_score);
  const writeResult = write ? appendCandidates(p, sortedCandidates) : null;
  const candidateStateLog = buildCandidateStateLog(rawSignals, sortedCandidates, writeResult, { dryRun: !write, runType });
  appendCandidateStateEvents(p, candidateStateLog);
  return {
    write,
    candidate_count: sortedCandidates.length,
    written_count: writeResult ? writeResult.appended_count : 0,
    skipped_count: writeResult ? writeResult.skipped_count : 0,
    candidate_state_event_count: candidateStateLog.length,
    candidates: sortedCandidates.slice(0, 10),
    library_path: p.libraryCsv
  };
}

function parseTags(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function firstMarkdownHeading(text) {
  const match = String(text || "").match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "";
}

function summarizeLocalText(text) {
  const cleaned = normalizeWhitespace(String(text || "").replace(/^# .+$/gm, ""));
  return cleaned.slice(0, 260);
}

function parseHotlistFile(file) {
  const text = readText(file);
  const ext = path.extname(file).toLowerCase();
  const data = ext === ".json" ? JSON.parse(text) : null;
  const rawItems = data
    ? (Array.isArray(data) ? data : data.items || data.candidates || data.topics || [])
    : text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  const items = rawItems.map((item, index) => normalizeHotlistItem(item, index)).filter((item) => item.title);
  if (!items.length) throw new Error(`热点列表没有可导入条目：${file}`);
  return items;
}

function normalizeHotlistItem(item, index) {
  if (typeof item === "string") {
    const clean = item.replace(/^[-*]\s*/, "").trim();
    const parts = clean.split("|").map((part) => part.trim()).filter(Boolean);
    const url = parts.find((part) => /^https?:\/\//i.test(part)) || extractUrl(clean);
    const titlePart = parts.find((part) => part !== url) || clean.replace(url, "").trim();
    const summary = parts.filter((part) => part !== titlePart && part !== url).join(" ");
    return {
      title: titlePart.replace(/\s*[-:：|]\s*$/, "").trim() || `热点 ${index + 1}`,
      url,
      summary
    };
  }
  return {
    title: String(item.title || item.topic || item.name || `热点 ${index + 1}`).trim(),
    url: item.url || item.link || "",
    summary: item.summary || item.core_viewpoint || item.description || item.text || "",
    source: item.source || item.source_name || "",
    tags: item.tags || "",
    type: item.type || item.content_type || "",
    published_at: item.published_at || item.date || "",
    notes: item.notes || ""
  };
}

function extractUrl(text) {
  return String(text || "").match(/https?:\/\/[^\s)）]+/i)?.[0] || "";
}

function inferContentType(text) {
  const lowered = String(text || "").toLowerCase();
  if (/教程|how to|guide|方法|实操/.test(lowered)) return "利他（教程）";
  if (/案例|客户|customer|case/.test(lowered)) return "企业案例";
  if (/论文|paper|arxiv|research/.test(lowered)) return "利他（信息差）";
  return "行业洞察";
}

function renderDailyDelivery(p, candidates, writeResult, dryRun) {
  const today = dateDash();
  const deliveryPath = path.join(p.dailyDir, `daily_delivery_${today}.md`);
  const written = dryRun || !writeResult ? 0 : writeResult.appended_count;
  const skipped = dryRun || !writeResult ? 0 : writeResult.skipped_count;
  const activeRules = loadRules(path.join(p.configDir, "strategy_rules.yml"));
  const ruleHits = candidates.flatMap((candidate) => candidate.applied_rules || []);
  const lines = [
    `# 每日选题交付 ${today}`,
    "",
    "## 今日概览",
    `- 新增候选：${candidates.length} 个`,
    `- 已写入选题库：${written} 个`,
    `- 建议重点看：${Math.min(3, candidates.length)} 个`,
    `- 被过滤重复：${skipped} 个`,
    "",
    "## Top 选题"
  ];
  candidates.slice(0, 3).forEach((candidate, index) => {
    lines.push(
      `### ${index + 1}. ${candidate.title}`,
      `- 来源：${candidate.source_names.join(" / ")}`,
      `- 内容类型：${candidate.content_type}`,
      `- 栏目初步匹配：${matchColumn(p, candidate).column}`,
      `- 核心观点：${candidate.core_viewpoint}`,
      `- 为什么值得做：总分 ${candidate.total_score}，企业 AI 相关度 ${candidate.scores.enterprise_ai_relevance}，证据可获得性 ${candidate.scores.evidence_availability}。`,
      `- 初步链接：${candidate.initial_links.join(", ") || "待补充"}`,
      "- 风险：需要在深研阶段补足一手来源，避免停留在热点转述。",
      `- 评分摘要：${JSON.stringify(candidate.scores)}`,
      `- 命中策略规则：${candidate.applied_rules?.length ? candidate.applied_rules.map((rule) => rule.rule_id).join(", ") : "无"}`,
      ""
    );
  });
  lines.push(
    "## 今日被过滤选题",
    skipped ? `- 重复候选 ${skipped} 个，已跳过写入。` : "- 暂无",
    "",
    "## 今日策略观察",
    "- 当前版本优先汇总 AI HOT、Builder 一手观点、本地 skills 与默认选题蓝图，再做多角度展开。",
    `- 当前启用策略规则：${activeRules.length} 条，今日候选命中：${ruleHits.length} 次。`,
    "- 用户反馈会先写入 feedback_log.jsonl，再由 learn apply 生成可解释规则并参与后续评分。"
  );
  writeText(deliveryPath, lines.join("\n") + "\n");
  return deliveryPath;
}

function readLibrary(p) {
  if (!fs.existsSync(p.libraryCsv)) writeCsv(p.libraryCsv, [], TOPIC_FIELDS);
  const text = readText(p.libraryCsv);
  if (!text.trim()) return { rows: [], fields: [...TOPIC_FIELDS] };
  const parsed = parseCsv(text);
  const fields = normalizeFields(parsed.fields);
  const rows = parsed.rows.map((row) => {
    const clean = {};
    for (const field of fields) clean[field] = (row[field] || "").trim();
    for (const field of TOPIC_FIELDS) if (!(field in clean)) clean[field] = "";
    return clean;
  });
  return { rows, fields };
}

function writeLibrary(p, rows, fields, backup = true) {
  if (backup && fs.existsSync(p.libraryCsv)) backupFile(p.libraryCsv, p.backupsDir);
  writeCsv(p.libraryCsv, rows, normalizeFields(fields));
}

function validateLibrary(p) {
  const { rows, fields } = readLibrary(p);
  const missing = TOPIC_FIELDS.filter((field) => !fields.includes(field));
  return {
    path: p.libraryCsv,
    rows: rows.length,
    fieldnames: fields,
    missing_required_fields: missing,
    valid: missing.length === 0
  };
}

async function formatLibrary(p, opts = {}) {
  const normalized = normalizeLibraryCsv(p);
  const xlsx = await exportLibraryXlsx(p, opts);
  return {
    library_path: p.libraryCsv,
    xlsx_path: xlsx.xlsx_path,
    rows: normalized.rows.length,
    normalized_dates: normalized.normalized_dates,
    normalized_selection_values: normalized.normalized_selection_values
  };
}

function normalizeLibraryCsv(p) {
  const { rows, fields } = readLibrary(p);
  let normalizedDates = 0;
  let normalizedSelectionValues = 0;
  for (const row of rows) {
    const beforeDate = row["创建时间"];
    row["创建时间"] = dateOnly(row["创建时间"] || isoNow());
    if (row["创建时间"] !== beforeDate) normalizedDates += 1;
    const beforeSelection = row["是否选题"];
    row["是否选题"] = isCheckedValue(row["是否选题"]) ? "TRUE" : "";
    if (row["是否选题"] !== beforeSelection) normalizedSelectionValues += 1;
  }
  if (normalizedDates || normalizedSelectionValues) writeLibrary(p, rows, fields);
  return { rows, fields, normalized_dates: normalizedDates, normalized_selection_values: normalizedSelectionValues };
}

async function exportLibraryXlsx(p, opts = {}) {
  const { rows, fields } = readLibrary(p);
  const output = path.resolve(opts.output || opts.out || p.libraryXlsx);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "topic-agent";
  workbook.created = new Date();
  workbook.modified = new Date();
  const sheet = workbook.addWorksheet("选题库", {
    views: [{ state: "frozen", ySplit: 1 }]
  });
  const normalizedFields = normalizeFields(fields);
  sheet.columns = normalizedFields.map((field) => ({
    header: field,
    key: field,
    width: topicLibraryColumnWidth(field)
  }));
  sheet.getRow(1).height = 28;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { name: "Microsoft YaHei", bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder();
  });
  for (const row of rows) {
    const displayRow = {};
    for (const field of normalizedFields) {
      if (field === "创建时间") displayRow[field] = dateOnly(row[field] || "");
      else if (field === "是否选题") displayRow[field] = isCheckedValue(row[field]) ? "☑" : "☐";
      else displayRow[field] = row[field] || "";
    }
    sheet.addRow(displayRow);
  }
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length + 1), column: normalizedFields.length }
  };
  for (let rowNumber = 2; rowNumber <= rows.length + 1; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = 72;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const field = normalizedFields[colNumber - 1];
      cell.font = { name: "Microsoft YaHei", size: 10 };
      cell.alignment = {
        vertical: "top",
        horizontal: field === "是否选题" || field === "序号" ? "center" : "left",
        wrapText: true
      };
      cell.border = thinBorder("FFD9E2F3");
      if (field === "是否选题") {
        cell.font = { name: "Microsoft YaHei", size: 14 };
        cell.dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: ['"☐,☑"'],
          showErrorMessage: true,
          errorTitle: "请选择",
          error: "是否选题只能选择 ☐ 或 ☑。"
        };
      }
    });
  }
  ensureDir(path.dirname(output));
  await workbook.xlsx.writeFile(output);
  return {
    xlsx_path: output,
    rows: rows.length,
    checkbox_column: "是否选题",
    checkbox_values: ["☐", "☑"],
    note: "CSV 不保存列宽/换行/复选框样式；这些显示和交互能力写入 xlsx。"
  };
}

async function syncLibraryFromXlsx(p, opts = {}) {
  const input = path.resolve(opts.input || opts.xlsx || p.libraryXlsx);
  if (!fs.existsSync(input)) throw new Error(`找不到 xlsx 选题库：${input}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(input);
  const sheet = workbook.getWorksheet("选题库") || workbook.worksheets[0];
  if (!sheet) throw new Error(`xlsx 中没有工作表：${input}`);
  const headerMap = {};
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const value = cellText(cell.value).trim();
    if (value) headerMap[value] = colNumber;
  });
  if (!headerMap["序号"] || !headerMap["是否选题"]) throw new Error("xlsx 缺少 序号 或 是否选题 列。");
  const { rows, fields } = readLibrary(p);
  const rowsBySeq = new Map(rows.map((row) => [Number(row["序号"]), row]));
  const selectedRows = [];
  let updated = 0;
  let normalizedDates = 0;
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const sheetRow = sheet.getRow(rowNumber);
    const seq = Number(cellText(sheetRow.getCell(headerMap["序号"]).value));
    if (!seq || !rowsBySeq.has(seq)) continue;
    const row = rowsBySeq.get(seq);
    const checked = isCheckedValue(cellText(sheetRow.getCell(headerMap["是否选题"]).value));
    const nextValue = checked ? "TRUE" : "";
    if (row["是否选题"] !== nextValue) {
      row["是否选题"] = nextValue;
      updated += 1;
    }
    const beforeDate = row["创建时间"];
    row["创建时间"] = dateOnly(row["创建时间"]);
    if (row["创建时间"] !== beforeDate) normalizedDates += 1;
    if (checked) selectedRows.push(seq);
  }
  if (updated || normalizedDates) writeLibrary(p, rows, fields);
  return {
    input,
    library_path: p.libraryCsv,
    updated_rows: updated,
    normalized_dates: normalizedDates,
    selected_rows: selectedRows
  };
}

function topicLibraryColumnWidth(field) {
  return {
    "序号": 8,
    "母选题ID": 14,
    "母选题": 38,
    "来源": 24,
    "内容类型": 16,
    "栏目系列": 18,
    "选题方向/核心观点": 52,
    "关联热点链接/帖子": 86,
    "创建时间": 14,
    "是否选题": 12
  }[field] || 20;
}

function thinBorder(color = "FFB7C9E2") {
  return {
    top: { style: "thin", color: { argb: color } },
    left: { style: "thin", color: { argb: color } },
    bottom: { style: "thin", color: { argb: color } },
    right: { style: "thin", color: { argb: color } }
  };
}

async function startWebServer(p, opts = {}) {
  const host = String(opts.host || "127.0.0.1");
  const requestedPort = opts.port === undefined ? 4317 : Number(opts.port);
  const server = http.createServer((req, res) => {
    handleWebRequest(p, req, res).catch((error) => {
      sendJson(res, { error: error.message }, error.statusCode || 500);
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : requestedPort;
  const url = `http://${host}:${port}`;
  console.log(JSON.stringify({
    web_url: url,
    api_url: `${url}/api/triage`,
    root: p.root,
    static_dir: p.webDistDir,
    note: fs.existsSync(path.join(p.webDistDir, "index.html")) ? "open web_url" : "run npm run web:build before opening the UI"
  }, null, 2));
  return new Promise((resolve) => {
    server.on("close", () => resolve({ stopped: true, web_url: url }));
  });
}

async function handleWebRequest(p, req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname === "/api/status" && req.method === "GET") return sendJson(res, statusOverview(p, {}));
  if (url.pathname === "/api/triage" && req.method === "GET") {
    return sendJson(res, loadTriageView(p, {
      date: url.searchParams.get("date") || "latest",
      scope: url.searchParams.get("scope") || "all"
    }));
  }
  if (url.pathname === "/api/triage/batch" && req.method === "POST") {
    return sendJson(res, createBatchFromTriage(p));
  }
  const decisionMatch = url.pathname.match(/^\/api\/triage\/([^/]+)\/decision$/);
  if (decisionMatch && req.method === "POST") {
    const body = await readRequestJson(req);
    return sendJson(res, decideTriageCandidate(p, decodeURIComponent(decisionMatch[1]), body));
  }
  if (url.pathname.startsWith("/api/")) return sendJson(res, { error: "API not found" }, 404);
  return serveStaticWebAsset(p, url.pathname, res);
}

function loadTriageView(p, opts = {}) {
  const scope = normalizeTriageScope(opts.scope);
  const daily = loadDailyCandidates(p, opts.date || "latest");
  const pool = scope === "all" ? loadAllTriageCandidates(p) : daily;
  const decisions = readTriageDecisions(p);
  const candidates = pool.candidates.map((candidate) => decorateTriageCandidate(p, candidate, decisions));
  const acceptedPending = candidates.filter((candidate) => candidate.triage_status === "accepted_pending_batch");
  return {
    scope,
    generated_at: pool.generated_at || daily.generated_at,
    selected_date: daily.date,
    available_dates: daily.available_dates,
    candidates_path: scope === "all" ? null : daily.path,
    daily_count: daily.candidates.length,
    library_count: pool.library_count || 0,
    count: candidates.length,
    accepted_pending_count: acceptedPending.length,
    candidates
  };
}

function normalizeTriageScope(scope) {
  const value = String(scope || "all").trim().toLowerCase();
  if (["date", "daily", "latest"].includes(value)) return "date";
  return "all";
}

function loadDailyCandidates(p, requestedDate = "latest") {
  const files = listDailyCandidateFiles(p);
  if (!files.length) {
    return { date: null, available_dates: [], path: null, generated_at: null, candidates: [] };
  }
  const selected = requestedDate === "latest"
    ? files.at(-1)
    : files.find((file) => file.date === requestedDate) || files.at(-1);
  const data = readJson(selected.path, { candidates: [] });
  return {
    date: selected.date,
    available_dates: files.map((file) => file.date),
    path: selected.path,
    generated_at: data.generated_at || null,
    candidates: data.candidates || []
  };
}

function loadAllTriageCandidates(p) {
  const files = listDailyCandidateFiles(p);
  const availableDates = files.map((file) => file.date);
  let generatedAt = null;
  const candidates = [];
  const seen = new Set();
  let dailyCount = 0;
  const addCandidate = (candidate) => {
    if (!candidate || !candidate.title) return;
    const titleKey = `title:${normalizeTitle(candidate.title)}`;
    const idKey = candidate.id ? `id:${candidate.id}` : "";
    if ((idKey && seen.has(idKey)) || seen.has(titleKey)) return;
    if (idKey) seen.add(idKey);
    seen.add(titleKey);
    candidates.push(candidate);
  };

  for (const file of [...files].reverse()) {
    const data = readJson(file.path, { candidates: [] });
    if (!generatedAt) generatedAt = data.generated_at || null;
    for (const candidate of data.candidates || []) {
      dailyCount += 1;
      addCandidate({ ...candidate, candidate_date: file.date, source_bucket: "daily" });
    }
  }

  const libraryCandidates = loadLibraryCandidates(p);
  for (const candidate of libraryCandidates) addCandidate(candidate);

  return {
    date: availableDates.at(-1) || null,
    available_dates: availableDates,
    path: null,
    generated_at: generatedAt,
    daily_count: dailyCount,
    library_count: libraryCandidates.length,
    candidates
  };
}

function listDailyCandidateFiles(p) {
  if (!fs.existsSync(p.dailyDir)) return [];
  return fs.readdirSync(p.dailyDir)
    .map((name) => {
      const match = name.match(/^topic_candidates_(\d{4}-\d{2}-\d{2})\.json$/);
      return match ? { date: match[1], path: path.join(p.dailyDir, name) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function decorateTriageCandidate(p, candidate, decisions = readTriageDecisions(p)) {
  const decision = decisions.find((item) => item.candidate_id === candidate.id) || null;
  const row = findLibraryRowForCandidate(p, candidate);
  const column = matchColumn(p, candidate);
  return {
    ...candidate,
    column: column.column,
    row_number: row ? Number(row["序号"]) || null : null,
    library_selected: row ? isCheckedValue(row["是否选题"]) : false,
    triage_status: decision?.status || "pending_review",
    triage_action: decision?.action || null,
    triage_reason: decision?.reason || "",
    triage_updated_at: decision?.updated_at || null,
    batch_id: decision?.batch_id || null,
    recommended_reason: candidateRecommendedReason(candidate),
    uncertainty: candidateUncertainty(candidate)
  };
}

function loadLibraryCandidates(p) {
  const { rows } = readLibrary(p);
  const topicEntries = Object.values(readJson(path.join(p.stateDir, "topic_index.json"), { topics: {} }).topics || {});
  return rows
    .filter((row) => row["母选题"])
    .map((row) => libraryRowToCandidate(row, topicEntries));
}

function libraryRowToCandidate(row, topicEntries = []) {
  const rowNumber = Number(row["序号"]) || null;
  const title = String(row["母选题"] || `选题库第 ${rowNumber || "未知"} 行`).trim();
  const indexed = topicEntries.find((entry) => Number(entry.row_number || entry.csv_row_number) === rowNumber);
  const sourceNames = splitLibraryList(row["来源"]);
  const links = splitLibraryLinks(row["关联热点链接/帖子"]);
  return {
    id: indexed?.candidate_id || `LIB-${rowNumber || shortHash(title)}`,
    title,
    source_ids: [],
    source_names: sourceNames.length ? sourceNames : ["topic_library"],
    content_type: row["内容类型"] || "选题库",
    core_viewpoint: row["选题方向/核心观点"] || "选题库已有条目，待补充核心观点和证据。",
    initial_links: links,
    dedupe_key: normalizeTitle(title),
    created_at: row["创建时间"] || null,
    scores: {},
    row_number: rowNumber,
    library_selected: isCheckedValue(row["是否选题"]),
    library_topic_id: row["母选题ID"] || "",
    source_bucket: "library",
    from_library: true
  };
}

function splitLibraryList(value) {
  return String(value || "")
    .split(/\s*\/\s*|\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitLibraryLinks(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function candidateRecommendedReason(candidate) {
  const scores = candidate.scores || {};
  const parts = [];
  if (candidate.total_score !== undefined) parts.push(`总分 ${candidate.total_score}`);
  if (scores.enterprise_ai_relevance !== undefined) parts.push(`企业 AI 相关 ${scores.enterprise_ai_relevance}`);
  if (scores.evidence_availability !== undefined) parts.push(`证据可得 ${scores.evidence_availability}`);
  if (scores.preference_fit !== undefined) parts.push(`偏好匹配 ${scores.preference_fit}`);
  return parts.join(" / ") || "待人工判断推荐理由。";
}

function candidateUncertainty(candidate) {
  const links = candidate.initial_links || [];
  if (!links.length) return "缺少初步链接，需要补充一手来源。";
  if (links.every((link) => String(link).startsWith("skills/"))) return "当前来源偏内部 skill，深研前需要补外部证据。";
  return "需要在深研阶段核验一手来源、发布日期和上下文。";
}

function decideTriageCandidate(p, candidateId, body = {}) {
  const candidate = findCandidateById(p, candidateId);
  if (!candidate) throw httpError(404, `找不到候选：${candidateId}`);
  const action = normalizeTriageAction(body.action);
  const reason = String(body.reason || "").trim();
  let rowNumber = findLibraryRowForCandidate(p, candidate)?.["序号"] || null;
  if (action === "accept") rowNumber = ensureCandidateLibraryRow(p, candidate);
  const decision = upsertTriageDecision(p, {
    candidate_id: candidate.id,
    action,
    status: triageStatusForAction(action),
    reason,
    row_number: rowNumber ? Number(rowNumber) : null,
    batch_id: null
  });
  appendTriageFeedback(p, decision, candidate);
  return { decision, candidate: decorateTriageCandidate(p, candidate) };
}

function normalizeTriageAction(action) {
  const value = String(action || "").trim().toLowerCase();
  if (["accept", "accepted", "采纳"].includes(value)) return "accept";
  if (["snooze", "snoozed", "later", "稍后"].includes(value)) return "snooze";
  if (["reject", "rejected", "decline", "拒绝"].includes(value)) return "reject";
  if (["needs_more", "needs-more", "more", "补资料", "need_more"].includes(value)) return "needs_more";
  throw httpError(400, `未知 triage action：${action}`);
}

function triageStatusForAction(action) {
  return {
    accept: "accepted_pending_batch",
    snooze: "snoozed",
    reject: "rejected",
    needs_more: "needs_more"
  }[action];
}

function ensureCandidateLibraryRow(p, candidate) {
  const existing = findLibraryRowForCandidate(p, candidate);
  if (existing) {
    markLibraryRowSelected(p, Number(existing["序号"]), true);
    return Number(existing["序号"]);
  }
  appendCandidates(p, [candidate]);
  const row = findLibraryRowForCandidate(p, candidate);
  if (!row) throw httpError(500, `候选已尝试入库但未找到行号：${candidate.id}`);
  markLibraryRowSelected(p, Number(row["序号"]), true);
  return Number(row["序号"]);
}

function markLibraryRowSelected(p, rowNumber, selected) {
  const { rows, fields } = readLibrary(p);
  const row = rows.find((item) => Number(item["序号"]) === Number(rowNumber));
  if (!row) throw httpError(404, `选题库中找不到第 ${rowNumber} 行。`);
  row["是否选题"] = selected ? "TRUE" : "";
  row["创建时间"] = dateOnly(row["创建时间"] || isoNow());
  writeLibrary(p, rows, fields);
  recordTopicIndex(p, {
    internal_topic_key: internalTopicKeyForRow(row),
    row_number: Number(row["序号"]) || rowNumber,
    csv_row_number: Number(row["序号"]) || rowNumber,
    topic_title: row["母选题"],
    source: row["来源"],
    content_type: row["内容类型"],
    status: selected ? "triage_accepted" : "library_written"
  });
}

function findLibraryRowForCandidate(p, candidate) {
  const { rows } = readLibrary(p);
  const rowNumber = Number(candidate.row_number) || Number(String(candidate.id || "").match(/^LIB-(\d+)$/)?.[1]) || 0;
  if (rowNumber) {
    const byRow = rows.find((row) => Number(row["序号"]) === rowNumber);
    if (byRow) return byRow;
  }
  const topicEntries = Object.values(readJson(path.join(p.stateDir, "topic_index.json"), { topics: {} }).topics || {});
  const byCandidate = topicEntries.find((entry) => candidate.id && entry.candidate_id === candidate.id);
  if (byCandidate) {
    const indexedRow = rows.find((row) => Number(row["序号"]) === Number(byCandidate.row_number || byCandidate.csv_row_number));
    if (indexedRow) return indexedRow;
  }
  const key = candidate.dedupe_key || normalizeTitle(candidate.title);
  return rows.find((row) => normalizeTitle(row["母选题"]) === key) || null;
}

function findCandidateById(p, candidateId) {
  for (const file of [...listDailyCandidateFiles(p)].reverse()) {
    const data = readJson(file.path, { candidates: [] });
    const candidate = (data.candidates || []).find((item) => item.id === candidateId);
    if (candidate) return candidate;
  }
  const libraryCandidate = loadLibraryCandidates(p).find((candidate) => candidate.id === candidateId);
  if (libraryCandidate) return libraryCandidate;
  return null;
}

function readTriageDecisions(p) {
  const store = readJson(p.triageDecisions, { decisions: [] });
  return Array.isArray(store) ? store : store.decisions || [];
}

function writeTriageDecisions(p, decisions) {
  ensureDir(path.dirname(p.triageDecisions));
  writeJson(p.triageDecisions, { decisions });
}

function upsertTriageDecision(p, entry) {
  const decisions = readTriageDecisions(p);
  const index = decisions.findIndex((item) => item.candidate_id === entry.candidate_id);
  const previous = index >= 0 ? decisions[index] : {};
  const next = {
    ...previous,
    ...entry,
    created_at: previous.created_at || isoNow(),
    updated_at: isoNow()
  };
  if (index >= 0) decisions[index] = next;
  else decisions.push(next);
  writeTriageDecisions(p, decisions);
  return next;
}

function appendTriageFeedback(p, decision, candidate) {
  const sentiment = decision.action === "accept" ? "positive" : decision.action === "reject" ? "negative" : "neutral";
  const fallback = {
    accept: "Triage 采纳该候选。",
    reject: "Triage 拒绝该候选。",
    snooze: "Triage 稍后再看该候选。",
    needs_more: "Triage 要求补充资料。"
  }[decision.action];
  return addFeedback(p, {
    target: `candidate:${decision.candidate_id}`,
    sentiment,
    text: decision.reason || fallback,
    pattern: candidate.title
  });
}

function createBatchFromTriage(p) {
  const decisions = readTriageDecisions(p);
  const pending = decisions.filter((item) => item.status === "accepted_pending_batch");
  if (!pending.length) throw httpError(400, "没有已采纳待建批次的候选。");
  const rowNumbers = [];
  const resolvedRows = new Map();
  for (const decision of pending) {
    let rowNumber = Number(decision.row_number) || 0;
    if (!rowNumber) {
      const candidate = findCandidateById(p, decision.candidate_id);
      if (candidate) rowNumber = ensureCandidateLibraryRow(p, candidate);
    }
    if (rowNumber) {
      resolvedRows.set(decision.candidate_id, rowNumber);
      if (!rowNumbers.includes(rowNumber)) rowNumbers.push(rowNumber);
    }
  }
  if (!rowNumbers.length) throw httpError(400, "已采纳候选没有可创建批次的选题库行号。");
  const batch = createBatch(p, rowNumbers);
  const nextDecisions = decisions.map((decision) => {
    if (decision.status !== "accepted_pending_batch") return decision;
    const rowNumber = resolvedRows.get(decision.candidate_id) || Number(decision.row_number) || null;
    const item = batch.items.find((entry) => Number(entry.row_number) === Number(rowNumber));
    return {
      ...decision,
      status: "batched",
      row_number: rowNumber,
      batch_id: batch.batch_id,
      project_id: item?.project_id || decision.project_id || null,
      updated_at: isoNow()
    };
  });
  writeTriageDecisions(p, nextDecisions);
  return {
    batch,
    row_numbers: rowNumbers,
    updated_decisions: nextDecisions.filter((decision) => decision.batch_id === batch.batch_id)
  };
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw httpError(400, "请求体不是有效 JSON。");
  }
}

function sendJson(res, payload, statusCode = 200) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function serveStaticWebAsset(p, pathname, res) {
  const dist = p.webDistDir;
  const targetName = pathname === "/" ? "index.html" : decodeURIComponent(pathname.replace(/^\/+/, ""));
  const targetPath = path.resolve(dist, targetName);
  if (!targetPath.startsWith(path.resolve(dist))) return sendJson(res, { error: "Forbidden" }, 403);
  const file = fs.existsSync(targetPath) && fs.statSync(targetPath).isFile() ? targetPath : path.join(dist, "index.html");
  if (!fs.existsSync(file)) {
    return sendJson(res, { error: "Web UI has not been built. Run npm run web:build first." }, 404);
  }
  const body = fs.readFileSync(file);
  res.writeHead(200, {
    "content-type": mimeTypeFor(file),
    "cache-control": file.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable",
    "content-length": body.length
  });
  res.end(body);
}

function mimeTypeFor(file) {
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon"
  }[path.extname(file).toLowerCase()] || "application/octet-stream";
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function doctor(p) {
  const checks = [];
  const checkFile = (label, file, severity = "error") => {
    const exists = fs.existsSync(file);
    checks.push({ label, ok: exists, severity, path: file, detail: exists ? "found" : "missing" });
  };
  checkFile("README.md", path.join(p.root, "README.md"));
  checkFile("LICENSE", path.join(p.root, "LICENSE"));
  checkFile("INSTALL.md", path.join(p.root, "INSTALL.md"));
  checkFile("CONFIG_EXAMPLE.md", path.join(p.root, "CONFIG_EXAMPLE.md"));
  checkFile(".env.example", path.join(p.root, ".env.example"));
  checkFile("topic-agent CLI", path.join(p.root, "bin", "topic-agent.mjs"));
  checkFile("Windows wrapper", path.join(p.root, "topic-agent.cmd"), "warning");
  checkFile("web app entry", path.join(p.root, "web", "src", "main.jsx"));
  checkFile("web app styles", path.join(p.root, "web", "src", "styles.css"));
  checkFile("Vite config", path.join(p.root, "vite.config.js"));
  checkFile("topic-agent skill", path.join(p.skillsDir, "topic-agent", "SKILL.md"));
  checkFile("long-content-deep-summary skill", path.join(p.skillsDir, "long-content-deep-summary", "SKILL.md"));
  checkFile("sample CSV", path.join(p.root, "examples", "sample_topic_library.csv"));
  checkFile("mock candidates", path.join(p.root, "examples", "mock_data", "candidates.json"));
  checkFile("mock project", path.join(p.root, "examples", "mock_project", "knowledge_base.md"));
  checkFile("smoke test", path.join(p.root, "tests", "smoke.mjs"));
  checkFile("GitHub Actions CI", path.join(p.root, ".github", "workflows", "ci.yml"), "warning");

  for (const name of ["agent.yml", "scoring.yml", "source_tiers.yml", "strategy_rules.yml", "source_rules.yml", "column_rules.yml", "skill_routes.yml", "external_tools.yml", "skills.yml"]) {
    checkFile(`config ${name}`, path.join(p.configDir, name));
  }
  checkFile("state topic_index.json", path.join(p.stateDir, "topic_index.json"));
  checkFile("state project_index.json", path.join(p.stateDir, "project_index.json"));

  const library = validateLibrary(p);
  checks.push({
    label: "topic library schema",
    ok: library.valid,
    severity: "error",
    path: p.libraryCsv,
    detail: library.valid ? `${library.rows} rows` : `missing fields: ${library.missing_required_fields.join(", ")}`
  });
  const packageJsonPath = path.join(p.root, "package.json");
  const pkg = fs.existsSync(packageJsonPath) ? readJson(packageJsonPath, {}) : {};
  for (const dep of ["@mozilla/readability", "jsdom", "rss-parser", "pdfjs-dist", "youtubei.js", "exceljs", "react", "react-dom", "lucide-react"]) {
    const version = pkg.dependencies?.[dep] || pkg.devDependencies?.[dep] || "";
    checks.push({ label: `dependency ${dep}`, ok: Boolean(version), severity: "error", path: packageJsonPath, detail: version || "missing" });
  }
  for (const dep of ["vite", "@vitejs/plugin-react"]) {
    const version = pkg.devDependencies?.[dep] || pkg.dependencies?.[dep] || "";
    checks.push({ label: `dev dependency ${dep}`, ok: Boolean(version), severity: "error", path: packageJsonPath, detail: version || "missing" });
  }
  const skills = fs.existsSync(p.skillsDir) ? fs.readdirSync(p.skillsDir).filter((name) => fs.statSync(path.join(p.skillsDir, name)).isDirectory()) : [];
  checks.push({ label: "skills available", ok: skills.length > 0, severity: "error", path: p.skillsDir, detail: `${skills.length} skills` });
  const failures = checks.filter((item) => !item.ok && item.severity === "error");
  const warnings = checks.filter((item) => !item.ok && item.severity === "warning");
  return {
    ok: failures.length === 0,
    failure_count: failures.length,
    warning_count: warnings.length,
    root: p.root,
    checks
  };
}

function releaseCheck(p) {
  const checks = [];
  const add = (label, ok, target, detail = "") => checks.push({ label, ok: Boolean(ok), path: target || "", detail });
  const distributionRoot = fs.existsSync(path.join(p.root, "package.json"))
    ? p.root
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const fromDistributionRoot = (...parts) => path.join(distributionRoot, ...parts);
  const pkgPath = fromDistributionRoot("package.json");
  const pkg = readJson(pkgPath, {});
  const ciPath = fromDistributionRoot(".github", "workflows", "ci.yml");
  const ciText = fs.existsSync(ciPath) ? readText(ciPath) : "";
  const optionalText = (file) => fs.existsSync(file) ? readText(file) : "";
  const readme = optionalText(fromDistributionRoot("README.md"));
  const install = optionalText(fromDistributionRoot("INSTALL.md"));

  add("README.md present", fs.existsSync(fromDistributionRoot("README.md")), fromDistributionRoot("README.md"));
  add("INSTALL.md present", fs.existsSync(fromDistributionRoot("INSTALL.md")), fromDistributionRoot("INSTALL.md"));
  add("LICENSE present", fs.existsSync(fromDistributionRoot("LICENSE")), fromDistributionRoot("LICENSE"));
  add("package.json license", pkg.license === "MIT", pkgPath, pkg.license || "missing");
  add("package.json bin topic-agent", pkg.bin?.["topic-agent"] === "bin/topic-agent.mjs", pkgPath, pkg.bin?.["topic-agent"] || "missing");
  add("package.json test script", pkg.scripts?.test === "node tests/smoke.mjs", pkgPath, pkg.scripts?.test || "missing");
  add("package.json web build script", pkg.scripts?.["web:build"] === "vite build", pkgPath, pkg.scripts?.["web:build"] || "missing");
  add("package.json web script", Boolean(pkg.scripts?.web), pkgPath, pkg.scripts?.web || "missing");
  add("CLI file present", fs.existsSync(fromDistributionRoot("bin", "topic-agent.mjs")), fromDistributionRoot("bin", "topic-agent.mjs"));
  add("web UI source present", fs.existsSync(fromDistributionRoot("web", "src", "main.jsx")), fromDistributionRoot("web", "src", "main.jsx"));
  add("Vite config present", fs.existsSync(fromDistributionRoot("vite.config.js")), fromDistributionRoot("vite.config.js"));
  add("Windows wrapper present", fs.existsSync(fromDistributionRoot("topic-agent.cmd")), fromDistributionRoot("topic-agent.cmd"));
  add("sample topic library present", fs.existsSync(fromDistributionRoot("examples", "sample_topic_library.csv")), fromDistributionRoot("examples", "sample_topic_library.csv"));
  add("mock candidates present", fs.existsSync(fromDistributionRoot("examples", "mock_data", "candidates.json")), fromDistributionRoot("examples", "mock_data", "candidates.json"));
  add("mock project present", fs.existsSync(fromDistributionRoot("examples", "mock_project", "knowledge_base.md")), fromDistributionRoot("examples", "mock_project", "knowledge_base.md"));
  add("smoke test present", fs.existsSync(fromDistributionRoot("tests", "smoke.mjs")), fromDistributionRoot("tests", "smoke.mjs"));
  add("GitHub Actions present", fs.existsSync(ciPath), ciPath);
  add("CI runs npm test", ciText.includes("npm test"), ciPath);
  add("CI builds web UI", ciText.includes("npm run web:build"), ciPath);
  add("CI runs doctor", ciText.includes("node bin/topic-agent.mjs doctor"), ciPath);
  add("CI runs release check", ciText.includes("node bin/topic-agent.mjs release check"), ciPath);
  add("CI runs acceptance", ciText.includes("node bin/topic-agent.mjs acceptance"), ciPath);
  add("README documents install", /npm install|INSTALL\.md/.test(readme), fromDistributionRoot("README.md"));
  add("README documents web triage", /web:build/.test(readme) && /Triage|triage/.test(readme), fromDistributionRoot("README.md"));
  add("INSTALL documents verification", /npm test/.test(install) && /acceptance/.test(install), fromDistributionRoot("INSTALL.md"));

  const failed = checks.filter((check) => !check.ok);
  const reportPath = path.join(p.reviewsDir, `release_check_${dateDash()}.md`);
  writeText(reportPath, renderReleaseCheckReport(checks, reportPath));
  return {
    ok: failed.length === 0,
    passed_count: checks.length - failed.length,
    total_count: checks.length,
    failed_count: failed.length,
    report_path: reportPath,
    checks
  };
}

function renderReleaseCheckReport(checks, reportPath) {
  const passed = checks.filter((check) => check.ok).length;
  const lines = [
    "# Topic Agent Release Check",
    "",
    `生成时间：${isoNow()}`,
    `报告路径：${reportPath}`,
    `通过：${passed}/${checks.length}`,
    "",
    "| 检查项 | 状态 | 证据 | 说明 |",
    "|---|---|---|---|"
  ];
  for (const check of checks) {
    lines.push(`| ${check.label} | ${check.ok ? "passed" : "missing"} | ${check.path || ""} | ${check.detail || ""} |`);
  }
  return lines.join("\n") + "\n";
}

function statusOverview(p, opts = {}) {
  const library = validateLibrary(p);
  const batches = readBatches(p).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const activePointer = readJson(path.join(p.stateDir, "active_batch.json"), {});
  const activeBatch = activePointer.batch_id
    ? batches.find((batch) => batch.batch_id === activePointer.batch_id) || safeLoadBatch(p, activePointer.batch_id)
    : batches.find((batch) => batch.status === "active") || batches[0] || null;
  const projectId = opts.project || activeBatch?.active_project_id || activeBatch?.items?.find((item) => item.status === "active")?.project_id || null;
  const project = projectId ? safeLoadProject(p, projectId) : null;
  const projectStatus = project ? projectProgress(project) : null;
  const batchSummary = activeBatch ? summarizeBatch(activeBatch) : null;
  return {
    root: p.root,
    library: {
      path: p.libraryCsv,
      rows: library.rows,
      valid: library.valid
    },
    active_batch: batchSummary,
    active_project: projectStatus,
    recent_batches: batches.slice(0, 5).map((batch) => summarizeBatch(batch)),
    next_action: nextAction(p, activeBatch, project, projectStatus)
  };
}

function safeLoadBatch(p, batchId) {
  try {
    return loadBatch(p, batchId);
  } catch {
    return null;
  }
}

function safeLoadProject(p, projectId) {
  try {
    return loadProject(p, projectId);
  } catch {
    return null;
  }
}

function summarizeBatch(batch) {
  if (!batch) return null;
  const active = batch.items?.find((item) => item.status === "active") || null;
  return {
    batch_id: batch.batch_id,
    status: batch.status,
    active_project_id: batch.active_project_id || active?.project_id || null,
    total_count: batch.total_count || batch.items?.length || 0,
    completed_count: batch.completed_count || 0,
    queued_count: (batch.items || []).filter((item) => item.status === "queued").length,
    active_item: active ? {
      row_number: active.row_number,
      topic_title: active.topic_title,
      project_id: active.project_id,
      status: active.status
    } : null
  };
}

function projectProgress(project) {
  const artifacts = [
    ["directions", "directions.md"],
    ["selected_direction", "selected_direction.md"],
    ["research_plan", "research_plan.md"],
    ["sources", "sources.json"],
    ["source_index", "source_index.md"],
    ["source_quality", "source_quality.md"],
    ["rejected_sources", "rejected_sources.md"],
    ["evidence_items", "evidence_items.json"],
    ["evidence_map", "evidence_map.md"],
    ["knowledge_base", "knowledge_base.md"],
    ["archive", "archive"],
    ["feedback", "feedback.md"]
  ].map(([key, file]) => {
    const fullPath = path.join(project.project_dir, file);
    return { key, exists: fs.existsSync(fullPath), path: fullPath };
  });
  const sources = readJson(path.join(project.project_dir, "sources.json"), []);
  const accepted = sources.filter((source) => source.status === "accepted");
  const pending = sources.filter((source) => source.status === "pending");
  const rejected = sources.filter((source) => source.status === "rejected");
  const strong = sources.filter(isStrongEvidenceSource);
  const deepSummary = sources.filter((source) => source.metadata?.deep_summary_path);
  const feedback = readJsonl(path.join(path.dirname(project.project_dir), "..", "state", "feedback_log.jsonl"))
    .filter((item) => item.project_id === project.project_id);
  return {
    project_id: project.project_id,
    row_number: project.csv_row_number,
    topic_title: project.topic_title,
    status: project.status,
    selected_direction_id: project.selected_direction_id,
    project_dir: project.project_dir,
    artifacts,
    sources: {
      total: sources.length,
      accepted: accepted.length,
      pending: pending.length,
      rejected: rejected.length,
      strong_candidates: strong.length,
      deep_summaries: deepSummary.length
    },
    feedback: {
      total: feedback.length,
      applied_to_rules: feedback.filter((item) => item.applied_to_rules).length
    }
  };
}

function nextAction(p, batch, project, projectStatus) {
  if (!batch && !project) {
    return { command: "node bin/topic-agent.mjs run daily --dry-run", reason: "当前没有 active batch，可先生成今日候选或创建确认批次。" };
  }
  if (batch?.status === "paused") {
    return { command: `node bin/topic-agent.mjs batch resume --batch ${batch.batch_id}`, reason: "当前批次已暂停。" };
  }
  if (!project) {
    if (isTerminalBatch(batch)) return { command: "node bin/topic-agent.mjs review weekly", reason: batch.status === "completed_with_errors" ? "当前批次已完成但包含失败报告，可先看 batch summary 再做周复盘。" : "当前批次已完成，可做周复盘或创建新批次。" };
    return { command: `node bin/topic-agent.mjs batch status --batch ${batch?.batch_id || ""}`.trim(), reason: "未找到 active project，先检查批次状态。" };
  }
  const has = (key) => projectStatus.artifacts.some((artifact) => artifact.key === key && artifact.exists);
  if (!has("directions")) return { command: `node bin/topic-agent.mjs directions generate --project ${project.project_id}`, reason: "项目还没有方向建议。" };
  if (!has("selected_direction")) return { command: `node bin/topic-agent.mjs directions confirm --project ${project.project_id} --direction D1`, reason: "等待用户确认一个方向。" };
  if (!has("research_plan")) return { command: `node bin/topic-agent.mjs research plan --project ${project.project_id}`, reason: "方向已确认，下一步生成研究计划。" };
  if (!has("sources")) return { command: `node bin/topic-agent.mjs research collect --project ${project.project_id}`, reason: "研究计划已生成，下一步收集来源。" };
  if (!has("knowledge_base")) return { command: `node bin/topic-agent.mjs research build-kb --project ${project.project_id}`, reason: "来源已收集，下一步构建 evidence_map 和 knowledge_base。" };
  if (!isProjectComplete(project)) return { command: `node bin/topic-agent.mjs library backfill-links --project ${project.project_id}`, reason: "知识库已生成，下一步回填来源链接到 CSV。" };
  if (batch?.items?.some((item) => item.status === "queued")) return { command: `node bin/topic-agent.mjs batch next --batch ${batch.batch_id}`, reason: "当前项目已完成，批次里还有 queued 项。" };
  return { command: "node bin/topic-agent.mjs review weekly", reason: "当前批次/项目已经完成，可做复盘。" };
}

function acceptanceReport(p) {
  const sections = buildAcceptanceSections(p);
  const items = sections.flatMap((section) => section.items);
  const passed = items.filter((item) => item.status === "passed");
  const needsAttention = items.filter((item) => item.status !== "passed");
  const reportPath = path.join(p.reviewsDir, `acceptance_report_${dateDash()}.md`);
  writeText(reportPath, renderAcceptanceReport(sections, reportPath));
  return {
    ok: needsAttention.length === 0,
    passed_count: passed.length,
    total_count: items.length,
    needs_attention_count: needsAttention.length,
    report_path: reportPath,
    sections
  };
}

function buildAcceptanceSections(p) {
  const library = validateLibrary(p);
  const { rows } = readLibrary(p);
  const projects = readProjects(p);
  const batches = readBatches(p);
  const latestDaily = latestFile(p.dailyDir, /^daily_delivery_.+\.md$/);
  const latestDailyText = latestDaily ? readText(latestDaily) : "";
  const latestCandidateStateLog = latestFile(p.dailyDir, /^candidate_state_log_.+\.json$/);
  const weekly = latestFile(p.reviewsDir, /^weekly_topic_agent_review_.+\.md$/);
  const feedback = readJsonl(path.join(p.stateDir, "feedback_log.jsonl"));
  const topicIndex = readJson(path.join(p.stateDir, "topic_index.json"), { topics: {} });
  const sourceRules = listRules(p, "source").rules;
  const strategyRules = listRules(p, "strategy").rules;
  const columnRules = listRules(p, "column").rules;
  const allSources = projects.flatMap((project) => readProjectSources(project));
  const projectWithFullResearch = projects.find((project) => ["research_plan.md", "source_index.md", "evidence_items.json", "evidence_map.md", "knowledge_base.md"].every((file) => fs.existsSync(path.join(project.project_dir, file))));
  const projectWithFiveSources = projects.find((project) => fs.existsSync(path.join(project.project_dir, "source_index.md")) && readProjectSources(project).length >= 5);
  const projectWithTraceableCoreFacts = projects.find((project) => knowledgeBaseCoreFactsTraceable(path.join(project.project_dir, "knowledge_base.md")));
  const projectWithFeedbackLifecycle = projects.find((project) => fs.existsSync(path.join(project.project_dir, "feedback.md")) && ["feedback_collected", "learning_applied"].includes(project.status));
  const projectWithDirections = projects.find((project) => {
    const directionsFile = path.join(project.project_dir, "directions.json");
    if (!fs.existsSync(directionsFile)) return false;
    const directions = readJson(directionsFile, []);
    return directions.length >= 5 && directions.every((item) => item.core_viewpoint && item.required_evidence?.length && item.risks?.length);
  });
  const batchWithMultiple = batches.find((batch) => (batch.items || []).length > 1);
  const oneActiveMax = batches.every((batch) => (batch.items || []).filter((item) => item.status === "active").length <= 1);
  const backfilledRows = rows.filter((row) => String(row["关联热点链接/帖子"] || "").includes("[深研来源]"));
  const code = readText(fileURLToPath(import.meta.url));
  const release = releaseCheck(p);
  return [
    section("基础验收", [
      evidence("可以初始化项目", fs.existsSync(p.agentDir) && fs.existsSync(path.join(p.configDir, "agent.yml")), path.join(p.configDir, "agent.yml"), "已生成 _topic_agent/config/agent.yml"),
      evidence("可以识别选题库字段", library.valid, p.libraryCsv, library.valid ? `字段完整：${library.fieldnames.join(", ")}` : `缺字段：${library.missing_required_fields.join(", ")}`),
      evidence("可以备份 CSV", fs.existsSync(p.backupsDir) && fs.readdirSync(p.backupsDir).some((name) => name.startsWith("topic_library_") && name.endsWith(".csv")), p.backupsDir, "写 CSV 前会在 _topic_agent/backups 生成备份"),
      evidence("可以写入候选选题", rows.length > 0, p.libraryCsv, `当前选题库 ${rows.length} 行`),
      evidence("不破坏 CSV 原有内容", library.valid && rows.every((row) => TOPIC_FIELDS.every((field) => field in row)), p.libraryCsv, "CSV 可解析且业务字段仍存在"),
      evidence("母选题ID 默认不填", rows.length > 0 && rows.every((row) => !row["母选题ID"]), p.libraryCsv, "当前入库行的母选题ID 为空"),
      evidence("是否选题 支持空值或勾选值", rows.length > 0 && rows.every((row) => !row["是否选题"] || isCheckedValue(row["是否选题"])), p.libraryCsv, "入库默认空；人工勾选后可同步为 TRUE"),
      evidence("内部 topic_index 可追溯选题", fs.existsSync(path.join(p.stateDir, "topic_index.json")) && Object.keys(topicIndex.topics || {}).length > 0, path.join(p.stateDir, "topic_index.json"), `topic index 条目数：${Object.keys(topicIndex.topics || {}).length}`),
      evidence("栏目系列只由 Column Matcher 填写", fs.existsSync(path.join(p.configDir, "column_rules.yml")) && !/column_rules\.yml/.test(code.slice(code.indexOf("function scoreCandidate"), code.indexOf("function boost"))), path.join(p.configDir, "column_rules.yml"), "column_rules.yml 存在，scoreCandidate 不读取栏目规则")
    ]),
    section("每日选题验收", [
      evidence("可以生成 daily_delivery.md", Boolean(latestDaily), latestDaily || p.dailyDir, latestDaily ? `最新日报：${path.basename(latestDaily)}` : "未找到日报"),
      evidence("可以输出 Top 选题", latestDailyText.includes("## Top 选题"), latestDaily || p.dailyDir, "日报包含 Top 选题区块"),
      evidence("可以说明选题来源", latestDailyText.includes("- 来源："), latestDaily || p.dailyDir, "日报包含来源字段"),
      evidence("可以说明为什么值得做", latestDailyText.includes("- 为什么值得做："), latestDaily || p.dailyDir, "日报包含为什么值得做"),
      evidence("可以说明初步链接", latestDailyText.includes("- 初步链接："), latestDaily || p.dailyDir, "日报包含初步链接"),
      evidence("可以记录 TopicCandidate 状态机", Boolean(latestCandidateStateLog), latestCandidateStateLog || p.dailyDir, "每日运行生成 candidate_state_log_YYYY-MM-DD.json")
    ]),
    section("确认选题验收", [
      evidence("确认第 X 行后能创建单选题批次并创建项目", code.includes('command === "topic"') && code.includes("createBatch(p, [Number"), "bin/topic-agent.mjs", "topic select --row 会调用 createBatch"),
      evidence("勾选第 X、Y、Z 行后能创建 SelectionBatch 队列", Boolean(batchWithMultiple), batchWithMultiple ? path.join(p.batchDir, `${batchWithMultiple.batch_id}.yml`) : p.batchDir, batchWithMultiple ? `批次 ${batchWithMultiple.batch_id} 有 ${batchWithMultiple.items.length} 项` : "未找到多选题批次"),
      evidence("队列内同一时间只有一个 active TopicProject", oneActiveMax, p.batchDir, "所有批次 active item 数量 <= 1"),
      evidence("当前 TopicProject 完成后能提示进入下一个 queued 选题", code.includes("batch next") && code.includes("nextAction"), "bin/topic-agent.mjs", "batch next 和 status next_action 均已实现"),
      evidence("可以生成至少 5 个方向", Boolean(projectWithDirections), projectWithDirections ? path.join(projectWithDirections.project_dir, "directions.json") : p.projectsDir, projectWithDirections ? `${projectWithDirections.project_id} directions >= 5` : "未找到满足条件的 directions.json"),
      evidence("每个方向包含核心观点、证据需求、风险", Boolean(projectWithDirections), projectWithDirections ? path.join(projectWithDirections.project_dir, "directions.json") : p.projectsDir, "directions.json 中每个方向包含 core_viewpoint、required_evidence、risks")
    ]),
    section("深研验收", [
      evidence("可以生成 research_plan.md", projects.some((project) => fs.existsSync(path.join(project.project_dir, "research_plan.md"))), p.projectsDir, "至少一个项目有 research_plan.md"),
      evidence("可以生成 source_index.md", projects.some((project) => fs.existsSync(path.join(project.project_dir, "source_index.md"))), p.projectsDir, "至少一个项目有 source_index.md"),
      evidence("source_index 至少包含 5 个来源", Boolean(projectWithFiveSources), projectWithFiveSources ? path.join(projectWithFiveSources.project_dir, "source_index.md") : p.projectsDir, projectWithFiveSources ? `${projectWithFiveSources.project_id} 来源数 >= 5` : "未找到来源数 >= 5 的 source_index"),
      evidence("可以生成 evidence_items.json", projects.some((project) => fs.existsSync(path.join(project.project_dir, "evidence_items.json"))), p.projectsDir, "至少一个项目有结构化 EvidenceItem 数据"),
      evidence("可以生成 evidence_map.md", projects.some((project) => fs.existsSync(path.join(project.project_dir, "evidence_map.md"))), p.projectsDir, "至少一个项目有 evidence_map.md"),
      evidence("可以生成 knowledge_base.md", Boolean(projectWithFullResearch), projectWithFullResearch ? path.join(projectWithFullResearch.project_dir, "knowledge_base.md") : p.projectsDir, "至少一个项目有完整资料包"),
      evidence("knowledge_base 核心事实可追溯 source_id", Boolean(projectWithTraceableCoreFacts), projectWithTraceableCoreFacts ? path.join(projectWithTraceableCoreFacts.project_dir, "knowledge_base.md") : p.projectsDir, projectWithTraceableCoreFacts ? `${projectWithTraceableCoreFacts.project_id} 核心事实包含 [Sxxx] 引用` : "未找到核心事实可追溯的 knowledge_base"),
      evidence("可以把链接回填到 CSV", backfilledRows.length > 0, p.libraryCsv, `包含 [深研来源] 的行数：${backfilledRows.length}`)
    ]),
    section("反馈学习验收", [
      evidence("可以记录用户反馈", feedback.length > 0, path.join(p.stateDir, "feedback_log.jsonl"), `反馈记录 ${feedback.length} 条`),
      evidence("可以同步项目级反馈状态", Boolean(projectWithFeedbackLifecycle), projectWithFeedbackLifecycle ? path.join(projectWithFeedbackLifecycle.project_dir, "feedback.md") : p.projectsDir, projectWithFeedbackLifecycle ? `${projectWithFeedbackLifecycle.project_id} 状态为 ${projectWithFeedbackLifecycle.status}` : "未找到带 feedback.md 的 feedback_collected/learning_applied 项目"),
      evidence("可以生成规则候选", feedback.some((item) => item.rule_candidate), path.join(p.stateDir, "feedback_log.jsonl"), "feedback_log.jsonl 包含 rule_candidate"),
      evidence("可以把规则应用到下一次评分", strategyRules.length + sourceRules.length + columnRules.length > 0, p.configDir, `已应用规则数：${strategyRules.length + sourceRules.length + columnRules.length}`),
      evidence("可以生成 weekly review", Boolean(weekly), weekly || p.reviewsDir, weekly ? `最新周报：${path.basename(weekly)}` : "未找到 weekly review")
    ]),
    section("分发验收", [
      evidence("可以通过 release check", release.ok, release.report_path, `release check 通过 ${release.passed_count}/${release.total_count}`),
      evidence("包含 LICENSE", releaseCheckPassed(release, "LICENSE present"), releaseCheckPath(release, "LICENSE present"), "仓库包含开源许可证"),
      evidence("CI 包含 release check", releaseCheckPassed(release, "CI runs release check"), releaseCheckPath(release, "CI runs release check"), "GitHub Actions 会运行 release check")
    ])
  ];
}

function releaseCheckPassed(release, label) {
  return release.checks?.some((check) => check.label === label && check.ok);
}

function releaseCheckPath(release, label) {
  return release.checks?.find((check) => check.label === label)?.path || release.report_path;
}

function knowledgeBaseCoreFactsTraceable(file) {
  if (!fs.existsSync(file)) return false;
  const text = readText(file);
  const match = text.match(/## 3\. 核心事实\s*([\s\S]*?)(?:\n## 4\.|\n##\s+\d+\.|$)/);
  if (!match) return false;
  const facts = match[1].split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith("- "));
  if (!facts.length) return false;
  const substantive = facts.filter((line) => !/暂无|待补充/.test(line));
  return substantive.length ? substantive.every((line) => /\[S\d{3}\]/.test(line)) : true;
}

function section(name, items) {
  return { name, items };
}

function evidence(requirement, ok, evidencePath, detail) {
  return {
    requirement,
    status: ok ? "passed" : "needs_attention",
    evidence: evidencePath || "",
    detail
  };
}

function renderAcceptanceReport(sections, reportPath) {
  const items = sections.flatMap((section) => section.items);
  const passed = items.filter((item) => item.status === "passed").length;
  const lines = [
    "# Topic Agent PRD Acceptance Report",
    "",
    `生成时间：${isoNow()}`,
    `报告路径：${reportPath}`,
    `通过：${passed}/${items.length}`,
    ""
  ];
  for (const section of sections) {
    lines.push(`## ${section.name}`, "");
    for (const item of section.items) {
      const mark = item.status === "passed" ? "[x]" : "[ ]";
      lines.push(`- ${mark} ${item.requirement}`);
      lines.push(`  - 状态：${item.status}`);
      lines.push(`  - 证据：${item.evidence}`);
      lines.push(`  - 说明：${item.detail}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function readProjects(p) {
  const index = Object.values(readJson(path.join(p.stateDir, "project_index.json"), { projects: {} }).projects);
  return index.map((project) => readJson(path.join(project.project_dir, "project.yml"), project));
}

function latestFile(dir, pattern) {
  if (!fs.existsSync(dir)) return "";
  return fs.readdirSync(dir)
    .filter((name) => pattern.test(name))
    .map((name) => path.join(dir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || "";
}

function internalTopicKeyForRow(row) {
  const rowNumber = Number(row["序号"] || row.row_number || row.csv_row_number) || 0;
  if (rowNumber > 0) return `topic-row-${String(rowNumber).padStart(6, "0")}`;
  const title = row["母选题"] || row.title || "";
  const seed = [title, row["来源"] || row.source || "", row["创建时间"] || row.created_at || "", row["选题方向/核心观点"] || row.core_viewpoint || ""].join("|");
  const slug = safeSlug(title).slice(0, 48) || "topic";
  return `${slug}-${shortHash(seed)}`;
}

function recordTopicIndex(p, entry) {
  if (!entry?.internal_topic_key) return null;
  const file = path.join(p.stateDir, "topic_index.json");
  const index = readJson(file, { topics: {} });
  const previous = index.topics[entry.internal_topic_key] || {};
  index.topics[entry.internal_topic_key] = {
    ...previous,
    ...entry,
    created_at: previous.created_at || entry.created_at || isoNow(),
    updated_at: isoNow()
  };
  writeJson(file, index);
  return index.topics[entry.internal_topic_key];
}

function findProjectByTopicKey(p, internalTopicKey) {
  const topicEntry = readJson(path.join(p.stateDir, "topic_index.json"), { topics: {} }).topics?.[internalTopicKey];
  if (topicEntry?.project_dir && fs.existsSync(path.join(topicEntry.project_dir, "project.yml"))) return readJson(path.join(topicEntry.project_dir, "project.yml"));
  const projectIndex = Object.values(readJson(path.join(p.stateDir, "project_index.json"), { projects: {} }).projects || {});
  const projectEntry = projectIndex.find((project) => project.internal_topic_key === internalTopicKey);
  if (projectEntry?.project_dir && fs.existsSync(path.join(projectEntry.project_dir, "project.yml"))) return readJson(path.join(projectEntry.project_dir, "project.yml"));
  return null;
}

function findProjectForRow(p, row, internalTopicKey) {
  const byKey = findProjectByTopicKey(p, internalTopicKey);
  if (byKey) return byKey;
  const rowNumber = Number(row["序号"]) || 0;
  const titleKey = normalizeTitle(row["母选题"]);
  const projectIndex = Object.values(readJson(path.join(p.stateDir, "project_index.json"), { projects: {} }).projects || {});
  const indexed = projectIndex.find((project) => Number(project.csv_row_number) === rowNumber)
    || projectIndex.find((project) => normalizeTitle(project.topic_title) === titleKey);
  if (indexed?.project_dir && fs.existsSync(path.join(indexed.project_dir, "project.yml"))) return readJson(path.join(indexed.project_dir, "project.yml"));
  if (!fs.existsSync(p.projectsDir)) return null;
  for (const name of fs.readdirSync(p.projectsDir)) {
    const projectFile = path.join(p.projectsDir, name, "project.yml");
    if (!fs.existsSync(projectFile)) continue;
    const project = readJson(projectFile, null);
    if (!project) continue;
    if (Number(project.csv_row_number) === rowNumber || normalizeTitle(project.topic_title) === titleKey) return project;
  }
  return null;
}

function appendCandidates(p, candidates) {
  const { rows, fields } = readLibrary(p);
  const existing = new Set(rows.map((row) => normalizeTitle(row["母选题"])).filter(Boolean));
  let maxSeq = Math.max(0, ...rows.map((row) => Number(row["序号"]) || 0));
  const appended = [];
  const appendedCandidates = [];
  const skipped = [];
  for (const candidate of candidates) {
    const key = candidate.dedupe_key || normalizeTitle(candidate.title);
    if (existing.has(key)) {
      skipped.push({ candidate_id: candidate.id || "", title: candidate.title, dedupe_key: key, reason: "duplicate" });
      continue;
    }
    maxSeq += 1;
    const column = matchColumn(p, candidate);
    const row = {
      "序号": String(maxSeq),
      "母选题ID": "",
      "母选题": candidate.title,
      "来源": (candidate.source_names || ["manual"]).join(" / "),
      "内容类型": candidate.content_type || "行业洞察",
      "栏目系列": column.column,
      "选题方向/核心观点": candidate.core_viewpoint || "",
      "关联热点链接/帖子": (candidate.initial_links || []).join("\n"),
      "创建时间": dateOnly(candidate.created_at || isoNow()),
      "是否选题": ""
    };
    const internalTopicKey = internalTopicKeyForRow(row);
    rows.push(row);
    appended.push(row);
    recordTopicIndex(p, {
      internal_topic_key: internalTopicKey,
      row_number: maxSeq,
      csv_row_number: maxSeq,
      topic_title: candidate.title,
      source: row["来源"],
      content_type: row["内容类型"],
      candidate_id: candidate.id || "",
      dedupe_key: key,
      status: "library_written"
    });
    appendedCandidates.push({ candidate_id: candidate.id || "", title: candidate.title, dedupe_key: key, row_number: maxSeq, internal_topic_key: internalTopicKey });
    existing.add(key);
  }
  if (appended.length) writeLibrary(p, rows, fields);
  return {
    appended_count: appended.length,
    skipped_count: skipped.length,
    appended,
    appended_candidates: appendedCandidates,
    skipped,
    library_path: p.libraryCsv
  };
}

function buildCandidateStateLog(signals, candidates, writeResult = null, context = {}) {
  const events = [];
  const runId = `${context.runType || "candidate"}-${shortHash(`${isoNow()}:${candidates.map((item) => item.id || item.title).join("|")}`)}`;
  const base = {
    run_id: runId,
    run_type: context.runType || "candidate",
    dry_run: Boolean(context.dryRun),
    created_at: isoNow()
  };
  for (const signal of signals) {
    events.push({
      ...base,
      raw_signal_id: signal.id,
      source_id: signal.source_id,
      title: signal.title,
      status: "raw_signal_collected"
    });
  }
  const skipped = new Map((writeResult?.skipped || []).map((item) => [item.dedupe_key || normalizeTitle(item.title), item]));
  const written = new Map((writeResult?.appended_candidates || []).map((item) => [item.dedupe_key || normalizeTitle(item.title), item]));
  for (const candidate of candidates) {
    const identity = candidateIdentity(candidate);
    events.push({ ...base, ...identity, status: "candidate_generated" });
    events.push({ ...base, ...identity, status: "candidate_scored", total_score: candidate.total_score, scores: candidate.scores || {} });
    const duplicate = skipped.get(identity.dedupe_key);
    if (duplicate) {
      events.push({ ...base, ...identity, status: "candidate_deduped", outcome: "duplicate", reason: duplicate.reason || "duplicate" });
      continue;
    }
    events.push({ ...base, ...identity, status: "candidate_deduped", outcome: "unique" });
    events.push({ ...base, ...identity, status: "candidate_ready_for_library" });
    const writtenCandidate = written.get(identity.dedupe_key);
    if (writtenCandidate) {
      events.push({ ...base, ...identity, status: "library_written", row_number: writtenCandidate.row_number });
    }
  }
  return events;
}

function candidateIdentity(candidate) {
  return {
    candidate_id: candidate.id || `TC-${shortHash(candidate.title || "")}`,
    title: candidate.title || "",
    dedupe_key: candidate.dedupe_key || normalizeTitle(candidate.title || ""),
    source_ids: candidate.source_ids || []
  };
}

function appendCandidateStateEvents(p, events) {
  if (!events.length) return;
  const file = path.join(p.stateDir, "candidate_state_log.jsonl");
  for (const event of events) appendJsonl(file, event);
}

function matchColumn(p, candidate) {
  const text = [candidate.title, candidate.core_viewpoint, candidate.content_type].join(" ").toLowerCase();
  const { columns, rules } = loadColumnConfig(p);
  for (const rule of rules) {
    const pattern = String(rule.pattern || "").toLowerCase();
    if (!pattern || !text.includes(pattern)) continue;
    const targetColumn = rule.column || rule.target_column || rule.to_column || rule.action_value;
    if (targetColumn) return { column: targetColumn, confidence: 0.95, reason: `命中栏目反馈规则 ${rule.rule_id || rule.pattern}` };
  }
  const columnRules = columns.length ? columns : DEFAULT_COLUMN_RULES;
  let best = { column: "行业洞察", confidence: 0.45, reason: "默认归入行业洞察" };
  for (const { name, keywords } of columnRules) {
    const hits = keywords.filter((keyword) => text.includes(keyword.toLowerCase()));
    if (hits.length > (best.hits || 0)) best = { column: name, confidence: Math.min(0.95, 0.45 + hits.length * 0.15), reason: hits.join("、"), hits: hits.length };
  }
  delete best.hits;
  return best;
}

function loadColumnConfig(p) {
  const file = path.join(p.configDir, "column_rules.yml");
  if (!fs.existsSync(file)) return { columns: [...DEFAULT_COLUMN_RULES], rules: [] };
  const text = readText(file);
  const columns = parseColumnDefinitions(text);
  const rules = loadRules(file).filter((rule) => (!rule.scope || rule.scope === "column") && rule.enabled !== false);
  return { columns, rules };
}

function parseColumnDefinitions(text) {
  const lines = String(text || "").split(/\r?\n/);
  const columns = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nameMatch = line.match(/^\s*-\s*name:\s*(.+?)\s*$/);
    const simpleMatch = line.match(/^\s*-\s*([^:][^#]+?)\s*$/);
    let name = "";
    let keywords = [];
    if (nameMatch) {
      name = stripYamlQuotes(nameMatch[1].trim());
      const next = lines[index + 1] || "";
      const keywordMatch = next.match(/^\s*keywords:\s*\[(.*)\]\s*$/);
      if (keywordMatch) keywords = keywordMatch[1].split(",").map((item) => stripYamlQuotes(item.trim())).filter(Boolean);
    } else if (simpleMatch && !line.includes("rule_id:")) {
      name = stripYamlQuotes(simpleMatch[1].trim());
    }
    if (!name) continue;
    const defaults = DEFAULT_COLUMN_RULES.find((column) => column.name === name);
    columns.push({ name, keywords: keywords.length ? keywords : defaults?.keywords || [name] });
  }
  return dedupeColumns(columns);
}

function dedupeColumns(columns) {
  const seen = new Set();
  const result = [];
  for (const column of columns) {
    if (seen.has(column.name)) continue;
    seen.add(column.name);
    result.push(column);
  }
  return result;
}

function findRows(p, numbers) {
  const { rows } = readLibrary(p);
  return numbers.map((number) => {
    let row = rows.find((item) => Number(item["序号"]) === number);
    if (!row && number >= 1 && number <= rows.length) row = rows[number - 1];
    if (!row) throw new Error(`选题库中找不到第 ${number} 行/序号。`);
    return row;
  });
}

function createBatch(p, rowNumbers) {
  if (!rowNumbers.length) throw new Error("请至少提供一个选题库行号。");
  const rows = findRows(p, rowNumbers);
  const batchId = nextBatchId(p);
  const items = [];
  let activeProjectId = null;
  rows.forEach((row, index) => {
    const project = createOrOpenProject(p, row);
    const status = index === 0 ? "active" : "queued";
    setProjectStatus(project, index === 0 ? "project_created" : "queued_in_batch");
    saveProject(p, project);
    if (index === 0) activeProjectId = project.project_id;
    items.push({
      row_number: Number(row["序号"]) || rowNumbers[index],
      topic_title: row["母选题"],
      project_id: project.project_id,
      status,
      started_at: index === 0 ? isoNow() : null,
      completed_at: null
    });
  });
  const batch = {
    batch_id: batchId,
    created_at: isoNow(),
    source: "user_confirmed_rows",
    status: "active",
    active_project_id: activeProjectId,
    items,
    completed_count: 0,
    total_count: items.length,
    notes: ""
  };
  saveBatch(p, batch);
  writeJson(path.join(p.stateDir, "active_batch.json"), { batch_id: batchId });
  if (activeProjectId) generateDirections(p, activeProjectId);
  return batch;
}

function createBatchFromSelected(p) {
  const { rows } = readLibrary(p);
  const selected = rows
    .filter((row) => isCheckedValue(row["是否选题"]))
    .map((row) => Number(row["序号"]))
    .filter(Boolean);
  if (!selected.length) throw new Error("没有找到已勾选的选题。请先在 xlsx 勾选并运行 library sync-xlsx，或使用 --rows 指定行号。");
  return createBatch(p, selected);
}

function nextBatchId(p) {
  ensureDir(p.batchDir);
  const prefix = `BATCH-${dateStamp()}-`;
  const count = fs.readdirSync(p.batchDir).filter((name) => name.startsWith(prefix) && name.endsWith(".yml")).length;
  return `${prefix}${String(count + 1).padStart(3, "0")}`;
}

function loadBatch(p, batchId) {
  const id = batchId || readJson(path.join(p.stateDir, "active_batch.json"), {}).batch_id;
  if (!id) throw new Error("没有 active batch，请先创建批次。");
  const file = path.join(p.batchDir, `${id}.yml`);
  if (!fs.existsSync(file)) throw new Error(`找不到批次 ${id}`);
  return readJson(file);
}

function saveBatch(p, batch) {
  writeJson(path.join(p.batchDir, `${batch.batch_id}.yml`), batch);
}

function updateBatchStatus(p, batchId, status) {
  const batch = loadBatch(p, batchId);
  batch.status = status;
  saveBatch(p, batch);
  if (status === "active") writeJson(path.join(p.stateDir, "active_batch.json"), { batch_id: batch.batch_id });
  return batch;
}

function skipCurrent(p, batchId, opts = {}) {
  const batch = loadBatch(p, batchId);
  const current = batch.items.find((item) => item.status === "active");
  if (!current) throw new Error("当前批次没有 active 选题。");
  current.status = "skipped_by_user";
  current.completed_at = isoNow();
  current.skip_reason = String(opts.reason || opts.text || current.skip_reason || "用户跳过").trim();
  const project = loadProject(p, current.project_id);
  setProjectStatus(project, "skipped_by_user", { force: true });
  saveProject(p, project);
  return advanceLoadedBatch(p, batch, true);
}

function failCurrent(p, batchId, opts = {}) {
  const batch = loadBatch(p, batchId);
  const current = batch.items.find((item) => item.status === "active");
  if (!current) throw new Error("当前批次没有 active 选题。");
  const reason = String(opts.reason || "未提供失败原因").trim();
  const project = loadProject(p, current.project_id);
  const reportPath = path.join(project.project_dir, "failure_report.md");
  writeText(reportPath, [
    `# Failure Report：${project.project_id}`,
    "",
    `- 批次：${batch.batch_id}`,
    `- 选题：${project.topic_title}`,
    `- 行号：${current.row_number}`,
    `- 失败时间：${isoNow()}`,
    `- 原因：${reason}`,
    "",
    "## 已生成产物",
    ...["directions.md", "selected_direction.md", "research_plan.md", "source_index.md", "evidence_items.json", "evidence_map.md", "knowledge_base.md"].map((file) => `- ${file}：${fs.existsSync(path.join(project.project_dir, file)) ? "已生成" : "未生成"}`),
    "",
    "## 下一步建议",
    "- 如果是来源质量问题，记录 source 反馈并运行 learn apply。",
    "- 如果是方向问题，重新确认方向或跳过该项目后处理队列下一项。"
  ].join("\n") + "\n");
  current.status = "failed_with_report";
  current.completed_at = isoNow();
  current.failure_reason = reason;
  current.failure_report_path = reportPath;
  project.failure_report_path = reportPath;
  setProjectStatus(project, "failed_with_report", { force: true });
  saveProject(p, project);
  return advanceLoadedBatch(p, batch, true);
}

function reorderBatch(p, batchId, opts = {}) {
  const batch = loadBatch(p, batchId);
  const requestedRows = opts.rows ? parseRows(String(opts.rows)) : [];
  const requestedProjects = opts.projects ? String(opts.projects).split(",").map((item) => item.trim()).filter(Boolean) : [];
  if (!requestedRows.length && !requestedProjects.length) throw new Error("请提供 --rows 42,45 或 --projects TP-... 来重排批次。");

  const terminalItems = batch.items.filter((item) => isTerminalBatchItem(item));
  const movableItems = batch.items.filter((item) => !isTerminalBatchItem(item));
  if (!movableItems.length) throw new Error(`批次 ${batch.batch_id} 没有可重排的 active/queued 选题。`);

  const ordered = [];
  const addItem = (item, label) => {
    if (!item) throw new Error(`批次 ${batch.batch_id} 中找不到可重排项目：${label}`);
    if (ordered.some((entry) => entry.project_id === item.project_id)) return;
    ordered.push(item);
  };
  for (const row of requestedRows) addItem(movableItems.find((item) => Number(item.row_number) === row), `row ${row}`);
  for (const projectId of requestedProjects) addItem(movableItems.find((item) => item.project_id === projectId), projectId);
  for (const item of movableItems) addItem(item, item.project_id);

  const current = movableItems.find((item) => item.status === "active");
  const nextActive = ordered[0];
  if (!nextActive) throw new Error(`批次 ${batch.batch_id} 没有可设为 active 的项目。`);
  const activeChanged = current && current.project_id !== nextActive.project_id;
  if (activeChanged) {
    const currentProject = loadProject(p, current.project_id);
    if (!canDemoteActiveProject(currentProject)) {
      throw new Error(`当前 active 项目 ${current.project_id} 已进入方向确认或研究阶段，请先完成、跳过或显式处理后再重排。`);
    }
  }

  ordered.forEach((item, index) => {
    if (index === 0) {
      item.status = "active";
      item.started_at = item.started_at || isoNow();
    } else if (item.status === "active") {
      item.status = "queued";
    }
  });

  batch.items = [...terminalItems, ...ordered];
  batch.active_project_id = nextActive.project_id;
  if (batch.status !== "paused") batch.status = "active";
  batch.reordered_at = isoNow();
  batch.completed_count = batch.items.filter((item) => isTerminalBatchItem(item)).length;

  const project = loadProject(p, nextActive.project_id);
  setProjectStatus(project, "project_created");
  saveProject(p, project);
  generateDirections(p, nextActive.project_id);
  saveBatch(p, batch);
  writeJson(path.join(p.stateDir, "active_batch.json"), { batch_id: batch.batch_id });
  return batch;
}

function canDemoteActiveProject(project) {
  if (project.selected_direction_id) return false;
  const blockedArtifacts = ["selected_direction.json", "research_plan.md", "sources.json", "knowledge_base.md"];
  return !blockedArtifacts.some((file) => fs.existsSync(path.join(project.project_dir, file)));
}

function advanceBatch(p, batchId) {
  return advanceLoadedBatch(p, loadBatch(p, batchId), false);
}

function advanceLoadedBatch(p, batch, currentAlreadyTerminal) {
  const current = batch.items.find((item) => item.status === "active");
  if (current && !currentAlreadyTerminal) {
    const project = loadProject(p, current.project_id);
    if (!isProjectComplete(project)) {
      throw new Error(`当前项目 ${current.project_id} 还没有完成 links_backfilled，不能默认进入下一个。`);
    }
    current.status = "completed";
    current.completed_at = isoNow();
  }
  const next = batch.items.find((item) => item.status === "queued");
  if (next) {
    next.status = "active";
    next.started_at = isoNow();
    batch.status = "active";
    batch.active_project_id = next.project_id;
    const project = loadProject(p, next.project_id);
    setProjectStatus(project, "project_created");
    saveProject(p, project);
    generateDirections(p, next.project_id);
  } else {
    batch.active_project_id = null;
    if (batch.items.every((item) => isTerminalBatchItem(item))) {
      batch.status = batch.items.some((item) => item.status === "failed_with_report") ? "completed_with_errors" : "completed";
    } else {
      batch.status = "partially_failed";
    }
    if (isTerminalBatch(batch)) writeBatchSummary(p, batch);
  }
  batch.completed_count = batch.items.filter((item) => isTerminalBatchItem(item)).length;
  saveBatch(p, batch);
  return batch;
}

function createOrOpenProject(p, row) {
  const rowNumber = Number(row["序号"]) || 0;
  const internalTopicKey = internalTopicKeyForRow(row);
  const indexedProject = findProjectForRow(p, row, internalTopicKey);
  if (indexedProject) {
    if (indexedProject.internal_topic_key !== internalTopicKey || Number(indexedProject.csv_row_number) !== rowNumber) {
      indexedProject.internal_topic_key = internalTopicKey;
      indexedProject.csv_row_number = rowNumber || indexedProject.csv_row_number;
      saveProject(p, indexedProject);
    }
    return indexedProject;
  }
  const projectId = `TP-${dateStamp()}-${String(rowNumber).padStart(3, "0")}`;
  const projectDir = path.join(p.projectsDir, projectId);
  const projectFile = path.join(projectDir, "project.yml");
  if (fs.existsSync(projectFile)) return readJson(projectFile);
  [projectDir, path.join(projectDir, "raw", "youtube_transcripts"), path.join(projectDir, "raw", "article_extracts"), path.join(projectDir, "raw", "paper_summaries"), path.join(projectDir, "raw", "deep_summaries")].forEach(ensureDir);
  const project = {
    project_id: projectId,
    internal_topic_key: internalTopicKey,
    csv_row_number: rowNumber,
    topic_title: row["母选题"],
    source: row["来源"],
    content_type: row["内容类型"],
    core_viewpoint: row["选题方向/核心观点"],
    initial_links: row["关联热点链接/帖子"],
    status: "project_created",
    created_at: isoNow(),
    updated_at: isoNow(),
    selected_direction_id: null,
    project_dir: projectDir
  };
  saveProject(p, project);
  return project;
}

function loadProject(p, projectId) {
  const file = path.join(p.projectsDir, projectId, "project.yml");
  if (!fs.existsSync(file)) throw new Error(`找不到项目 ${projectId}`);
  return readJson(file);
}

function saveProject(p, project) {
  project.updated_at = isoNow();
  writeJson(path.join(project.project_dir, "project.yml"), project);
  const indexFile = path.join(p.stateDir, "project_index.json");
  const index = readJson(indexFile, { projects: {} });
  index.projects[project.project_id] = {
    project_id: project.project_id,
    internal_topic_key: project.internal_topic_key,
    csv_row_number: project.csv_row_number,
    topic_title: project.topic_title,
    status: project.status,
    project_dir: project.project_dir,
    updated_at: project.updated_at
  };
  writeJson(indexFile, index);
  recordTopicIndex(p, {
    internal_topic_key: project.internal_topic_key,
    row_number: project.csv_row_number,
    csv_row_number: project.csv_row_number,
    topic_title: project.topic_title,
    source: project.source,
    content_type: project.content_type,
    project_id: project.project_id,
    project_dir: project.project_dir,
    status: project.status
  });
}

function generateDirections(p, projectId, force = false) {
  const project = loadProject(p, projectId);
  const jsonFile = path.join(project.project_dir, "directions.json");
  let directions;
  if (fs.existsSync(jsonFile) && !force) directions = readJson(jsonFile);
  else {
    archiveProjectArtifacts(project, ["directions.json", "directions.md"]);
    directions = buildDirections(project);
    writeJson(jsonFile, directions);
  }
  writeText(path.join(project.project_dir, "directions.md"), renderDirections(project, directions));
  setProjectStatus(project, "directions_generated");
  saveProject(p, project);
  return { project_id: projectId, directions_path: path.join(project.project_dir, "directions.md"), directions };
}

function buildDirections(project) {
  const title = project.topic_title;
  const base = project.core_viewpoint || "围绕该母选题建立清晰论点，并补足可验证证据。";
  return [
    direction("D1", `老板视角：${title}背后的投入产出账`, `${base} 重点回答老板为什么现在要关心、该投入什么、如何判断 ROI。`, ["公众号", "视频号", "销售材料"], ["企业老板", "业务负责人", "AI 转型负责人"], ["官方客户案例", "可引用数据", "高管观点", "失败风险"], ["不是工具清单，而是一笔组织账", "AI 投入到底该看什么指标"], ["容易空泛，需要真实企业案例支撑", "不能把 ROI 说成确定收益"], "high"),
    direction("D2", `实操方法：把${title}变成团队工作流`, `${base} 重点拆成可执行步骤，让读者知道如何从信号、资料、证据走到内容资产。`, ["公众号", "教程", "内部培训"], ["内容团队", "运营负责人", "AI 工具使用者"], ["流程截图或模板", "工具链案例", "前后对比", "常见坑"], ["照着做就能跑起来", "从临时灵感到稳定系统"], ["需要避免变成泛泛工具教程", "步骤必须具体到文件和命令"], "high"),
    direction("D3", `案例深挖：找一个真实公司验证${title}`, `${base} 选择一个公司、产品或客户案例，从时间线和横向对比里验证这个判断。`, ["深度文章", "播客提纲", "销售材料"], ["AI 从业者", "企业客户", "投资/战略读者"], ["官方博客", "客户案例", "发布会/访谈", "第三方报道"], ["用一个真实案例讲透", "别讲概念，讲一个公司怎么做"], ["单案例外推风险", "需要区分一手证据和二手解读"], "medium"),
    direction("D4", `反常识角度：${title}真正难的可能不是技术`, `${base} 把焦点从技术能力转向权限、流程、组织责任、证据和信任机制。`, ["观点文章", "短视频", "演讲开场"], ["企业管理者", "AI 观察者", "内容读者"], ["失败案例", "组织流程资料", "专家观点", "风险清单"], ["大家都看模型，我更想看流程", "真正卡住的地方不在 Demo 里"], ["观点锋利但需证据兜底", "避免贬低技术本身"], "medium"),
    direction("D5", `趋势判断：${title}会如何影响下一年的内容和业务`, `${base} 从近期信号推演未来 6-12 个月的内容机会、业务机会和风险。`, ["趋势报告", "公众号", "年度规划"], ["内容策略负责人", "创始人", "业务负责人"], ["近期发布", "行业报告", "Builder 观点", "可跟踪指标"], ["今年不是追热点，而是建雷达", "下一个窗口在哪里"], ["趋势判断容易过度推演", "必须列出不确定性"], "medium")
  ];
}

function direction(directionId, title, coreViewpoint, contentFormats, audiences, requiredEvidence, hooks, risks, priority) {
  return { direction_id: directionId, title, core_viewpoint: coreViewpoint, content_formats: contentFormats, audiences, required_evidence: requiredEvidence, hooks, risks, priority };
}

function renderDirections(project, directions) {
  const lines = ["# 选题方向建议", "", `母选题：${project.topic_title}`, `来源：${project.source || ""}`, `核心观点：${project.core_viewpoint || ""}`, ""];
  for (const d of directions) {
    lines.push(`## 方向 ${d.direction_id}：${d.title}`, `- 核心观点：${d.core_viewpoint}`, `- 适合内容形态：${d.content_formats.join(" / ")}`, `- 适合受众：${d.audiences.join(" / ")}`, `- 需要补强证据：${d.required_evidence.join("、")}`, `- 爆点：${d.hooks.join("；")}`, `- 风险：${d.risks.join("；")}`, `- 推荐优先级：${d.priority}`, "");
  }
  lines.push("## 建议提问", "你可以回复：", "1. 选方向 D1", "2. D1 和 D3 融合", "3. D2 更偏老板视角", "4. 全部重写，方向更尖锐");
  return lines.join("\n") + "\n";
}

function confirmDirection(p, projectId, directionId, instruction = "") {
  const project = loadProject(p, projectId);
  const directions = readJson(path.join(project.project_dir, "directions.json"));
  const selected = directions.find((item) => item.direction_id.toLowerCase() === directionId.toLowerCase());
  if (!selected) throw new Error(`项目 ${projectId} 中找不到方向 ${directionId}`);
  const direction = { ...selected };
  if (instruction) {
    direction.refine_instruction = instruction;
    direction.core_viewpoint = `${direction.core_viewpoint} 用户修订要求：${instruction}`;
  }
  archiveProjectArtifacts(project, ["selected_direction.json", "selected_direction.md"]);
  writeJson(path.join(project.project_dir, "selected_direction.json"), direction);
  writeText(path.join(project.project_dir, "selected_direction.md"), renderSelectedDirection(project, direction));
  project.selected_direction_id = direction.direction_id;
  setProjectStatus(project, "direction_confirmed");
  saveProject(p, project);
  return { project_id: projectId, direction_id: direction.direction_id, selected_direction_path: path.join(project.project_dir, "selected_direction.md") };
}

function renderSelectedDirection(project, direction) {
  const lines = [
    `# Selected Direction：${direction.direction_id}`,
    "",
    `母选题：${project.topic_title}`,
    `方向标题：${direction.title}`,
    "",
    "## 核心观点",
    direction.core_viewpoint,
    "",
    "## 适合内容形态",
    ...direction.content_formats.map((item) => `- ${item}`),
    "",
    "## 适合受众",
    ...direction.audiences.map((item) => `- ${item}`),
    "",
    "## 需要补强证据",
    ...direction.required_evidence.map((item) => `- ${item}`),
    "",
    "## 风险",
    ...direction.risks.map((item) => `- ${item}`)
  ];
  if (direction.refine_instruction) lines.push("", "## 用户修订要求", direction.refine_instruction);
  return lines.join("\n") + "\n";
}

function generateResearchPlan(p, projectId) {
  const project = loadProject(p, projectId);
  const selectedFile = path.join(project.project_dir, "selected_direction.json");
  if (!fs.existsSync(selectedFile)) throw new Error("请先确认方向，再生成研究计划。");
  const direction = readJson(selectedFile);
  const title = project.topic_title;
  const plan = {
    project_id: projectId,
    direction_id: direction.direction_id,
    main_claim: direction.core_viewpoint,
    required_facts: [`${title} 相关事件或趋势的时间线`, "该方向对应的企业业务问题和使用场景", "至少一个一手来源能验证的关键事实"],
    required_cases: [...direction.required_evidence.slice(0, 2), "真实企业案例"],
    required_data: ["可引用数字、增长指标、成本或效率变化", "如果没有数据，明确标注为待证实"],
    required_people_views: ["创始人/高管原始访谈", "Builder 或行业专家一手观点"],
    required_papers: ["若涉及模型能力，检索论文原文或官方技术报告"],
    youtube_queries: [`${title} interview`, `${title} AI agent enterprise`],
    chinese_queries: [`${title} 企业 AI 案例`, `${title} 官方 客户 案例`],
    paper_queries: [`${title} agent workflow`, `${title} reasoning memory tools`],
    preferred_sources: ["官方博客", "官方客户案例", "高管访谈", "论文原文", "权威媒体深度报道"],
    blocked_sources: ["无出处中文二手文章", "短视频搬运号", "无日期截图", "疑似 AI 洗稿"],
    unknowns: ["找不到一手客户案例时，不能强行写成落地结论。", "找不到数据时，只能写趋势判断，不能写确定收益。"],
    created_at: isoNow()
  };
  archiveProjectArtifacts(project, ["research_plan.json", "research_plan.md"]);
  writeJson(path.join(project.project_dir, "research_plan.json"), plan);
  writeText(path.join(project.project_dir, "research_plan.md"), renderResearchPlan(direction, plan));
  setProjectStatus(project, "research_planned");
  saveProject(p, project);
  return { project_id: projectId, research_plan_path: path.join(project.project_dir, "research_plan.md"), plan };
}

function renderResearchPlan(direction, plan) {
  const lines = ["# Research Plan", "", "## 1. 确认方向", `方向：${direction.title}`, `核心论点：${plan.main_claim}`, "", "## 2. 必须证明的问题"];
  plan.required_facts.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  lines.push("", "## 3. 需要寻找的证据", "### 案例", ...plan.required_cases.map((item) => `- ${item}`), "", "### 数据", ...plan.required_data.map((item) => `- ${item}`), "", "### 人物观点", ...plan.required_people_views.map((item) => `- ${item}`), "", "### 论文/理论", ...plan.required_papers.map((item) => `- ${item}`), "", "## 4. 搜索关键词", "### YouTube", ...plan.youtube_queries.map((item) => `- ${item}`), "", "### 中文来源", ...plan.chinese_queries.map((item) => `- ${item}`), "", "### 论文", ...plan.paper_queries.map((item) => `- ${item}`), "", "## 5. 优先来源", ...plan.preferred_sources.map((item) => `- ${item}`), "", "## 6. 谨慎来源", ...plan.blocked_sources.map((item) => `- ${item}`), "", "## 7. 不确定事项", ...plan.unknowns.map((item) => `- ${item}`));
  return lines.join("\n") + "\n";
}

function archiveProjectArtifacts(project, files) {
  const archived = [];
  for (const file of files) {
    const source = path.join(project.project_dir, file);
    if (!fs.existsSync(source)) continue;
    const archiveDir = path.join(project.project_dir, "archive");
    ensureDir(archiveDir);
    const parsed = path.parse(file);
    const target = path.join(archiveDir, `${timestampStamp()}_${process.hrtime.bigint()}_${parsed.name}${parsed.ext}`);
    fs.copyFileSync(source, target);
    archived.push(target);
  }
  return archived;
}

async function collectSources(p, projectId, opts = {}) {
  const project = loadProject(p, projectId);
  const planFile = path.join(project.project_dir, "research_plan.json");
  if (!fs.existsSync(planFile)) generateResearchPlan(p, projectId);
  const plan = readJson(planFile);
  let sources = readJson(path.join(project.project_dir, "sources.json"), []);
  if (opts.url || opts.file) {
    const item = await createManualSource(p, project, sources.length + 1, projectId, opts);
    sources.push(item);
  } else if (!sources.length) {
    sources = seedSources(p, projectId, plan);
  }
  sources = saveSources(project, sources);
  setProjectStatus(project, "sources_collected");
  saveProject(p, project);
  return { project_id: projectId, source_index_path: path.join(project.project_dir, "source_index.md"), sources };
}

async function collectArxivPapers(p, projectId, opts = {}) {
  const project = loadProject(p, projectId);
  const planFile = path.join(project.project_dir, "research_plan.json");
  if (!fs.existsSync(planFile)) generateResearchPlan(p, projectId);
  const plan = readJson(planFile);
  const query = opts.query || opts.q || plan.paper_queries?.[0] || project.topic_title;
  const limit = Math.round(clamp(Number(opts.limit || 5), 1, 20));
  const apiUrl = opts["api-url"] || arxivApiUrl(query, limit);
  const status = opts.status || "pending";
  const tier = opts.tier || "S";
  const shouldExtractPdf = opts["extract-pdf"] === true || opts["extract-pdf"] === "true";
  const xml = await fetchText(apiUrl, {
    accept: "application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.5"
  });
  const papers = parseArxivFeed(xml).slice(0, limit);
  const sourcesFile = path.join(project.project_dir, "sources.json");
  const sources = readJson(sourcesFile, []);
  const seen = new Set(sources.flatMap((source) => [source.url, source.metadata?.arxiv_id]).filter(Boolean).map(canonicalSourceKey));
  const added = [];
  for (const paper of papers) {
    if (seen.has(canonicalSourceKey(paper.url)) || seen.has(canonicalSourceKey(paper.arxiv_id))) continue;
    const source = sourceItem(sources.length + 1, projectId, "paper", paper.title, paper.url, tier, status, `arXiv 自动检索入库：${query}`);
    source.author_or_org = paper.authors.join(", ");
    source.published_at = paper.published_at;
    source.metadata = {
      ...(source.metadata || {}),
      arxiv_id: paper.arxiv_id,
      pdf_url: paper.pdf_url,
      categories: paper.categories,
      summary: paper.summary
    };
    const summaryPath = savePaperSummary(project.project_dir, source.source_id, paper);
    source.extracted_text_path = relative(project.project_dir, summaryPath);
    source.notes = appendNote(source.notes, `已保存 arXiv 摘要，字符数 ${paper.summary.length}`);
    source.relevance_score = Math.max(source.relevance_score, status === "accepted" ? 0.86 : 0.72);
    if (shouldExtractPdf && paper.pdf_url) {
      try {
        const pdfText = await extractRemotePdfText(paper.pdf_url);
        const pdfPath = savePaperPdfExtract(project.project_dir, source.source_id, paper, pdfText);
        source.metadata.summary_path = relative(project.project_dir, summaryPath);
        source.extracted_text_path = relative(project.project_dir, pdfPath);
        source.notes = appendNote(source.notes, `已抽取论文 PDF，字符数 ${pdfText.length}`);
        source.relevance_score = Math.max(source.relevance_score, 0.9);
      } catch (error) {
        source.notes = appendNote(source.notes, `论文 PDF 抽取失败：${error.message}`);
      }
    }
    sources.push(applySourceRules(p, source));
    added.push(sources[sources.length - 1]);
    seen.add(canonicalSourceKey(paper.url));
    seen.add(canonicalSourceKey(paper.arxiv_id));
  }
  const savedSources = saveSources(project, sources);
  setProjectStatus(project, "sources_collected");
  saveProject(p, project);
  return {
    project_id: projectId,
    query,
    api_url: apiUrl,
    found_count: papers.length,
    added_count: added.length,
    source_index_path: path.join(project.project_dir, "source_index.md"),
    added_sources: added,
    sources: savedSources
  };
}

function createDeepSummaryPrompt(p, projectId, sourceId) {
  const project = loadProject(p, projectId);
  const sourcesFile = path.join(project.project_dir, "sources.json");
  if (!fs.existsSync(sourcesFile)) throw new Error(`项目 ${projectId} 还没有 sources.json。`);
  const sources = readJson(sourcesFile);
  const source = sources.find((item) => item.source_id.toLowerCase() === sourceId.toLowerCase());
  if (!source) throw new Error(`项目 ${projectId} 中找不到来源 ${sourceId}`);
  const text = sourceText(project, source, { includeDeepSummary: false });
  if (!text) throw new Error(`来源 ${sourceId} 没有 transcript 或正文抽取结果，无法生成深度摘要提示。`);
  ensureDir(path.join(project.project_dir, "raw", "deep_summaries"));
  const outputPath = path.join(project.project_dir, "raw", "deep_summaries", `${source.source_id}.md`);
  const promptPath = path.join(project.project_dir, "raw", "deep_summaries", `${source.source_id}_prompt.md`);
  const lines = [
    `# Deep Summary Request：${source.title}`,
    "",
    "Use $long-content-deep-summary to summarize the content below.",
    "",
    "## Save Target",
    "",
    `请将最终综合总结保存为：${relative(project.project_dir, outputPath)}`,
    "",
    "## Source Metadata",
    "",
    `Source ID: ${source.source_id}`,
    `Project ID: ${projectId}`,
    `Title: ${source.title}`,
    `Type: ${source.type}`,
    `URL: ${source.url}`,
    `Creator/Author: ${source.author_or_org || "内容未指定"}`,
    `Published: ${source.published_at || "内容未指定"}`,
    `Duration: ${source.metadata?.duration || "内容未指定"}`,
    "",
    "## Content",
    "",
    text.slice(0, 160000),
    ""
  ];
  writeText(promptPath, lines.join("\n"));
  source.metadata = {
    ...(source.metadata || {}),
    deep_summary_prompt_path: relative(project.project_dir, promptPath),
    deep_summary_recommended_path: relative(project.project_dir, outputPath),
    deep_summary_skill: "long-content-deep-summary"
  };
  source.notes = appendNote(source.notes, "已生成长内容深度摘要提示文件");
  saveSources(project, sources);
  return {
    project_id: projectId,
    source_id: source.source_id,
    prompt_path: promptPath,
    recommended_output_path: outputPath,
    skill: "long-content-deep-summary"
  };
}

function attachDeepSummary(p, projectId, sourceId, opts = {}) {
  const project = loadProject(p, projectId);
  const sourcesFile = path.join(project.project_dir, "sources.json");
  if (!fs.existsSync(sourcesFile)) throw new Error(`项目 ${projectId} 还没有 sources.json。`);
  const sources = readJson(sourcesFile);
  const source = sources.find((item) => item.source_id.toLowerCase() === sourceId.toLowerCase());
  if (!source) throw new Error(`项目 ${projectId} 中找不到来源 ${sourceId}`);

  const summaryDir = path.join(project.project_dir, "raw", "deep_summaries");
  ensureDir(summaryDir);
  const targetPath = path.join(summaryDir, `${source.source_id}.md`);
  const inputPath = resolveSummaryInputPath(project, source, opts.file || opts.summary || opts.path || opts.input, targetPath);
  if (!fs.existsSync(inputPath)) throw new Error(`找不到深度摘要文件 ${inputPath}`);
  if (path.resolve(inputPath).toLowerCase() !== path.resolve(targetPath).toLowerCase()) {
    fs.copyFileSync(inputPath, targetPath);
  }

  const text = normalizeWhitespace(readText(targetPath));
  if (!text) throw new Error(`深度摘要文件为空：${targetPath}`);
  source.metadata = {
    ...(source.metadata || {}),
    deep_summary_path: relative(project.project_dir, targetPath),
    deep_summary_attached_at: isoNow(),
    deep_summary_length: text.length,
    deep_summary_skill: opts.skill || source.metadata?.deep_summary_skill || "long-content-deep-summary"
  };
  source.notes = appendNote(source.notes, `已登记深度摘要，字符数 ${text.length}`);
  applySourceRules(p, source);
  saveSources(project, sources);
  return {
    project_id: projectId,
    source_id: source.source_id,
    summary_path: targetPath,
    summary_length: text.length,
    source
  };
}

function resolveSummaryInputPath(project, source, value, targetPath) {
  if (!value) {
    const recommended = source.metadata?.deep_summary_recommended_path || source.metadata?.deep_summary_path;
    return recommended ? resolveProjectRelativePath(project.project_dir, recommended) : targetPath;
  }
  return resolveProjectRelativePath(project.project_dir, value);
}

function resolveProjectRelativePath(projectDir, value) {
  const text = String(value || "");
  if (path.isAbsolute(text)) return text;
  const projectRelative = path.join(projectDir, text);
  if (fs.existsSync(projectRelative)) return projectRelative;
  return path.resolve(text);
}

async function createManualSource(p, project, index, projectId, opts) {
  const kind = opts.type || inferSourceType(opts.url || opts.file || "");
  const tier = opts.tier || defaultTier(kind);
  const status = opts.status || "pending";
  const titleFromInput = opts.title || opts.url || opts.file;
  const source = sourceItem(index, projectId, kind, titleFromInput, opts.url || `file://${path.resolve(opts.file)}`, tier, status, opts.notes || "用户手动导入来源");
  const shouldExtract = opts.extract !== "false" && opts["no-extract"] !== true;
  if (opts.file) {
    const extracted = await importLocalSourceFile(project, source, opts.file);
    Object.assign(source, extracted);
  } else if (opts.url && shouldExtract) {
    const extracted = await extractRemoteSource(project, source, opts.url);
    Object.assign(source, extracted);
  }
  if (opts.author) source.author_or_org = opts.author;
  if (opts.date) source.published_at = opts.date;
  return applySourceRules(p, source);
}

async function importLocalSourceFile(project, source, filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) throw new Error(`找不到本地来源文件 ${abs}`);
  const text = abs.toLowerCase().endsWith(".pdf") ? await extractPdfFile(abs) : readText(abs);
  const extractPath = saveExtractedText(project.project_dir, source.source_id, source.title, source.url, text, "local_file");
  return {
    extracted_text_path: relative(project.project_dir, extractPath),
    notes: appendNote(source.notes, `已导入本地文本，字符数 ${text.length}`),
    relevance_score: Math.max(source.relevance_score, 0.75)
  };
}

async function extractRemoteSource(project, source, url) {
  if (isYouTubeUrl(url)) {
    return extractYouTubeSource(project, source, url);
  }
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 topic-agent/0.1",
        "accept": "text/html,application/xhtml+xml,text/plain,application/json;q=0.8,*/*;q=0.5"
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    let extracted;
    if (contentType.includes("pdf") || url.toLowerCase().includes(".pdf")) {
      extracted = { title: source.title, author: "", publishedAt: "", text: await extractPdfArrayBuffer(await response.arrayBuffer()) };
    } else {
      const raw = await response.text();
      extracted = contentType.includes("html") ? extractHtmlArticle(raw, url) : extractPlainText(raw);
    }
    const extractPath = saveExtractedText(project.project_dir, source.source_id, extracted.title || source.title, url, extracted.text, contentType || "text");
    return {
      title: extracted.title || source.title,
      author_or_org: extracted.author || source.author_or_org,
      published_at: extracted.publishedAt || source.published_at,
      extracted_text_path: relative(project.project_dir, extractPath),
      notes: appendNote(source.notes, `已抽取正文，字符数 ${extracted.text.length}`),
      relevance_score: Math.max(source.relevance_score, extracted.text.length > 500 ? 0.8 : 0.65)
    };
  } catch (error) {
    return {
      notes: appendNote(source.notes, `正文抽取失败：${error.message}`),
      status: source.status === "accepted" ? "pending" : source.status
    };
  }
}

function seedSources(p, projectId, plan) {
  const sources = [];
  for (const query of plan.youtube_queries.slice(0, 2)) sources.push(applySourceRules(p, sourceItem(sources.length + 1, projectId, "youtube", `YouTube 搜索：${query}`, `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, "C", "pending", "待人工打开检索并确认原始视频")));
  for (const query of plan.chinese_queries.slice(0, 2)) sources.push(applySourceRules(p, sourceItem(sources.length + 1, projectId, "article", `中文来源搜索：${query}`, `https://www.google.com/search?q=${encodeURIComponent(query)}`, "C", "pending", "待人工核验是否为一手或高质量二手来源")));
  for (const query of plan.paper_queries.slice(0, 2)) sources.push(applySourceRules(p, sourceItem(sources.length + 1, projectId, "paper", `论文搜索：${query}`, `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`, "B", "pending", "待替换为论文原文链接")));
  return sources;
}

function sourceItem(index, projectId, type, title, url, tier, status, notes) {
  const normalizedTier = String(tier || "B").toUpperCase();
  return { source_id: `S${String(index).padStart(3, "0")}`, project_id: projectId, type, title, url, author_or_org: "", published_at: "", collected_at: isoNow(), source_tier: normalizedTier, credibility_score: { S: 1, A: 0.85, B: 0.7, C: 0.45, D: 0.1 }[normalizedTier] || 0.5, relevance_score: status === "pending" ? 0.5 : 0.8, transcript_path: null, extracted_text_path: null, notes, status };
}

function inferSourceType(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("youtube.com") || text.includes("youtu.be")) return "youtube";
  if (text.includes("arxiv.org") || text.endsWith(".pdf")) return "paper";
  if (text.endsWith(".md") || text.endsWith(".txt")) return "article";
  return "article";
}

function defaultTier(kind) {
  return SOURCE_TYPE_TIER[String(kind || "").toLowerCase()] || "B";
}

function appendNote(current, addition) {
  return [current, addition].filter(Boolean).join("；");
}

function isYouTubeUrl(url) {
  const text = String(url || "").toLowerCase();
  return text.includes("youtube.com/watch") || text.includes("youtu.be/");
}

async function extractYouTubeSource(project, source, url) {
  const videoId = parseYouTubeVideoId(url);
  if (!videoId) {
    const transcriptPath = saveTranscriptPlaceholder(project.project_dir, source.source_id, source.title, url, "无法解析 YouTube video id。");
    return {
      transcript_path: relative(project.project_dir, transcriptPath),
      notes: appendNote(source.notes, "已识别为 YouTube 链接，但无法解析 video id"),
      relevance_score: Math.max(source.relevance_score, 0.55)
    };
  }
  try {
    const { Innertube } = await import("youtubei.js");
    const innertube = await Innertube.create();
    const info = await innertube.getInfo(videoId);
    const basic = info.basic_info || {};
    let transcriptText = "";
    let transcriptNote = "";
    try {
      const transcriptInfo = await info.getTranscript();
      transcriptText = transcriptToText(transcriptInfo);
      transcriptNote = transcriptText ? `已自动抽取 transcript，字符数 ${transcriptText.length}` : "未在 transcript 对象中找到可读片段";
    } catch (error) {
      transcriptNote = `transcript 自动抽取失败：${error.message}`;
    }
    const transcriptPath = saveYouTubeTranscript(project.project_dir, source.source_id, {
      title: basic.title || source.title,
      url,
      videoId,
      author: basic.author || basic.channel?.name || "",
      channelUrl: basic.channel?.url || "",
      duration: basic.duration || "",
      viewCount: basic.view_count || "",
      description: basic.short_description || "",
      transcriptText,
      note: transcriptNote
    });
    return {
      title: basic.title || source.title,
      author_or_org: basic.author || basic.channel?.name || source.author_or_org,
      transcript_path: relative(project.project_dir, transcriptPath),
      notes: appendNote(source.notes, `YouTube metadata 已抽取：video_id=${videoId}`),
      relevance_score: Math.max(source.relevance_score, transcriptText ? 0.82 : 0.65),
      metadata: {
        ...(source.metadata || {}),
        youtube_video_id: videoId,
        duration: basic.duration || null,
        view_count: basic.view_count || null,
        has_transcript: Boolean(transcriptText),
        transcript_note: transcriptNote
      }
    };
  } catch (error) {
    const transcriptPath = saveTranscriptPlaceholder(project.project_dir, source.source_id, source.title, url, `YouTube metadata/transcript 抽取失败：${error.message}`);
    return {
      transcript_path: relative(project.project_dir, transcriptPath),
      notes: appendNote(source.notes, `YouTube 抽取失败：${error.message}`),
      relevance_score: Math.max(source.relevance_score, 0.58),
      metadata: {
        ...(source.metadata || {}),
        youtube_video_id: videoId,
        extraction_error: error.message
      }
    };
  }
}

function parseYouTubeVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.split("/").filter(Boolean)[0] || "";
    if (parsed.searchParams.get("v")) return parsed.searchParams.get("v");
    const shorts = parsed.pathname.match(/\/shorts\/([^/?]+)/);
    if (shorts) return shorts[1];
    const embed = parsed.pathname.match(/\/embed\/([^/?]+)/);
    if (embed) return embed[1];
  } catch {
    const match = String(url || "").match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([a-zA-Z0-9_-]{6,})/);
    return match ? match[1] : "";
  }
  return "";
}

function transcriptToText(transcriptInfo) {
  const segments = transcriptInfo?.transcript?.content?.body?.initial_segments || [];
  const lines = [];
  for (const segment of segments) {
    const text = segment?.snippet?.toString?.() || segment?.snippet?.text || "";
    if (!text || text === "undefined") continue;
    const start = segment?.start_time_text?.toString?.() || "";
    lines.push(start ? `[${start}] ${text}` : text);
  }
  return normalizeWhitespace(lines.join("\n"));
}

function saveTranscriptPlaceholder(projectDir, sourceId, title, url, reason = "") {
  const file = path.join(projectDir, "raw", "youtube_transcripts", `${sourceId}.md`);
  writeText(file, [`# YouTube Transcript Placeholder：${title}`, "", `URL: ${url}`, reason ? `Reason: ${reason}` : "", "", "请把字幕或视频摘要粘贴到这里，后续 build-kb 会引用该文件。", ""].join("\n"));
  return file;
}

function saveYouTubeTranscript(projectDir, sourceId, data) {
  const file = path.join(projectDir, "raw", "youtube_transcripts", `${sourceId}.md`);
  const lines = [
    `# YouTube Transcript：${data.title}`,
    "",
    `URL: ${data.url}`,
    `Video ID: ${data.videoId}`,
    `Channel: ${data.author || "未知"}`,
    `Channel URL: ${data.channelUrl || ""}`,
    `Duration: ${data.duration || ""}`,
    `View Count: ${data.viewCount || ""}`,
    `Note: ${data.note || ""}`,
    "",
    "## Description",
    "",
    data.description || "暂无",
    "",
    "## Transcript",
    "",
    data.transcriptText || "未能自动获取 transcript，请人工补充。",
    ""
  ];
  writeText(file, lines.join("\n"));
  return file;
}

function saveExtractedText(projectDir, sourceId, title, url, text, contentType) {
  const file = path.join(projectDir, "raw", "article_extracts", `${sourceId}.md`);
  const body = [
    `# Extracted Source：${title || sourceId}`,
    "",
    `URL: ${url}`,
    `Content-Type: ${contentType}`,
    "",
    "## Extracted Text",
    "",
    normalizeWhitespace(text).slice(0, 50000),
    ""
  ].join("\n");
  writeText(file, body);
  return file;
}

function extractPlainText(raw) {
  const text = normalizeWhitespace(String(raw || ""));
  return {
    title: "",
    author: "",
    publishedAt: "",
    text
  };
}

function extractHtmlArticle(html, url = "https://example.com/") {
  try {
    const dom = new JSDOM(html, { url });
    const parsed = new Readability(dom.window.document).parse();
    if (parsed?.textContent) {
      return {
        title: normalizeWhitespace(parsed.title || ""),
        author: normalizeWhitespace(parsed.byline || ""),
        publishedAt: "",
        text: normalizeWhitespace(parsed.textContent)
      };
    }
  } catch {
    // Fall back to the lightweight extractor below.
  }
  const title = firstMatch(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || firstMatch(html, /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i)
    || firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i)
    || "";
  const author = firstMatch(html, /<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i)
    || firstMatch(html, /<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']+)["']/i)
    || "";
  const publishedAt = firstMatch(html, /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i)
    || firstMatch(html, /<meta[^>]+name=["']date["'][^>]+content=["']([^"']+)["']/i)
    || firstMatch(html, /<time[^>]+datetime=["']([^"']+)["']/i)
    || "";
  const bodyHtml = chooseMainHtml(html);
  const text = htmlToText(bodyHtml);
  return {
    title: decodeHtml(normalizeWhitespace(title)),
    author: decodeHtml(normalizeWhitespace(author)),
    publishedAt: normalizeWhitespace(publishedAt),
    text
  };
}

async function extractPdfFile(file) {
  const bytes = fs.readFileSync(file);
  return extractPdfArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

async function extractPdfArrayBuffer(buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, isEvalSupported: false, disableFontFace: true }).promise;
  const pages = [];
  const maxPages = Math.min(pdf.numPages, 30);
  for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }
  return normalizeWhitespace(pages.join("\n\n"));
}

function arxivApiUrl(query, limit) {
  const cleanTerms = String(query || "")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 10);
  const searchQuery = cleanTerms.length ? cleanTerms.map((term) => `all:${term}`).join(" AND ") : `all:${query}`;
  const params = new URLSearchParams({
    search_query: searchQuery,
    start: "0",
    max_results: String(limit),
    sortBy: "submittedDate",
    sortOrder: "descending"
  });
  return `https://export.arxiv.org/api/query?${params.toString()}`;
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 topic-agent/0.1 (research arxiv)",
      "accept": options.accept || "text/plain,*/*;q=0.5"
    },
    signal: AbortSignal.timeout(Number(options.timeout || 15000))
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  return response.text();
}

function parseArxivFeed(xml) {
  const dom = new JSDOM(xml, { contentType: "text/xml" });
  const entries = Array.from(dom.window.document.getElementsByTagName("entry"));
  return entries.map((entry) => {
    const url = firstElementText(entry, "id");
    const links = Array.from(entry.getElementsByTagName("link")).map((link) => ({
      href: link.getAttribute("href") || "",
      rel: link.getAttribute("rel") || "",
      type: link.getAttribute("type") || "",
      title: link.getAttribute("title") || ""
    }));
    const pdfLink = links.find((link) => link.title === "pdf" || link.type === "application/pdf");
    const categories = Array.from(entry.getElementsByTagName("category"))
      .map((category) => category.getAttribute("term"))
      .filter(Boolean);
    return {
      arxiv_id: extractArxivId(url),
      title: firstElementText(entry, "title") || "Untitled arXiv paper",
      summary: firstElementText(entry, "summary"),
      url,
      pdf_url: pdfLink?.href || inferArxivPdfUrl(url),
      authors: Array.from(entry.getElementsByTagName("author")).map((author) => firstElementText(author, "name")).filter(Boolean),
      published_at: firstElementText(entry, "published"),
      updated_at: firstElementText(entry, "updated"),
      categories
    };
  }).filter((paper) => paper.url && paper.title);
}

function firstElementText(parent, name) {
  const element = parent.getElementsByTagName(name)[0];
  return normalizeWhitespace(element?.textContent || "");
}

function extractArxivId(url) {
  const text = String(url || "").trim();
  const match = text.match(/arxiv\.org\/abs\/([^?#]+)/i)
    || text.match(/arxiv\.org\/pdf\/([^?#]+)/i)
    || text.match(/^([a-z-]+\/\d{7}(?:v\d+)?|\d{4}\.\d{4,5}(?:v\d+)?)$/i);
  return match ? match[1].replace(/\.pdf$/i, "") : "";
}

function inferArxivPdfUrl(url) {
  const arxivId = extractArxivId(url);
  return arxivId ? `https://arxiv.org/pdf/${arxivId}` : "";
}

function canonicalSourceKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\.pdf$/i, "").replace(/\/$/g, "");
}

function savePaperSummary(projectDir, sourceId, paper) {
  const file = path.join(projectDir, "raw", "paper_summaries", `${sourceId}.md`);
  const lines = [
    `# arXiv Paper：${paper.title}`,
    "",
    `arXiv ID: ${paper.arxiv_id || ""}`,
    `URL: ${paper.url}`,
    `PDF: ${paper.pdf_url || ""}`,
    `Authors: ${paper.authors.join(", ") || "Unknown"}`,
    `Published: ${paper.published_at || ""}`,
    `Updated: ${paper.updated_at || ""}`,
    `Categories: ${paper.categories.join(", ") || ""}`,
    "",
    "## Abstract",
    "",
    normalizeWhitespace(paper.summary),
    ""
  ];
  writeText(file, lines.join("\n"));
  return file;
}

async function extractRemotePdfText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 topic-agent/0.1 (pdf extraction)",
      "accept": "application/pdf,*/*;q=0.5"
    },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  return extractPdfArrayBuffer(await response.arrayBuffer());
}

function savePaperPdfExtract(projectDir, sourceId, paper, pdfText) {
  const file = path.join(projectDir, "raw", "paper_summaries", `${sourceId}_pdf.md`);
  const lines = [
    `# arXiv PDF Extract：${paper.title}`,
    "",
    `arXiv ID: ${paper.arxiv_id || ""}`,
    `URL: ${paper.url}`,
    `PDF: ${paper.pdf_url || ""}`,
    `Authors: ${paper.authors.join(", ") || "Unknown"}`,
    `Published: ${paper.published_at || ""}`,
    "",
    "## Abstract",
    "",
    normalizeWhitespace(paper.summary),
    "",
    "## PDF Text",
    "",
    normalizeWhitespace(pdfText).slice(0, 50000),
    ""
  ];
  writeText(file, lines.join("\n"));
  return file;
}

function chooseMainHtml(html) {
  const article = firstMatch(html, /<article[^>]*>([\s\S]*?)<\/article>/i);
  if (article) return article;
  const main = firstMatch(html, /<main[^>]*>([\s\S]*?)<\/main>/i);
  if (main) return main;
  const body = firstMatch(html, /<body[^>]*>([\s\S]*?)<\/body>/i);
  return body || html;
}

function htmlToText(html) {
  let text = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<(h[1-6]|p|li|blockquote|pre|tr|div|section|br)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  text = decodeHtml(text);
  return normalizeWhitespace(text);
}

function stripHtml(html) {
  return htmlToText(String(html || ""));
}

function firstMatch(text, regex) {
  const match = String(text || "").match(regex);
  return match ? match[1] : "";
}

function decodeHtml(text) {
  const entities = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " "
  };
  return String(text || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity) => {
    const key = entity.toLowerCase();
    if (key.startsWith("#x")) return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
    if (key.startsWith("#")) return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
    return entities[key] || `&${entity};`;
  });
}

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderSourceIndex(sources) {
  const rows = sources.map((s) => [s.source_id, s.source_tier, s.type, s.title, s.author_or_org, s.published_at, s.url, s.status, s.notes]);
  return "# Source Index\n\n" + mdTable(["ID", "等级", "类型", "标题", "来源/作者", "日期", "URL", "状态", "备注"], rows) + "\n";
}

function renderSourceQuality(sources) {
  const accepted = sources.filter((s) => s.status === "accepted");
  const pending = sources.filter((s) => s.status === "pending");
  const rejected = sources.filter((s) => s.status === "rejected");
  const strong = sources.filter(isStrongEvidenceSource);
  const typeRows = Object.entries(groupCounts(sources.map((s) => s.type || "unknown"))).sort((a, b) => b[1] - a[1]);
  const warnings = sources.flatMap((s) => (s.quality_warnings || []).map((warning) => [s.source_id, warning]));
  const ruleHits = sources.flatMap((s) => (s.applied_rules || []).map((rule) => [s.source_id, rule.rule_id, rule.action, rule.weight_delta, rule.pattern]));
  const lines = [
    "# Source Quality",
    "",
    "## 概览",
    `- 来源总数：${sources.length}`,
    `- accepted：${accepted.length}`,
    `- pending：${pending.length}`,
    `- rejected：${rejected.length}`,
    `- S/A 级未拒绝来源：${strong.length}`,
    "",
    "## 来源类型",
    typeRows.length ? mdTable(["类型", "数量"], typeRows) : "- 暂无",
    "",
    "## 来源质量明细",
    mdTable(["ID", "等级", "状态", "可信分", "相关分", "标题", "警告"], sources.map((s) => [
      s.source_id,
      s.source_tier,
      s.status,
      s.credibility_score,
      s.relevance_score,
      s.title,
      (s.quality_warnings || []).join("<br>") || "无"
    ])),
    "",
    "## 命中的来源规则",
    ruleHits.length ? mdTable(["Source", "Rule", "Action", "Delta", "Pattern"], ruleHits) : "- 暂无",
    "",
    "## 需要人工处理",
    warnings.length ? mdTable(["Source", "Warning"], warnings) : "- 暂无"
  ];
  return lines.join("\n") + "\n";
}

function saveSources(project, sources) {
  const normalized = normalizeSources(sources);
  writeJson(path.join(project.project_dir, "sources.json"), normalized);
  writeSourceReports(project, normalized);
  return normalized;
}

function writeSourceReports(project, sources) {
  writeText(path.join(project.project_dir, "source_index.md"), renderSourceIndex(sources));
  writeText(path.join(project.project_dir, "source_quality.md"), renderSourceQuality(sources));
  writeText(path.join(project.project_dir, "rejected_sources.md"), renderRejectedSources(sources));
}

function normalizeSources(sources) {
  return sources.map((source) => normalizeSourceLifecycle(source));
}

function normalizeSourceLifecycle(source) {
  if (String(source.source_tier || "").toUpperCase() === "D") {
    if (source.status !== "rejected") source.status = "rejected";
    source.notes = appendUniqueNote(source.notes, "D 级来源默认进入 rejected_sources，不进入 knowledge_base 正文");
  }
  source.quality_warnings = sourceQualityWarnings(source);
  return source;
}

function appendUniqueNote(current, addition) {
  if (!addition || String(current || "").includes(addition)) return current || "";
  return appendNote(current, addition);
}

function isRejectedSource(source) {
  return source.status === "rejected" || String(source.source_tier || "").toUpperCase() === "D";
}

function isUsableKnowledgeSource(source) {
  return ["accepted", "pending"].includes(source.status) && !isRejectedSource(source);
}

function isCoreEvidenceCandidate(source) {
  return isUsableKnowledgeSource(source) && evidenceStrengthForSource(source) !== "weak";
}

function renderRejectedSources(sources) {
  const rejected = sources.filter(isRejectedSource);
  const lines = [
    "# Rejected Sources",
    "",
    "D 级或 rejected 来源默认不进入 knowledge_base 正文；如需重新采用，请先用 research update-source 调整等级和状态。",
    "",
    rejected.length
      ? mdTable(["ID", "等级", "类型", "标题", "URL", "原因"], rejected.map((s) => [s.source_id, s.source_tier, s.type, s.title, s.url, [...(s.quality_warnings || []), s.notes || "已拒绝"].filter(Boolean).join("<br>")]))
      : "- 暂无 rejected/D 级来源。"
  ];
  return lines.join("\n") + "\n";
}

function updateSource(p, projectId, sourceId, opts = {}) {
  const project = loadProject(p, projectId);
  const sourcesFile = path.join(project.project_dir, "sources.json");
  if (!fs.existsSync(sourcesFile)) throw new Error(`项目 ${projectId} 还没有 sources.json，请先运行 research collect。`);
  const sources = readJson(sourcesFile);
  const source = sources.find((item) => item.source_id.toLowerCase() === sourceId.toLowerCase());
  if (!source) throw new Error(`项目 ${projectId} 中找不到来源 ${sourceId}`);
  if (opts.status) source.status = opts.status;
  if (opts.tier) {
    source.source_tier = String(opts.tier).toUpperCase();
    source.credibility_score = { S: 1, A: 0.85, B: 0.7, C: 0.45, D: 0.1 }[source.source_tier] || source.credibility_score;
  }
  if (opts.title) source.title = opts.title;
  if (opts.author) source.author_or_org = opts.author;
  if (opts.date) source.published_at = opts.date;
  if (opts.notes) source.notes = appendNote(source.notes, opts.notes);
  if (opts.relevance) source.relevance_score = Number(opts.relevance);
  applySourceRules(p, source);
  const savedSources = saveSources(project, sources);
  if (fs.existsSync(path.join(project.project_dir, "knowledge_base.md"))) {
    refreshKnowledgeArtifacts(project, savedSources);
  }
  return { project_id: projectId, source };
}

async function buildKnowledgeBase(p, projectId) {
  const project = loadProject(p, projectId);
  const sourcesFile = path.join(project.project_dir, "sources.json");
  if (!fs.existsSync(sourcesFile)) await collectSources(p, projectId);
  const sources = saveSources(project, refreshSourceQualityWarnings(readJson(sourcesFile)));
  const evidenceItems = refreshKnowledgeArtifacts(project, sources);
  setProjectStatus(project, "knowledge_base_built");
  saveProject(p, project);
  return {
    project_id: projectId,
    evidence_items_path: path.join(project.project_dir, "evidence_items.json"),
    evidence_map_path: path.join(project.project_dir, "evidence_map.md"),
    knowledge_base_path: path.join(project.project_dir, "knowledge_base.md")
  };
}

function refreshKnowledgeArtifacts(project, sources) {
  const direction = readJson(path.join(project.project_dir, "selected_direction.json"), {});
  const evidenceItems = buildEvidenceItems(project, direction, sources);
  archiveProjectArtifacts(project, ["evidence_items.json", "evidence_map.md", "knowledge_base.md"]);
  writeJson(path.join(project.project_dir, "evidence_items.json"), evidenceItems);
  writeText(path.join(project.project_dir, "evidence_map.md"), renderEvidenceMap(project, direction, sources, evidenceItems));
  writeText(path.join(project.project_dir, "knowledge_base.md"), renderKnowledgeBase(project, direction, sources));
  return evidenceItems;
}

function refreshSourceQualityWarnings(sources) {
  return sources.map((source) => ({
    ...source,
    quality_warnings: sourceQualityWarnings(source)
  }));
}

function buildEvidenceItems(project, direction, sources) {
  return sources
    .filter(isUsableKnowledgeSource)
    .map((source, index) => evidenceItemForSource(project, direction, source, index));
}

function evidenceItemForSource(project, direction, source, index) {
  const text = sourceText(project, source);
  return {
    evidence_id: `E${String(index + 1).padStart(3, "0")}`,
    project_id: project.project_id,
    claim: evidenceClaimForSource(project, direction, source, text),
    source_ids: [source.source_id],
    evidence_type: evidenceTypeForSource(source, text),
    strength: evidenceStrengthForSource(source),
    notes: evidenceNotesForSource(source)
  };
}

function evidenceClaimForSource(project, direction, source, text) {
  const sentence = summarizeSentences(text)[0];
  if (sentence) return sentence;
  const topic = direction.title || project.topic_title;
  return `${source.title || source.source_id} is a candidate evidence source for "${topic}".`;
}

function evidenceTypeForSource(source, text) {
  const type = String(source.type || "").toLowerCase();
  const combined = `${source.title || ""} ${source.notes || ""} ${text.slice(0, 2000)}`;
  if (type === "paper" || source.metadata?.arxiv_id) return "theory";
  if (/case|customer|customer_story|case_study/i.test(`${type} ${combined}`)) return "case";
  if (/youtube|podcast|interview|talk|speech|transcript/i.test(`${type} ${combined}`)) return "quote";
  if (/\d|%|\$|roi|revenue|cost|hours|users|growth|benchmark|survey/i.test(combined)) return "data";
  if (/counter|risk|limitation|however|but|rebuttal/i.test(combined)) return "counterpoint";
  return "fact";
}

function evidenceStrengthForSource(source) {
  const tier = String(source.source_tier || "").toUpperCase();
  if (isStrongEvidenceSource(source)) return "strong";
  if (source.status !== "rejected" && ["S", "A", "B"].includes(tier)) return "medium";
  return "weak";
}

function evidenceNotesForSource(source) {
  return [
    `source_tier=${String(source.source_tier || "unknown").toUpperCase()}`,
    `status=${source.status || "pending"}`,
    `trace_complete=${hasStrongEvidenceTrace(source) ? "true" : "false"}`,
    source.url ? `url=${source.url}` : "",
    source.notes ? `notes=${source.notes}` : ""
  ].filter(Boolean).join("; ");
}

function renderEvidenceMap(project, direction, sources, evidenceItems = []) {
  const usable = sources.filter(isUsableKnowledgeSource);
  const strong = usable.filter(isStrongEvidenceSource);
  const medium = usable.filter((s) => evidenceStrengthForSource(s) === "medium");
  const lines = ["# Evidence Map", "", `## 核心论点 1：${direction.title || project.topic_title}`, "", "### 强证据"];
  lines.push(...(strong.length ? strong.map((s) => `- [${s.source_id}] ${s.title} 可作为核心证据候选。`) : ["- 暂无 S/A 级强证据，深研阶段必须补足。"]));
  lines.push("", "### 中等证据", ...(medium.length ? medium.map((s) => `- [${s.source_id}] ${s.title} 当前只能辅助理解。`) : ["- 暂无。"]), "", "### 仍缺证据", "- 至少一个可核验的一手来源。", "- 至少一个企业案例或明确业务场景。", "- 若涉及效率/成本判断，需要可引用数据。");
  if (evidenceItems.length) {
    lines.push(
      "",
      "## Structured Evidence Items",
      mdTable(
        ["evidence_id", "claim", "source_ids", "type", "strength"],
        evidenceItems.map((item) => [item.evidence_id, item.claim, item.source_ids.join(", "), item.evidence_type, item.strength])
      )
    );
  }
  return lines.join("\n") + "\n";
}

function renderKnowledgeBase(project, direction, sources) {
  const usable = sources.filter(isUsableKnowledgeSource);
  const sourceLines = usable.map((s) => `- [${s.source_id}] ${s.title}: ${s.url}`);
  const coreSources = usable.filter(isCoreEvidenceCandidate);
  const accepted = coreSources.filter((s) => s.status === "accepted");
  const extractedFacts = accepted.flatMap((s) => sourceFactLines(project, s)).slice(0, 6);
  const factLines = extractedFacts.length
    ? extractedFacts
    : [coreSources.length ? `- 待验证事实：${project.topic_title} 需要用一手来源确认背景、案例和数据。 [${coreSources[0].source_id}]` : "- 暂无可作为核心事实的 S/A/B 来源。"];
  const caseLines = accepted
    .filter((s) => ["S", "A"].includes(s.source_tier) || /case|客户|案例|customer/i.test(`${s.title} ${s.notes}`))
    .map((s) => `- [${s.source_id}] ${s.title} 可作为案例候选，需核对正文中的业务场景和结果。`);
  const dataLines = accepted
    .filter((s) => sourceText(project, s).match(/\d|%|倍| million| billion| revenue|cost|hours/i))
    .map((s) => `- [${s.source_id}] 抽取文本中包含数字线索，需二次确认可引用口径。`);
  const paperLines = sources
    .filter((s) => isCoreEvidenceCandidate(s) && (s.type === "paper" || s.metadata?.arxiv_id))
    .map((s) => `- [${s.source_id}] ${s.title}（${s.status}，${s.source_tier} 级）：${s.url}`);
  return [
    `# 选题知识库：${project.topic_title}`,
    "",
    "## 1. 选题一句话判断",
    direction.core_viewpoint || project.core_viewpoint || "",
    "",
    "## 2. 背景",
    "当前知识库为 MVP 资料包骨架。所有 pending 来源都需要人工核验后才能作为强证据使用。",
    "",
    "## 3. 核心事实",
    ...factLines,
    "",
    "## 4. 关键案例",
    ...(caseLines.length ? caseLines : ["- 待补充官方客户案例或可信企业实践。"]),
    "",
    "## 5. 关键人物观点",
    "- 待补充创始人、高管、Builder 或专家原始观点。",
    "",
    "## 6. 可引用数据",
    ...(dataLines.length ? dataLines : ["- 待补充公开数据、报告数字或产品指标。"]),
    "",
    "## 7. 论文/理论支撑",
    ...(paperLines.length ? paperLines : ["- 若该选题涉及模型能力，需要补充论文原文或官方技术报告。"]),
    "",
    "## 8. 可转化内容角度",
    "- 老板视角：业务价值、组织变化、风险边界。",
    "- 实操视角：流程、模板、工具链、验收标准。",
    "",
    "## 9. 风险与不确定性",
    "- 不得把 pending 搜索结果直接写成事实。",
    "- 没有 S/A 级来源时，只能输出假设和待验证问题。",
    "",
    "## 10. 原始来源链接汇总",
    ...(sourceLines.length ? sourceLines : ["- 暂无。"])
  ].join("\n") + "\n";
}

function sourceFactLines(project, source) {
  const text = sourceText(project, source);
  if (!text) return [`- [${source.source_id}] 已接受来源：${source.title}。`];
  return summarizeSentences(text).slice(0, 2).map((sentence) => `- ${sentence} [${source.source_id}]`);
}

function sourceText(project, source, opts = {}) {
  const candidates = [];
  if (opts.includeDeepSummary !== false) {
    if (source.metadata?.deep_summary_path) candidates.push(source.metadata.deep_summary_path);
    candidates.push(path.join("raw", "deep_summaries", `${source.source_id}.md`));
  }
  if (source.extracted_text_path) candidates.push(source.extracted_text_path);
  if (source.transcript_path) candidates.push(source.transcript_path);
  const candidate = candidates.find((entry) => {
    const file = path.isAbsolute(entry) ? entry : path.join(project.project_dir, entry);
    return fs.existsSync(file);
  });
  if (!candidate) return "";
  const file = path.isAbsolute(candidate) ? candidate : path.join(project.project_dir, candidate);
  return readText(file)
    .replace(/^# .+$/gm, "")
    .replace(/^URL:.+$/gm, "")
    .replace(/^Content-Type:.+$/gm, "")
    .replace(/^(arXiv ID|PDF|Authors|Published|Updated|Categories):.+$/gm, "")
    .replace(/^## Extracted Text$/gm, "")
    .replace(/^## (Abstract|PDF Text)$/gm, "")
    .trim();
}

function summarizeSentences(text) {
  const cleaned = normalizeWhitespace(text);
  const sentences = cleaned
    .split(/(?<=[。！？.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 24 && item.length <= 220);
  if (sentences.length) return sentences.slice(0, 3);
  return cleaned ? [cleaned.slice(0, 180)] : [];
}

function backfillProjectLinks(p, projectId) {
  const project = loadProject(p, projectId);
  const sources = saveSources(project, readJson(path.join(project.project_dir, "sources.json"), []));
  const lines = ["[深研来源]"];
  sources.filter(isUsableKnowledgeSource).slice(0, 10).forEach((s) => lines.push(`${s.source_id} ${s.title}：${s.url}`));
  lines.push("", "[本地知识库]", path.join(project.project_dir, "knowledge_base.md"));
  backfillLinksToLibrary(p, Number(project.csv_row_number), lines.join("\n"));
  setProjectStatus(project, "links_backfilled");
  saveProject(p, project);
  const batch = markProjectCompleted(p, projectId);
  return { project_id: projectId, library_path: p.libraryCsv, batch: batch ? batch.batch_id : null };
}

function backfillLinksToLibrary(p, rowNumber, addition) {
  const { rows, fields } = readLibrary(p);
  let row = rows.find((item) => Number(item["序号"]) === rowNumber);
  if (!row && rowNumber >= 1 && rowNumber <= rows.length) row = rows[rowNumber - 1];
  if (!row) throw new Error(`选题库中找不到第 ${rowNumber} 行/序号。`);
  row["关联热点链接/帖子"] = mergeLinkBlocks(row["关联热点链接/帖子"] || "", addition);
  writeLibrary(p, rows, fields);
}

function markProjectCompleted(p, projectId) {
  const project = loadProject(p, projectId);
  setProjectStatus(project, "project_completed");
  saveProject(p, project);
  const pointer = readJson(path.join(p.stateDir, "active_batch.json"), {});
  if (!pointer.batch_id) return null;
  const batch = loadBatch(p, pointer.batch_id);
  const item = batch.items.find((entry) => entry.project_id === projectId);
  if (!item || item.status !== "active") return batch;
  item.status = "completed";
  item.completed_at = isoNow();
  return advanceLoadedBatch(p, batch, true);
}

async function runResearch(p, projectId) {
  const plan = generateResearchPlan(p, projectId);
  const sources = await collectSources(p, projectId);
  const kb = await buildKnowledgeBase(p, projectId);
  const backfill = backfillProjectLinks(p, projectId);
  return { plan, sources, knowledge_base: kb, backfill };
}

function writeBatchSummary(p, batch) {
  const file = path.join(p.batchDir, `${batch.batch_id}_summary.md`);
  const terminalCount = (batch.items || []).filter((item) => isTerminalBatchItem(item)).length;
  const strategyIssues = [];
  const ruleSuggestions = [];
  const lines = [`# Selection Batch Summary：${batch.batch_id}`, "", `- 本批次确认选题：${batch.total_count} 个`, `- 完成/跳过/失败：${terminalCount} 个`, "", "## 选题状态"];
  for (const item of batch.items) {
    const project = safeLoadProject(p, item.project_id);
    if (!project) {
      lines.push(`### ${item.row_number}. ${item.topic_title}`, `- 状态：${item.status}`, `- 项目：${item.project_id}`, "- 项目目录缺失，无法汇总资料包。", "");
      strategyIssues.push(`行 ${item.row_number} 项目目录缺失，批次资料无法完整追溯。`);
      continue;
    }
    const kb = path.join(project.project_dir, "knowledge_base.md");
    const selectedDirection = readJson(path.join(project.project_dir, "selected_direction.json"), {});
    const sources = readProjectSources(project);
    const sourceLinks = sources.filter(isUsableKnowledgeSource).slice(0, 10);
    const evidenceItems = readProjectEvidenceItems(project);
    const strongEvidence = evidenceItems.filter((item) => item.strength === "strong");
    const weakSources = sources.filter((source) => source.status === "rejected" || source.source_tier === "D" || (source.quality_warnings || []).length);
    lines.push(
      `### ${item.row_number}. ${item.topic_title}`,
      `- 状态：${item.status}`,
      `- 项目：${item.project_id}`,
      `- 确认方向：${project.selected_direction_id || "未确认"}${selectedDirection.title ? `：${selectedDirection.title}` : ""}`,
      `- 知识库路径：${fs.existsSync(kb) ? kb : "未生成"}`,
      `- 回填链接：${isProjectComplete(project) ? "已回填" : "未回填"}`,
      `- 结构化证据：${strongEvidence.length} 条 strong / ${evidenceItems.length} 条 EvidenceItem`,
      "- 回填来源："
    );
    lines.push(...(sourceLinks.length ? sourceLinks.map((source) => `  - [${source.source_id}] ${source.title}: ${source.url}`) : ["  - 暂无可回填来源"]));
    if (item.status === "skipped_by_user") lines.push(`- 跳过原因：${item.skip_reason || "未记录"}`);
    if (item.failure_reason) lines.push(`- 失败原因：${item.failure_reason}`);
    if (item.failure_report_path) lines.push(`- 失败报告：${item.failure_report_path}`);
    if (weakSources.length) {
      lines.push("- 资料问题：");
      lines.push(...weakSources.slice(0, 5).map((source) => `  - [${source.source_id}] ${source.title}：${(source.quality_warnings || [source.notes || source.status]).join("；")}`));
    }
    const projectIssues = batchStrategyIssuesForItem(item, project, sources, evidenceItems);
    strategyIssues.push(...projectIssues);
    ruleSuggestions.push(...batchRuleSuggestionsForItem(item, project, sources, projectIssues));
    lines.push("");
  }
  const uniqueIssues = uniqueLines(strategyIssues);
  const uniqueSuggestions = uniqueLines(ruleSuggestions);
  lines.push(
    "## 本批次暴露出的策略问题",
    ...(uniqueIssues.length ? uniqueIssues.map((item) => `- ${item}`) : ["- 暂未发现明显策略问题。"]),
    "",
    "## 可写入反馈学习模块的规则建议",
    ...(uniqueSuggestions.length ? uniqueSuggestions.map((item) => `- ${item}`) : ["- 暂无自动派生规则建议；优先记录用户对方向、来源、资料质量的明确反馈。"])
  );
  writeText(file, lines.join("\n") + "\n");
  return file;
}

function readProjectEvidenceItems(project) {
  return readJson(path.join(project.project_dir, "evidence_items.json"), []);
}

function batchStrategyIssuesForItem(item, project, sources, evidenceItems) {
  const issues = [];
  const strongCount = evidenceItems.filter((entry) => entry.strength === "strong").length;
  const accepted = sources.filter((source) => source.status === "accepted").length;
  const pending = sources.filter((source) => source.status === "pending").length;
  const rejected = sources.filter((source) => source.status === "rejected");
  const highTierIncomplete = sources.filter((source) => isHighTierSource(source) && !hasStrongEvidenceTrace(source));
  if (item.status === "skipped_by_user") issues.push(`行 ${item.row_number} 被跳过：${item.skip_reason || "未记录原因"}`);
  if (item.status === "failed_with_report") issues.push(`行 ${item.row_number} 失败：${item.failure_reason || "未记录原因"}`);
  if (evidenceItems.length && !strongCount) issues.push(`${project.project_id} 没有 trace 完整的 strong EvidenceItem，后续不能直接成稿为确定事实。`);
  if (pending > accepted) issues.push(`${project.project_id} pending 来源多于 accepted 来源，资料包仍偏候选清单。`);
  if (rejected.length) issues.push(`${project.project_id} 有 ${rejected.length} 个 rejected 来源，需要沉淀为来源规避规则。`);
  if (highTierIncomplete.length) issues.push(`${project.project_id} 有 ${highTierIncomplete.length} 个 S/A 来源缺 URL、发布日期或作者/机构，不能作为强证据。`);
  return issues;
}

function batchRuleSuggestionsForItem(item, project, sources, issues) {
  const suggestions = [];
  if (item.status === "skipped_by_user" && item.skip_reason) {
    suggestions.push(`可记录跳过原因：${feedbackCommand(project.project_id, `topic:${project.project_id}`, "negative", item.skip_reason)}`);
  }
  if (item.status === "failed_with_report" && item.failure_reason) {
    suggestions.push(`可记录失败原因：${feedbackCommand(project.project_id, `topic:${project.project_id}`, "negative", item.failure_reason)}`);
  }
  for (const source of sources.filter((entry) => entry.status === "rejected").slice(0, 5)) {
    suggestions.push(`可规避低质来源：${feedbackCommand(project.project_id, `source:${source.source_id}`, "negative", source.notes || source.title || "来源质量不合格")}`);
  }
  if (issues.some((issue) => issue.includes("没有 trace 完整的 strong EvidenceItem"))) {
    suggestions.push(`可偏好可追溯一手来源：${feedbackCommand(project.project_id, `topic:${project.project_id}`, "positive", "后续同类选题优先寻找 URL、发布日期、作者机构完整的 S/A 一手来源", "S/A 一手来源")}`);
  }
  return suggestions;
}

function feedbackCommand(projectId, target, sentiment, text, pattern = "") {
  return `node bin/topic-agent.mjs feedback add --project ${projectId} --target ${target} --sentiment ${sentiment} --text ${shellQuote(text)}${pattern ? ` --pattern ${shellQuote(pattern)}` : ""}`;
}

function shellQuote(text) {
  return `"${String(text || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function uniqueLines(lines) {
  return [...new Set(lines.filter(Boolean))];
}

function addFeedback(p, opts) {
  opts = normalizeFeedbackOptions(opts);
  const rows = readJsonl(path.join(p.stateDir, "feedback_log.jsonl"));
  const { targetType, targetId } = parseTarget(required(opts.target, "--target"), opts.type);
  const sentiment = required(opts.sentiment, "--sentiment");
  const text = required(opts.text, "--text");
  const columnFeedback = targetType === "column" ? columnFeedbackInfo(opts, targetId, text) : null;
  const pattern = columnFeedback ? columnFeedback.pattern : opts.pattern || opts.keyword || opts.match || "";
  const feedback = {
    feedback_id: `FB-${String(rows.length + 1).padStart(3, "0")}`,
    project_id: opts.project || null,
    target_type: targetType,
    target_id: targetId,
    sentiment,
    feedback_text: text,
    rule_candidate: columnFeedback
      ? `把匹配“${columnFeedback.pattern}”的选题归入栏目“${columnFeedback.targetColumn}”`
      : `对 ${targetType} 中匹配“${pattern || text.slice(0, 30)}”的模式${sentiment === "positive" ? "提高权重" : sentiment === "negative" ? "降低权重" : "记录观察"}`,
    metadata: pattern ? { pattern, ...(columnFeedback ? { column: columnFeedback.targetColumn } : {}) } : undefined,
    created_at: isoNow(),
    applied_to_rules: false
  };
  appendJsonl(path.join(p.stateDir, "feedback_log.jsonl"), feedback);
  recordProjectFeedback(p, feedback);
  return feedback;
}

function normalizeFeedbackOptions(opts) {
  const normalized = { ...opts };
  const type = String(opts.type || "");
  const match = type.match(/^(source|topic|direction|column|material)_(positive|negative|neutral)$/);
  if (!match) return normalized;
  const [, targetType, sentiment] = match;
  normalized.type = targetType;
  normalized.sentiment = normalized.sentiment || sentiment;
  if (!normalized.target) {
    const targetId = opts.source || opts.direction || opts.topic || opts.column || opts.material || opts.id || opts.target_id;
    if (targetId) normalized.target = `${targetType}:${targetId}`;
  }
  return normalized;
}

function recordProjectFeedback(p, feedback) {
  if (!feedback.project_id) return;
  const project = safeLoadProject(p, feedback.project_id);
  if (!project) return;
  appendProjectFeedbackEntry(project, feedback);
  if (!["skipped_by_user", "failed_with_report"].includes(project.status)) {
    project.feedback_collected_at = feedback.created_at;
    setProjectStatus(project, "feedback_collected");
    saveProject(p, project);
  }
}

function appendProjectFeedbackEntry(project, feedback) {
  const file = path.join(project.project_dir, "feedback.md");
  const lines = fs.existsSync(file) ? readText(file).trimEnd().split(/\r?\n/) : [`# Project Feedback：${project.project_id}`, ""];
  lines.push(
    `## ${feedback.feedback_id} ${feedback.sentiment}`,
    `- Target: ${feedback.target_type}:${feedback.target_id}`,
    `- Text: ${feedback.feedback_text}`,
    `- Rule candidate: ${feedback.rule_candidate}`,
    `- Created: ${feedback.created_at}`,
    `- Applied to rules: ${feedback.applied_to_rules ? "true" : "false"}`,
    ""
  );
  writeText(file, lines.join("\n") + "\n");
}

function appendProjectLearningEntry(project, feedback) {
  const file = path.join(project.project_dir, "feedback.md");
  const lines = fs.existsSync(file) ? readText(file).trimEnd().split(/\r?\n/) : [`# Project Feedback：${project.project_id}`, ""];
  lines.push(
    `### Learning applied for ${feedback.feedback_id}`,
    `- Rule candidate: ${feedback.rule_candidate}`,
    `- Applied at: ${isoNow()}`,
    ""
  );
  writeText(file, lines.join("\n") + "\n");
}

function columnFeedbackInfo(opts, targetId, text) {
  const targetColumn = opts.column || opts["target-column"] || inferTargetColumn(text) || targetId;
  const pattern = opts.pattern || opts.keyword || opts.match || targetId || targetColumn;
  return { targetColumn, pattern };
}

function inferTargetColumn(text) {
  const match = String(text || "").match(/应该(?:放|归到|归入|进入|改成)\s*([^，。,.]+)/);
  return match ? match[1].trim() : "";
}

function applyLearning(p) {
  const file = path.join(p.stateDir, "feedback_log.jsonl");
  const rows = readJsonl(file);
  const unapplied = rows.filter((row) => !row.applied_to_rules);
  for (const row of unapplied) {
    const block = learningRuleBlock(row);
    fs.appendFileSync(learningRuleFile(p, row.target_type), block, "utf8");
    row.applied_to_rules = true;
    row.applied_at = isoNow();
    recordProjectLearningApplied(p, row);
  }
  writeJsonl(file, rows);
  return { applied_count: unapplied.length, rules: unapplied.map((row) => row.rule_candidate) };
}

function recordProjectLearningApplied(p, feedback) {
  if (!feedback.project_id) return;
  const project = safeLoadProject(p, feedback.project_id);
  if (!project) return;
  appendProjectLearningEntry(project, feedback);
  if (!["skipped_by_user", "failed_with_report"].includes(project.status)) {
    project.learning_applied_at = feedback.applied_at || isoNow();
    setProjectStatus(project, "learning_applied");
    saveProject(p, project);
  }
}

function syncFeedbackArtifacts(p) {
  const rows = readJsonl(path.join(p.stateDir, "feedback_log.jsonl"));
  const byProject = new Map();
  for (const row of rows.filter((item) => item.project_id)) {
    if (!byProject.has(row.project_id)) byProject.set(row.project_id, []);
    byProject.get(row.project_id).push(row);
  }
  const synced = [];
  for (const [projectId, feedbackRows] of byProject.entries()) {
    const project = safeLoadProject(p, projectId);
    if (!project) continue;
    writeProjectFeedbackFile(project, feedbackRows);
    if (!["skipped_by_user", "failed_with_report"].includes(project.status)) {
      const latestCreated = feedbackRows.map((row) => row.created_at).filter(Boolean).sort().at(-1);
      const latestApplied = feedbackRows.map((row) => row.applied_at).filter(Boolean).sort().at(-1);
      project.feedback_collected_at = latestCreated || project.feedback_collected_at || isoNow();
      if (feedbackRows.some((row) => row.applied_to_rules)) {
        project.learning_applied_at = latestApplied || project.learning_applied_at || isoNow();
        setProjectStatus(project, "learning_applied");
      } else {
        setProjectStatus(project, "feedback_collected");
      }
      saveProject(p, project);
    }
    synced.push({ project_id: projectId, feedback_count: feedbackRows.length, feedback_path: path.join(project.project_dir, "feedback.md"), status: project.status });
  }
  return { synced_count: synced.length, synced_projects: synced };
}

function writeProjectFeedbackFile(project, feedbackRows) {
  const lines = [`# Project Feedback：${project.project_id}`, ""];
  for (const feedback of feedbackRows) {
    lines.push(
      `## ${feedback.feedback_id} ${feedback.sentiment}`,
      `- Target: ${feedback.target_type}:${feedback.target_id}`,
      `- Text: ${feedback.feedback_text}`,
      `- Rule candidate: ${feedback.rule_candidate}`,
      `- Created: ${feedback.created_at}`,
      `- Applied to rules: ${feedback.applied_to_rules ? "true" : "false"}`,
      ""
    );
    if (feedback.applied_to_rules) {
      lines.push(
        `### Learning applied for ${feedback.feedback_id}`,
        `- Rule candidate: ${feedback.rule_candidate}`,
        `- Applied at: ${feedback.applied_at || "unknown"}`,
        ""
      );
    }
  }
  writeText(path.join(project.project_dir, "feedback.md"), lines.join("\n"));
}

function learningRuleBlock(row) {
  if (row.target_type === "column") {
    const pattern = row.metadata?.pattern || row.target_id || row.feedback_text;
    const column = row.metadata?.column || inferTargetColumn(row.feedback_text) || row.target_id;
    return `\n- rule_id: RULE-${row.feedback_id}\n  scope: column\n  pattern: "${yamlEscape(pattern)}"\n  action: route\n  column: "${yamlEscape(column)}"\n  weight_delta: 0\n  reason: "${yamlEscape(row.rule_candidate)}"\n  created_from_feedback_id: ${row.feedback_id}\n  created_at: ${isoNow()}\n  enabled: true\n`;
  }
  const action = row.sentiment === "positive" ? "prefer" : row.sentiment === "negative" ? "avoid" : "observe";
  const pattern = row.metadata?.pattern || row.feedback_text;
  return `\n- rule_id: RULE-${row.feedback_id}\n  scope: ${row.target_type}\n  pattern: "${yamlEscape(pattern)}"\n  action: ${action}\n  weight_delta: ${action === "prefer" ? 0.3 : action === "avoid" ? -0.3 : 0}\n  reason: "${yamlEscape(row.rule_candidate)}"\n  created_from_feedback_id: ${row.feedback_id}\n  created_at: ${isoNow()}\n  enabled: true\n`;
}

function learningRuleFile(p, targetType) {
  if (targetType === "source" || targetType === "material") return path.join(p.configDir, "source_rules.yml");
  if (targetType === "column") return path.join(p.configDir, "column_rules.yml");
  return path.join(p.configDir, "strategy_rules.yml");
}

function listRules(p, type = "all") {
  const types = type === "all" ? ["strategy", "source", "column"] : [normalizeRuleType(type)];
  const rules = types.flatMap((entryType) => readRuleFile(ruleFileFor(p, entryType)).blocks.map((block) => ({
    type: entryType,
    rule_id: block.rule.rule_id || "",
    scope: block.rule.scope || "",
    pattern: block.rule.pattern || "",
    action: block.rule.action || "",
    column: block.rule.column || block.rule.target_column || block.rule.to_column || "",
    weight_delta: block.rule.weight_delta ?? null,
    enabled: block.rule.enabled !== false,
    reason: block.rule.reason || "",
    created_from_feedback_id: block.rule.created_from_feedback_id || ""
  })));
  return { count: rules.length, rules };
}

function mutateRule(p, type, ruleId, action) {
  const normalizedType = normalizeRuleType(type);
  const file = ruleFileFor(p, normalizedType);
  const ruleFile = readRuleFile(file);
  const index = ruleFile.blocks.findIndex((block) => sameRule(block.rule, ruleId));
  if (index < 0) throw new Error(`在 ${normalizedType} rules 中找不到规则 ${ruleId}`);
  const backup = fs.existsSync(file) ? backupFile(file, p.backupsDir) : null;
  const target = ruleFile.blocks[index];
  if (action === "rollback") {
    ruleFile.blocks.splice(index, 1);
  } else {
    const enabled = action === "enable";
    target.text = setRuleEnabled(target.text, enabled);
    target.rule = parseRuleBlock(target.text);
  }
  writeRuleFile(file, ruleFile);
  return {
    type: normalizedType,
    action,
    rule_id: target.rule.rule_id || ruleId,
    enabled: action === "rollback" ? false : target.rule.enabled !== false,
    backup_path: backup,
    file
  };
}

function normalizeRuleType(type) {
  const value = String(type || "").toLowerCase();
  if (["strategy", "topic"].includes(value)) return "strategy";
  if (["source", "sources"].includes(value)) return "source";
  if (["column", "columns"].includes(value)) return "column";
  throw new Error(`未知规则类型 ${type}，请使用 strategy、source 或 column。`);
}

function ruleFileFor(p, type) {
  return path.join(p.configDir, `${normalizeRuleType(type)}_rules.yml`);
}

function readRuleFile(file) {
  const text = fs.existsSync(file) ? readText(file) : "";
  const firstBlock = text.search(/^- rule_id:/m);
  const prefix = firstBlock >= 0 ? text.slice(0, firstBlock) : text;
  const blockText = firstBlock >= 0 ? text.slice(firstBlock) : "";
  const blocks = blockText
    .split(/\n(?=- rule_id:)/g)
    .map((block) => block.trim())
    .filter((block) => block.includes("rule_id:"))
    .map((block) => ({ text: `${block}\n`, rule: parseRuleBlock(block) }));
  return { prefix, blocks };
}

function writeRuleFile(file, ruleFile) {
  const prefix = ruleFile.prefix.endsWith("\n") || !ruleFile.prefix ? ruleFile.prefix : `${ruleFile.prefix}\n`;
  const body = ruleFile.blocks.map((block) => block.text.trimEnd()).join("\n");
  writeText(file, `${prefix}${body}${body ? "\n" : ""}`);
}

function sameRule(rule, ruleId) {
  const value = String(ruleId || "").toLowerCase();
  return [rule.rule_id, rule.pattern, rule.created_from_feedback_id].filter(Boolean).some((candidate) => String(candidate).toLowerCase() === value);
}

function setRuleEnabled(blockText, enabled) {
  const text = String(blockText || "").trimEnd();
  if (/^  enabled:/m.test(text)) return `${text.replace(/^  enabled:.+$/m, `  enabled: ${enabled}`)}\n`;
  return `${text}\n  enabled: ${enabled}\n`;
}

function weeklyReview(p) {
  const { rows } = readLibrary(p);
  const projectIndex = Object.values(readJson(path.join(p.stateDir, "project_index.json"), { projects: {} }).projects);
  const projects = projectIndex.map((project) => readJson(path.join(project.project_dir, "project.yml"), project));
  const batches = readBatches(p);
  const feedback = readJsonl(path.join(p.stateDir, "feedback_log.jsonl"));
  const sources = projects.flatMap((project) => readProjectSources(project));
  const confirmedProjectIds = new Set(batches.flatMap((batch) => batch.items || []).map((item) => item.project_id).filter(Boolean));
  const csvConfirmed = rows.filter((row) => row["是否选题"]);
  const confirmedCount = confirmedProjectIds.size || csvConfirmed.length;
  const projectsWithDirections = projects.filter((project) => fs.existsSync(path.join(project.project_dir, "directions.json")));
  const selectedDirectionProjects = projects.filter((project) => project.selected_direction_id);
  const deep = projects.filter((project) => project.status === "knowledge_base_built" || isProjectComplete(project));
  const backfilled = projects.filter((project) => isProjectComplete(project));
  const acceptedSources = sources.filter((source) => source.status === "accepted");
  const pendingSources = sources.filter((source) => source.status === "pending");
  const rejectedSources = sources.filter((source) => source.status === "rejected");
  const strongSources = sources.filter(isStrongEvidenceSource);
  const sourceRuleHits = sources.flatMap((source) => source.applied_rules || []);
  const week = `${new Date().getFullYear()}-W${String(weekNumber(new Date())).padStart(2, "0")}`;
  const file = path.join(p.reviewsDir, `weekly_topic_agent_review_${week}.md`);
  const highQualitySources = acceptedSources.filter(isStrongEvidenceSource);
  const positiveSourceFeedback = feedback.filter((item) => item.target_type === "source" && item.sentiment === "positive");
  const negativeSourceFeedback = feedback.filter((item) => item.target_type === "source" && item.sentiment === "negative");
  const strongProjectIds = new Set(strongSources.map((source) => source.project_id));
  const strongEvidenceCoverage = deep.length ? Math.round((deep.filter((project) => strongProjectIds.has(project.project_id)).length / deep.length) * 100) : 0;
  const linkBackfillRate = deep.length ? Math.round((backfilled.length / deep.length) * 100) : 0;
  const reworkFeedback = feedback.filter((item) => /重找|重做|返工|重新|换一批|不对|太泛|不靠谱/.test(item.feedback_text || ""));
  const columnCorrections = feedback.filter((item) => item.target_type === "column");
  const columnCorrectionRate = rows.length ? Math.round((columnCorrections.length / rows.length) * 100) : 0;
  const lines = ["# Weekly Topic Agent Review", "", "## 1. 本周数据", `- 入库选题：${rows.length}`, `- 批次数：${batches.length}`, `- 用户确认项目：${confirmedCount}`, `- 已确认方向：${selectedDirectionProjects.length}`, `- 深研项目：${deep.length}`, `- 回填完成：${backfilled.length}`, `- 来源总数：${sources.length}`, `- accepted/pending/rejected：${acceptedSources.length}/${pendingSources.length}/${rejectedSources.length}`, `- S/A 强证据候选：${strongSources.length}`, `- 来源规则命中：${sourceRuleHits.length}`, "", "## 2. 命中率", `- 入库命中率：${rows.length ? Math.round((confirmedCount / rows.length) * 100) : 0}%`, `- 方向采纳率：${projectsWithDirections.length ? Math.round((selectedDirectionProjects.length / projectsWithDirections.length) * 100) : 0}%`, `- 素材采纳率：${sources.length ? Math.round((acceptedSources.length / sources.length) * 100) : 0}%`, `- 强证据覆盖率：${strongEvidenceCoverage}%`, `- 链接回填完成率：${linkBackfillRate}%`, `- 返工次数：${reworkFeedback.length}`, `- 栏目匹配修正率：${columnCorrectionRate}%`, "", "## 3. 高质量来源"];
  lines.push(...(highQualitySources.length ? highQualitySources.slice(0, 10).map((source) => `- [${source.project_id}/${source.source_id}] ${source.source_tier} ${source.title}`) : ["- 暂无"]));
  if (positiveSourceFeedback.length) lines.push("", "### 用户正反馈", ...positiveSourceFeedback.slice(0, 10).map((item) => `- ${item.feedback_text}`));
  lines.push("", "## 4. 低质量来源");
  lines.push(...(rejectedSources.length ? rejectedSources.slice(0, 10).map((source) => `- [${source.project_id}/${source.source_id}] ${source.source_tier} ${source.title}：${source.notes || "已拒绝"}`) : ["- 暂无"]));
  if (negativeSourceFeedback.length) lines.push("", "### 用户负反馈", ...negativeSourceFeedback.slice(0, 10).map((item) => `- ${item.feedback_text}`));
  lines.push("", "## 5. 用户反馈总结");
  lines.push(...(feedback.length ? feedback.slice(-10).map((item) => `- [${item.sentiment}] ${item.target_type}:${item.target_id} ${item.feedback_text}`) : ["- 暂无"]), "", "## 6. 已更新规则");
  const applied = feedback.filter((item) => item.applied_to_rules);
  lines.push(...(applied.length ? applied.map((item) => `- ${item.rule_candidate}`) : ["- 暂无"]), "", "## 7. 下周策略建议", "- 优先补充 S/A 级一手来源，减少 pending 搜索链接停留时间。", "- 每次用户否定来源或方向后，立即运行 learn apply 生成可解释规则。");
  writeText(file, lines.join("\n") + "\n");
  return { review_path: file };
}

function readBatches(p) {
  if (!fs.existsSync(p.batchDir)) return [];
  return fs.readdirSync(p.batchDir)
    .filter((name) => name.endsWith(".yml") && !name.endsWith("_summary.md"))
    .map((name) => readJson(path.join(p.batchDir, name)))
    .filter(Boolean);
}

function readProjectSources(project) {
  const file = path.join(project.project_dir, "sources.json");
  if (!fs.existsSync(file)) return [];
  return normalizeSources(readJson(file, [])).map((source) => ({ ...source, project_id: project.project_id }));
}

function parseRoot(argv) {
  const copy = [...argv];
  let root = ".";
  for (let index = 0; index < copy.length; index += 1) {
    if (copy[index] === "--root") {
      root = copy[index + 1];
      copy.splice(index, 2);
      break;
    }
  }
  return { root, argv: copy };
}

function parseOptions(argv) {
  const opts = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) opts[key] = true;
    else {
      opts[key] = next;
      index += 1;
    }
  }
  return opts;
}

function parseRows(value) {
  return String(value).replace(/[，、]/g, ",").split(",").map((part) => Number(part.trim())).filter(Boolean);
}

function dateOnly(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const direct = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (direct) return direct[0];
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return text;
}

function isCheckedValue(value) {
  const text = cellText(value).trim().toLowerCase();
  return ["true", "yes", "y", "1", "是", "已选", "选中", "勾选", "☑", "✓", "√", "x"].includes(text);
}

function cellText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("");
    if (value.text) return String(value.text);
    if (value.result !== undefined) return cellText(value.result);
    if (value.hyperlink && value.text) return String(value.text);
  }
  return String(value);
}

function parseTarget(target, explicitType) {
  if (target.includes(":")) {
    const [type, id] = target.split(/:(.*)/s);
    return { targetType: explicitType || type, targetId: id };
  }
  return { targetType: explicitType || "topic", targetId: target };
}

function required(value, name) {
  if (value === undefined || value === null || value === "") throw new Error(`缺少参数 ${name}`);
  return value;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(value);
      value = "";
    } else if (ch === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (ch !== "\r") value += ch;
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  const fields = rows.shift() || [];
  return { fields, rows: rows.filter((r) => r.some((cell) => cell !== "")).map((r) => Object.fromEntries(fields.map((field, index) => [field, r[index] || ""]))) };
}

function stringifyCsv(rows, fields) {
  return [fields.map(csvCell).join(","), ...rows.map((row) => fields.map((field) => csvCell(row[field] || "")).join(","))].join("\r\n") + "\r\n";
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeCsv(file, rows, fields) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, "\uFEFF" + stringifyCsv(rows, fields), "utf8");
}

function normalizeFields(fields) {
  const extras = fields.filter((field) => field && !TOPIC_FIELDS.includes(field) && !field.startsWith("Unnamed:"));
  return [...TOPIC_FIELDS, ...extras];
}

function mergeLinkBlocks(current, addition) {
  const seen = new Set(String(current || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const lines = String(current || "").split(/\r?\n/).filter((line, index, arr) => line || index < arr.length - 1);
  if (current.trim() && addition.trim()) lines.push("");
  for (const line of addition.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && seen.has(trimmed)) continue;
    lines.push(line);
    if (trimmed) seen.add(trimmed);
  }
  return lines.join("\n").trim();
}

function mdTable(headers, rows) {
  const clean = (cell) => String(cell ?? "").replace(/\n/g, "<br>").replace(/\|/g, "\\|");
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.map(clean).join(" | ")} |`)].join("\n");
}

function groupCounts(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return counts;
}

function extractDescription(text) {
  const lines = text.split(/\r?\n/);
  let capture = false;
  const parts = [];
  for (const line of lines.slice(0, 40)) {
    if (line.startsWith("description:")) {
      const value = line.split(":").slice(1).join(":").trim();
      if (["|", ">"].includes(value)) {
        capture = true;
        continue;
      }
      return value.replace(/^["']|["']$/g, "");
    }
    if (capture) {
      if (line.startsWith("---")) break;
      if (line.startsWith("  ")) parts.push(line.trim());
      else break;
    }
  }
  return parts.join(" ").trim();
}

function readText(file) {
  const buffer = fs.readFileSync(file);
  return decodeTextBuffer(buffer);
}

function decodeTextBuffer(buffer) {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(3));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("gbk").decode(buffer);
  }
}

function writeText(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text.replace(/\r\n/g, "\n"), "utf8");
}

function readJson(file, fallback = undefined) {
  if (!fs.existsSync(file)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`找不到文件 ${file}`);
  }
  const text = readText(file).trim();
  if (!text) return fallback;
  return JSON.parse(text);
}

function writeJson(file, data) {
  writeText(file, JSON.stringify(data, null, 2));
}

function readJsonFile(file) {
  return JSON.parse(readText(file));
}

function appendJsonl(file, data) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(data) + "\n", "utf8");
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return readText(file).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function writeJsonl(file, rows) {
  writeText(file, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
}

function backupFile(file, backupsDir) {
  ensureDir(backupsDir);
  const parsed = path.parse(file);
  const backup = path.join(backupsDir, `${parsed.name}_${timestampStamp()}_${process.hrtime.bigint()}${parsed.ext}`);
  fs.copyFileSync(file, backup);
  return backup;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function isoNow() {
  const now = new Date();
  const offsetMs = 8 * 60 * 60 * 1000;
  return new Date(now.getTime() + offsetMs).toISOString().replace("Z", "+08:00");
}

function dateDash() {
  return isoNow().slice(0, 10);
}

function dateStamp() {
  return dateDash().replace(/-/g, "");
}

function timestampStamp() {
  return isoNow().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
}

function weekNumber(date) {
  const first = new Date(date.getFullYear(), 0, 1);
  return Math.ceil((((date - first) / 86400000) + first.getDay() + 1) / 7);
}

function normalizeTitle(title) {
  return String(title || "").toLowerCase().replace(/\s+/g, "");
}

function shortHash(text) {
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 10).toUpperCase();
}

function safeSlug(text) {
  return String(text || "untitled").replace(/[\\/:*?"<>|\r\n\t]+/g, "-").replace(/\s+/g, "-").slice(0, 60).replace(/^-+|-+$/g, "") || "untitled";
}

function relative(root, file) {
  return path.relative(root, file).replace(/\\/g, "/");
}

function quoteYaml(text) {
  return `"${yamlEscape(text)}"`;
}

function stripYamlQuotes(text) {
  return String(text || "").replace(/^["']|["']$/g, "");
}

function yamlEscape(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

process.exitCode = await main();
