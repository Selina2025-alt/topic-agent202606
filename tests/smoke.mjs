import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFile, execFileSync, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repoRoot, "bin", "topic-agent.mjs");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "topic-agent-smoke-"));
const execFileAsync = promisify(execFile);

for (const relativePath of [
  "LICENSE",
  "INSTALL.md",
  "CONFIG_EXAMPLE.md",
  ".env.example",
  ".github/workflows/ci.yml",
  "examples/sample_topic_library.csv",
  "examples/mock_data/candidates.json",
  "examples/mock_data/arxiv_feed.xml",
  "examples/mock_project/knowledge_base.md",
  "skills/long-content-deep-summary/SKILL.md",
  "skills/long-content-deep-summary/references/deep-summary-prompt.md",
  "skills/long-content-deep-summary/agents/openai.yaml"
]) {
  assert.ok(fs.existsSync(path.join(repoRoot, relativePath)), `${relativePath} should exist`);
}
const longSummarySkill = fs.readFileSync(path.join(repoRoot, "skills", "long-content-deep-summary", "SKILL.md"), "utf8");
assert.ok(longSummarySkill.includes("name: long-content-deep-summary"));
assert.ok(longSummarySkill.includes("references/deep-summary-prompt.md"));
const ciWorkflow = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
assert.ok(ciWorkflow.includes("npm test"));
assert.ok(ciWorkflow.includes("npm run web:build"));
assert.ok(ciWorkflow.includes("node bin/topic-agent.mjs doctor"));
assert.ok(ciWorkflow.includes("node bin/topic-agent.mjs release check"));
assert.ok(ciWorkflow.includes("node bin/topic-agent.mjs acceptance"));
const repoDoctor = JSON.parse(execFileSync("node", [cli, "doctor"], { cwd: repoRoot, encoding: "utf8" }));
assert.equal(repoDoctor.ok, true);
const repoRelease = JSON.parse(execFileSync("node", [cli, "release", "check"], { cwd: repoRoot, encoding: "utf8" }));
assert.equal(repoRelease.ok, true);
assert.ok(fs.existsSync(repoRelease.report_path));

function run(args) {
  const output = execFileSync("node", [cli, "--root", root, ...args], { encoding: "utf8" });
  return JSON.parse(output);
}

function runAt(targetRoot, args) {
  const output = execFileSync("node", [cli, "--root", targetRoot, ...args], { encoding: "utf8" });
  return JSON.parse(output);
}

async function runAsync(args) {
  const { stdout } = await execFileAsync("node", [cli, "--root", root, ...args], { encoding: "utf8" });
  return JSON.parse(stdout);
}

async function startWebServer(targetRoot) {
  const child = spawn("node", [cli, "--root", targetRoot, "web", "--port", "0"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`web server did not start: ${stderr}`));
    }, 15000);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`web server exited early with ${code}: ${stderr}`));
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const start = stdout.indexOf("{");
      const end = stdout.indexOf("\n}", start);
      if (start >= 0 && end >= 0) {
        clearTimeout(timer);
        child.removeAllListeners("exit");
        const info = JSON.parse(stdout.slice(start, end + 2));
        resolve({ child, info });
      }
    });
  });
}

async function stopWebServer(child) {
  if (!child || child.killed) return;
  child.kill();
  await new Promise((resolve) => child.once("exit", resolve));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  return { response, data };
}

function countOccurrences(text, pattern) {
  return String(text).split(pattern).length - 1;
}

fs.mkdirSync(path.join(root, "skills", "demo-skill"), { recursive: true });
fs.writeFileSync(
  path.join(root, "skills", "demo-skill", "SKILL.md"),
  '---\nname: demo-skill\ndescription: "AI 选题研究测试 skill"\n---\n',
  "utf8"
);

const init = run(["init"]);
assert.ok(fs.existsSync(init.library));
assert.ok(fs.readFileSync(init.library, "utf8").split(/\r?\n/)[0].includes("分数"));
assert.ok(fs.existsSync(path.join(root, "_topic_agent", "config", "skill_routes.yml")));
assert.ok(fs.existsSync(path.join(root, "_topic_agent", "config", "external_tools.yml")));
assert.ok(fs.existsSync(path.join(root, "_topic_agent", "state", "topic_index.json")));
assert.ok(fs.existsSync(path.join(root, "_topic_agent", "state", "project_index.json")));
assert.ok(fs.readFileSync(path.join(root, "_topic_agent", "config", "column_rules.yml"), "utf8").includes("keywords:"));

const audit = run(["skills", "audit"]);
assert.ok(audit.skills.includes("demo-skill"));
const initialStatus = run(["status"]);
assert.equal(initialStatus.library.valid, true);
assert.equal(initialStatus.next_action.command, "node bin/topic-agent.mjs run daily --dry-run");

const gbkRoot = fs.mkdtempSync(path.join(os.tmpdir(), "topic-agent-gbk-"));
runAt(gbkRoot, ["init"]);
const gbkCsvBase64 = "0PK6xSzEuNGhzOJJRCzEuNGhzOIswLTUtCzE2sjdwODQzSzAuMS/z7XB0CzRoczit73P8i+6y9DEudu14yy52MGqyMi148G0vdMvzPvX0yy0tL2oyrG85CzKx7fx0aHM4g0KMSwsR0JLseDC69GhzOIsbWFudWFsLNDQ0rW2tLLsLMbz0rUgQUkgsLjA/SxHQksgQ1NWINOmuMPE3LG7tsHIoSxodHRwczovL2V4YW1wbGUuY29tL2diaywyMDI2LTA2LTE2LA0K";
fs.writeFileSync(path.join(gbkRoot, "data", "topic_library.csv"), Buffer.from(gbkCsvBase64, "base64"));
const gbkValidation = runAt(gbkRoot, ["library", "validate"]);
assert.equal(gbkValidation.valid, true);
assert.equal(gbkValidation.rows, 1);
assert.ok(gbkValidation.fieldnames.includes("母选题"));
const gbkCandidatePath = path.join(gbkRoot, "gbk-candidate.json");
fs.writeFileSync(gbkCandidatePath, JSON.stringify([{ title: "GBK 追加选题", source_names: ["manual"], core_viewpoint: "GBK 读入后仍可安全追加。" }]), "utf8");
const gbkAppend = runAt(gbkRoot, ["library", "append", "--input", gbkCandidatePath]);
assert.equal(gbkAppend.appended_count, 1);
assert.ok(fs.readFileSync(path.join(gbkRoot, "data", "topic_library.csv"), "utf8").includes("GBK 追加选题"));

const repairRoot = fs.mkdtempSync(path.join(os.tmpdir(), "topic-agent-repair-"));
runAt(repairRoot, ["init"]);
const repairTitle = "历史 CSV 清洗测试选题";
fs.writeFileSync(
  path.join(repairRoot, "data", "topic_library.csv"),
  "\uFEFF序号,母选题ID,母选题,来源,内容类型,栏目系列,选题方向/核心观点,关联热点链接/帖子,创建时间,是否选题\r\n"
    + `1,,${repairTitle},huashu-info-search,行业洞察,行业洞察,旧行核心观点,"skills/huashu-info-search/SKILL.md\nskills/hv-analysis/SKILL.md\n\n[深研来源]\nS001 搜索：https://example.com/source",2026-06-01,TRUE\r\n`,
  "utf8"
);
fs.mkdirSync(path.join(repairRoot, "_topic_agent", "daily"), { recursive: true });
fs.writeFileSync(
  path.join(repairRoot, "_topic_agent", "daily", "topic_candidates_2026-06-24.json"),
  JSON.stringify({ candidates: [{ id: "TC-REPAIR", title: repairTitle, total_score: 31.2, dedupe_key: repairTitle }] }),
  "utf8"
);
const repairResult = runAt(repairRoot, ["library", "repair"]);
assert.equal(repairResult.fields_updated, true);
assert.equal(repairResult.moved_skill_sources, 2);
assert.equal(repairResult.score_backfilled, 1);
assert.equal(repairResult.recent_links_backfilled, 1);
const repairedCsv = fs.readFileSync(path.join(repairRoot, "data", "topic_library.csv"), "utf8");
assert.ok(repairedCsv.split(/\r?\n/)[0].includes("分数"));
assert.ok(repairedCsv.includes("huashu-info-search / hv-analysis"));
assert.ok(repairedCsv.includes("https://example.com/source"));
assert.ok(repairedCsv.includes("https://www.google.com/search"));
assert.ok(repairedCsv.includes("https://news.google.com/search"));
assert.ok(repairedCsv.includes("31.2"));
assert.ok(!repairedCsv.includes("skills/"));
assert.ok(fs.readdirSync(path.join(repairRoot, "_topic_agent", "backups")).some((name) => name.endsWith(".csv")));

const xlsxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "topic-agent-xlsx-"));
runAt(xlsxRoot, ["init"]);
runAt(xlsxRoot, ["run", "daily", "--count", "2"]);
const formattedLibrary = runAt(xlsxRoot, ["library", "format"]);
assert.ok(fs.existsSync(formattedLibrary.xlsx_path));
assert.ok("score_backfilled" in formattedLibrary);
const xlsxBook = new ExcelJS.Workbook();
await xlsxBook.xlsx.readFile(formattedLibrary.xlsx_path);
const xlsxSheet = xlsxBook.getWorksheet("选题库");
assert.ok(xlsxSheet);
assert.ok(xlsxSheet.getColumn("C").width >= 30);
assert.equal(xlsxSheet.getCell("J2").value, "☐");
assert.equal(xlsxSheet.getCell("J2").dataValidation.type, "list");
assert.equal(xlsxSheet.getCell("K1").value, "分数");
assert.equal(xlsxSheet.getCell("K2").numFmt, "0.0");
assert.equal(typeof xlsxSheet.getCell("K2").value, "number");
assert.equal(xlsxSheet.getCell("C2").alignment.wrapText, true);
assert.match(String(xlsxSheet.getCell("I2").value), /^\d{4}-\d{2}-\d{2}$/);
xlsxSheet.getCell("J2").value = "☑";
await xlsxBook.xlsx.writeFile(formattedLibrary.xlsx_path);
const syncedXlsx = runAt(xlsxRoot, ["library", "sync-xlsx"]);
assert.deepEqual(syncedXlsx.selected_rows, [1]);
const selectedBatch = runAt(xlsxRoot, ["batch", "create", "--selected"]);
assert.equal(selectedBatch.items.length, 1);
assert.equal(selectedBatch.items[0].row_number, 1);
const xlsxCsvRows = fs.readFileSync(path.join(xlsxRoot, "data", "topic_library.csv"), "utf8");
assert.ok(xlsxCsvRows.includes("TRUE"));
assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(xlsxCsvRows));
assert.ok(xlsxCsvRows.split(/\r?\n/)[0].includes("分数"));
assert.ok(!xlsxCsvRows.includes("skills/"));

const triageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "topic-agent-triage-"));
runAt(triageRoot, ["init"]);
runAt(triageRoot, ["run", "daily", "--dry-run", "--count", "3"]);
const libraryOnlyTitle = "历史库里的 AI 选题复盘方法";
runAt(triageRoot, [
  "intake", "manual",
  "--title", libraryOnlyTitle,
  "--summary", "这是一条只写入选题库、不存在于最新每日候选 JSON 的历史候选。",
  "--source", "manual-history",
  "--write"
]);
const webServer = await startWebServer(triageRoot);
try {
  const baseUrl = webServer.info.web_url;
  const triageInitial = await fetchJson(`${baseUrl}/api/triage`);
  assert.equal(triageInitial.response.status, 200);
  assert.equal(triageInitial.data.scope, "all");
  assert.ok(triageInitial.data.candidates.length >= 3);
  const libraryOnlyCandidate = triageInitial.data.candidates.find((candidate) => candidate.title === libraryOnlyTitle);
  assert.ok(libraryOnlyCandidate);
  const triageDateOnly = await fetchJson(`${baseUrl}/api/triage?scope=date`);
  assert.equal(triageDateOnly.response.status, 200);
  assert.equal(triageDateOnly.data.scope, "date");
  assert.ok(!triageDateOnly.data.candidates.some((candidate) => candidate.title === libraryOnlyTitle));
  const [firstCandidate, secondCandidate, thirdCandidate] = triageInitial.data.candidates;

  const acceptResult = await fetchJson(`${baseUrl}/api/triage/${encodeURIComponent(firstCandidate.id)}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "accept", reason: "适合进入本周选题" })
  });
  assert.equal(acceptResult.response.status, 200);
  assert.equal(acceptResult.data.decision.status, "accepted_pending_batch");
  const acceptedRowNumber = acceptResult.data.decision.row_number;
  assert.ok(acceptedRowNumber >= 1);
  const rowsAfterAccept = fs.readFileSync(path.join(triageRoot, "data", "topic_library.csv"), "utf8");
  assert.ok(rowsAfterAccept.includes(firstCandidate.title));
  assert.ok(rowsAfterAccept.includes("TRUE"));
  const titleCountAfterAccept = countOccurrences(rowsAfterAccept, firstCandidate.title);

  const acceptAgain = await fetchJson(`${baseUrl}/api/triage/${encodeURIComponent(firstCandidate.id)}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "accept", reason: "重复采纳不应重复入库" })
  });
  assert.equal(acceptAgain.response.status, 200);
  const rowsAfterRepeatAccept = fs.readFileSync(path.join(triageRoot, "data", "topic_library.csv"), "utf8");
  assert.equal(countOccurrences(rowsAfterRepeatAccept, firstCandidate.title), titleCountAfterAccept);

  const rejectResult = await fetchJson(`${baseUrl}/api/triage/${encodeURIComponent(secondCandidate.id)}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "reject", reason: "来源太弱" })
  });
  assert.equal(rejectResult.response.status, 200);
  assert.equal(rejectResult.data.decision.status, "rejected");

  const needsMoreResult = await fetchJson(`${baseUrl}/api/triage/${encodeURIComponent(thirdCandidate.id)}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "needs_more", reason: "需要官方案例支撑" })
  });
  assert.equal(needsMoreResult.response.status, 200);
  assert.equal(needsMoreResult.data.decision.status, "needs_more");

  const decisions = JSON.parse(fs.readFileSync(path.join(triageRoot, "_topic_agent", "state", "triage_decisions.json"), "utf8"));
  assert.equal(decisions.decisions.length, 3);
  const feedbackRows = fs.readFileSync(path.join(triageRoot, "_topic_agent", "state", "feedback_log.jsonl"), "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.ok(feedbackRows.some((row) => row.target_type === "candidate" && row.sentiment === "positive"));
  assert.ok(feedbackRows.some((row) => row.target_type === "candidate" && row.sentiment === "negative"));
  assert.ok(feedbackRows.some((row) => row.target_type === "candidate" && row.sentiment === "neutral"));

  const batchResult = await fetchJson(`${baseUrl}/api/triage/batch`, { method: "POST" });
  assert.equal(batchResult.response.status, 200);
  assert.equal(batchResult.data.batch.total_count, 1);
  assert.equal(batchResult.data.batch.items[0].row_number, acceptedRowNumber);
  const afterBatch = JSON.parse(fs.readFileSync(path.join(triageRoot, "_topic_agent", "state", "triage_decisions.json"), "utf8"));
  assert.equal(afterBatch.decisions.find((row) => row.candidate_id === firstCandidate.id).status, "batched");

  const emptyBatch = await fetchJson(`${baseUrl}/api/triage/batch`, { method: "POST" });
  assert.equal(emptyBatch.response.status, 400);
} finally {
  await stopWebServer(webServer.child);
}

const aliasRoot = fs.mkdtempSync(path.join(os.tmpdir(), "topic-agent-alias-"));
runAt(aliasRoot, ["init"]);
const aliasFeedback = runAt(aliasRoot, [
  "feedback", "add",
  "--type", "source_negative",
  "--source", "S001",
  "--text", "这个来源太泛"
]);
assert.equal(aliasFeedback.target_type, "source");
assert.equal(aliasFeedback.target_id, "S001");
assert.equal(aliasFeedback.sentiment, "negative");

fs.appendFileSync(path.join(root, "_topic_agent", "config", "strategy_rules.yml"), [
  "",
  "- rule_id: RULE-STRATEGY-TEST",
  "  scope: topic",
  "  pattern: \"官方客户案例\"",
  "  action: prefer",
  "  weight_delta: 0.4",
  "  enabled: true",
  ""
].join("\n"), "utf8");

fs.appendFileSync(path.join(root, "_topic_agent", "config", "source_rules.yml"), [
  "",
  "- rule_id: RULE-SOURCE-TEST",
  "  scope: source",
  "  pattern: \"官方客户案例原文\"",
  "  action: prefer",
  "  weight_delta: 0.2",
  "  enabled: true",
  ""
].join("\n"), "utf8");

for (let i = 0; i < 3; i += 1) {
  const dry = run(["run", "daily", "--dry-run"]);
  assert.equal(dry.written_count, 0);
}

const dailyFile = fs.readdirSync(path.join(root, "_topic_agent", "daily")).find((name) => name.startsWith("daily_delivery_"));
const dailyDelivery = fs.readFileSync(path.join(root, "_topic_agent", "daily", dailyFile), "utf8");
assert.ok(dailyDelivery.includes("RULE-STRATEGY-TEST"));
const dailyRawSignalsPath = path.join(root, "_topic_agent", "daily", dailyFile.replace("daily_delivery_", "raw_signals_").replace(".md", ".json"));
const dailyCandidatesPath = path.join(root, "_topic_agent", "daily", dailyFile.replace("daily_delivery_", "topic_candidates_").replace(".md", ".json"));
const dailyCandidateStatePath = path.join(root, "_topic_agent", "daily", dailyFile.replace("daily_delivery_", "candidate_state_log_").replace(".md", ".json"));
assert.ok(fs.existsSync(dailyRawSignalsPath));
assert.ok(fs.existsSync(dailyCandidatesPath));
assert.ok(fs.existsSync(dailyCandidateStatePath));
const dailyRawSignals = JSON.parse(fs.readFileSync(dailyRawSignalsPath, "utf8"));
const dailyCandidates = JSON.parse(fs.readFileSync(dailyCandidatesPath, "utf8"));
const dailyCandidateState = JSON.parse(fs.readFileSync(dailyCandidateStatePath, "utf8"));
assert.ok(dailyRawSignals.raw_signals.some((signal) => signal.source_id === "demo-skill"));
assert.ok(dailyRawSignals.source_breakdown.skill >= 1);
assert.ok(dailyCandidates.candidates.length >= 50);
assert.ok(dailyCandidates.candidates[0].source_ids.length > 0);
assert.equal(new Set(dailyCandidates.candidates.map((candidate) => candidate.dedupe_key)).size, dailyCandidates.candidates.length);
assert.ok(!dailyCandidates.candidates.some((candidate) => candidate.title.includes("如果把") && candidate.title.includes("写给老板")));
assert.ok(!dailyCandidates.candidates.some((candidate) => (candidate.initial_links || []).some((link) => String(link).includes("skills/"))));
assert.ok(dailyCandidates.candidates.every((candidate) => (candidate.initial_links || []).some((link) => /^https?:\/\//.test(String(link)))));
assert.ok(dailyCandidates.candidates.every((candidate) => (candidate.initial_links || []).some((link) => /google\.com\/search|news\.google\.com|youtube\.com\/results|hn\.algolia|arxiv\.org\/search/.test(String(link)))));
const dailyStatuses = new Set(dailyCandidateState.events.map((event) => event.status));
for (const expectedStatus of ["raw_signal_collected", "candidate_generated", "candidate_scored", "candidate_deduped", "candidate_ready_for_library"]) {
  assert.ok(dailyStatuses.has(expectedStatus), `daily candidate state should include ${expectedStatus}`);
}
const historyLines = fs.readFileSync(path.join(root, "_topic_agent", "state", "run_history.jsonl"), "utf8").trim().split(/\r?\n/);
const latestHistory = JSON.parse(historyLines.at(-1));
assert.ok(latestHistory.raw_signals_path);
assert.ok(latestHistory.candidates_path);
assert.ok(latestHistory.candidate_state_log_path);

const server = http.createServer((req, res) => {
  res.setHeader("content-type", "application/rss+xml; charset=utf-8");
  res.end(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>测试 RSS</title>
<item><title>企业 AI 官方客户案例新进展</title><link>https://example.com/rss-case</link><description>一个用于测试 RSS intake 的企业 AI 客户案例。</description></item>
</channel></rss>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const rssUrl = `http://127.0.0.1:${server.address().port}/feed.xml`;
const rss = await runAsync(["intake", "rss", "--url", rssUrl, "--limit", "1"]);
assert.equal(rss.candidate_count, 1);
assert.equal(rss.written_count, 0);
assert.ok(rss.candidate_state_event_count >= 5);
await new Promise((resolve) => server.close(resolve));

const manualPreview = run([
  "intake", "manual",
  "--title", "企业 AI 手动输入预览",
  "--url", "https://example.com/manual-preview",
  "--summary", "用户手动输入的候选信号，先预览不入库。"
]);
assert.equal(manualPreview.written_count, 0);
assert.equal(manualPreview.raw_signal.source_type, "manual");
assert.ok(manualPreview.candidate_state_event_count >= 5);
const localIntakeFile = path.join(root, "local-intake.md");
fs.writeFileSync(localIntakeFile, [
  "# 本地 Markdown 素材选题",
  "",
  "这份本地素材记录了一个企业 AI 工作流案例，适合转成后续深研候选。"
].join("\n"), "utf8");
const filePreview = run(["intake", "file", "--file", localIntakeFile]);
assert.equal(filePreview.written_count, 0);
assert.equal(filePreview.raw_signal.source_type, "local_file");
assert.ok(filePreview.raw_signal.raw_text_path.endsWith("local-intake.md"));
assert.equal(filePreview.candidate.title, "本地 Markdown 素材选题");
const hotlistFile = path.join(root, "manual-hotlist.txt");
fs.writeFileSync(hotlistFile, [
  "企业 AI 预算审批新变化 | https://example.com/hot-1 | 有明确业务场景",
  "AI Agent 客户成功团队案例 | https://example.com/hot-2 | 值得后续找官方来源"
].join("\n"), "utf8");
const hotlistPreview = run(["intake", "hotlist", "--input", hotlistFile, "--limit", "2"]);
assert.equal(hotlistPreview.written_count, 0);
assert.equal(hotlistPreview.item_count, 2);
assert.equal(hotlistPreview.candidate_count, 2);
assert.ok(hotlistPreview.candidates.some((candidate) => candidate.initial_links.includes("https://example.com/hot-1")));
const stateLogLines = fs.readFileSync(path.join(root, "_topic_agent", "state", "candidate_state_log.jsonl"), "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
assert.ok(stateLogLines.some((event) => event.run_type === "rss" && event.status === "raw_signal_collected"));
assert.ok(stateLogLines.some((event) => event.run_type === "manual" && event.status === "candidate_ready_for_library"));
assert.ok(stateLogLines.some((event) => event.run_type === "file" && event.status === "candidate_ready_for_library"));
assert.ok(stateLogLines.some((event) => event.run_type === "hotlist" && event.status === "candidate_ready_for_library"));
assert.ok(fs.existsSync(path.join(root, "_topic_agent", "state", "raw_signals.jsonl")));

const daily = run(["run", "daily"]);
assert.equal(daily.candidate_count, 50);
assert.equal(daily.written_count, 50);
let topicIndex = JSON.parse(fs.readFileSync(path.join(root, "_topic_agent", "state", "topic_index.json"), "utf8"));
assert.ok(Object.keys(topicIndex.topics).length >= 8);
assert.ok(Object.values(topicIndex.topics).some((entry) => entry.status === "library_written" && entry.internal_topic_key));

const manualWrite = run([
  "intake", "manual",
  "--title", "企业 AI 手动输入案例值得跟进",
  "--url", "https://example.com/manual-case",
  "--summary", "这个手动输入案例包含企业 AI 客户场景和可追踪链接。",
  "--source", "manual-chat",
  "--write"
]);
assert.equal(manualWrite.written_count, 1);
assert.equal(manualWrite.candidate.source_names[0], "manual-chat");

for (let i = 0; i < 3; i += 1) {
  const candidatePath = path.join(root, `candidate-${i}.json`);
  fs.writeFileSync(candidatePath, JSON.stringify([
    {
      title: `手动测试选题 ${i}`,
      source_names: ["manual"],
      content_type: "行业洞察",
      core_viewpoint: `测试 CSV 连续写入 ${i}`,
      initial_links: [`https://example.com/${i}`]
    }
  ]), "utf8");
  const appended = run(["library", "append", "--input", candidatePath]);
  assert.equal(appended.appended_count, 1);
}

const validation = run(["library", "validate"]);
assert.equal(validation.valid, true);
assert.equal(validation.rows, daily.written_count + manualWrite.written_count + 3);

let batch = run(["batch", "create", "--rows", "1,2"]);
assert.equal(batch.items.length, 2);
assert.equal(batch.items.filter((item) => item.status === "active").length, 1);
const originalActiveProject = batch.active_project_id;
batch = run(["batch", "reorder", "--batch", batch.batch_id, "--rows", "2,1"]);
assert.equal(batch.items[0].row_number, 2);
assert.equal(batch.items[0].status, "active");
assert.equal(batch.items[1].row_number, 1);
assert.equal(batch.items[1].status, "queued");
assert.notEqual(batch.active_project_id, originalActiveProject);
const activeStatus = run(["status"]);
assert.equal(activeStatus.active_batch.batch_id, batch.batch_id);
assert.equal(activeStatus.active_project.project_id, batch.active_project_id);
assert.ok(activeStatus.active_project.artifacts.some((artifact) => artifact.key === "directions" && artifact.exists));
assert.ok(activeStatus.next_action.command.includes("directions confirm"));

const project1 = batch.active_project_id;
topicIndex = JSON.parse(fs.readFileSync(path.join(root, "_topic_agent", "state", "topic_index.json"), "utf8"));
assert.ok(Object.values(topicIndex.topics).some((entry) => entry.project_id === project1 && entry.project_dir));
assert.ok(topicIndex.topics["topic-row-000002"].project_id === project1);
const projectIndex = JSON.parse(fs.readFileSync(path.join(root, "_topic_agent", "state", "project_index.json"), "utf8"));
assert.equal(projectIndex.projects[project1].internal_topic_key, "topic-row-000002");
const explicitProjectStatus = run(["status", "--project", project1]);
assert.equal(explicitProjectStatus.active_project.project_id, project1);
const directions1 = fs.readFileSync(path.join(root, "_topic_agent", "projects", project1, "directions.md"), "utf8");
assert.equal((directions1.match(/^## 方向/gm) || []).length, 5);
run(["directions", "generate", "--project", project1, "--force"]);
let archiveFiles = fs.readdirSync(path.join(root, "_topic_agent", "projects", project1, "archive"));
assert.ok(archiveFiles.some((name) => name.endsWith("_directions.md")));

run(["directions", "confirm", "--project", project1, "--direction", "D2"]);
run(["directions", "confirm", "--project", project1, "--direction", "D1"]);
archiveFiles = fs.readdirSync(path.join(root, "_topic_agent", "projects", project1, "archive"));
assert.ok(archiveFiles.some((name) => name.endsWith("_selected_direction.md")));
run(["research", "plan", "--project", project1]);
run(["research", "plan", "--project", project1]);
archiveFiles = fs.readdirSync(path.join(root, "_topic_agent", "projects", project1, "archive"));
assert.ok(archiveFiles.some((name) => name.endsWith("_research_plan.md")));
const localSource = path.join(root, "official-case.md");
fs.writeFileSync(localSource, [
  "# 官方客户案例",
  "",
  "Acme 公司把企业 AI Agent 接入审批流程后，客服团队每周节省 120 小时，并把重复工单处理时间降低 35%。",
  "这个案例来自官方客户故事，包含业务场景、结果指标和落地边界。"
].join("\n"), "utf8");
const collected = run([
  "research", "collect",
  "--project", project1,
  "--file", localSource,
  "--title", "Acme 官方客户案例",
  "--type", "official_blog",
  "--tier", "S",
  "--status", "accepted",
  "--notes", "官方客户案例原文"
]);
assert.ok(collected.sources.some((source) => source.source_id === "S001" && source.extracted_text_path));
const officialDocsFile = path.join(root, "official-docs.md");
fs.writeFileSync(officialDocsFile, "官方产品文档说明该 Agent 工作流支持审计日志和人工确认节点。", "utf8");
const officialDocs = run([
  "research", "collect",
  "--project", project1,
  "--file", officialDocsFile,
  "--title", "官方产品文档",
  "--type", "official_docs",
  "--status", "accepted"
]);
assert.equal(officialDocs.sources.find((source) => source.title === "官方产品文档").source_tier, "S");
const summaryPrompt = run(["research", "summary-prompt", "--project", project1, "--source", "S001"]);
assert.ok(fs.existsSync(summaryPrompt.prompt_path));
assert.ok(fs.readFileSync(summaryPrompt.prompt_path, "utf8").includes("$long-content-deep-summary"));
fs.writeFileSync(summaryPrompt.recommended_output_path, [
  "# Acme 官方客户案例 综合总结",
  "",
  "### 核心论点",
  "",
  "深度摘要指出 Acme 的关键价值不只是节省 120 小时，而是把 AI Agent 放进可复核的审批流程。"
].join("\n"), "utf8");
const attachedSummary = run(["research", "attach-summary", "--project", project1, "--source", "S001"]);
assert.ok(attachedSummary.summary_length > 20);
assert.ok(attachedSummary.source.metadata.deep_summary_path.includes("S001.md"));
assert.ok(attachedSummary.source.metadata.deep_summary_attached_at);
const cSourceFile = path.join(root, "secondary-summary.md");
fs.writeFileSync(cSourceFile, [
  "# C 级二手总结",
  "",
  "C 级资料声称这个案例还有很多未经核验的转述细节，但没有给出原始出处。"
].join("\n"), "utf8");
const cSource = run([
  "research", "collect",
  "--project", project1,
  "--file", cSourceFile,
  "--title", "C 级二手总结",
  "--type", "secondary_summary",
  "--tier", "C",
  "--status", "accepted"
]);
const cSourceId = cSource.sources.find((source) => source.title === "C 级二手总结").source_id;
const unverifiableFile = path.join(root, "unverifiable.md");
fs.writeFileSync(unverifiableFile, "这是一段没有明确出处、没有发布日期、无法验证的截图转述。", "utf8");
const unverifiableTitle = "无法验证截图";
const unverifiableSource = run([
  "research", "collect",
  "--project", project1,
  "--file", unverifiableFile,
  "--title", unverifiableTitle,
  "--type", "unverifiable"
]);
const unverifiableItem = unverifiableSource.sources.find((source) => source.title === unverifiableTitle);
assert.equal(unverifiableItem.source_tier, "D");
assert.equal(unverifiableItem.status, "rejected");
const youtubeCollected = run([
  "research", "collect",
  "--project", project1,
  "--url", "https://youtu.be/dQw4w9WgXcQ",
  "--type", "youtube",
  "--tier", "A",
  "--status", "pending",
  "--no-extract"
]);
assert.ok(youtubeCollected.sources.some((source) => source.type === "youtube" && source.url.includes("youtu.be")));

const arxivServer = http.createServer((req, res) => {
  res.setHeader("content-type", "application/atom+xml; charset=utf-8");
  res.end(`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>https://arxiv.org/abs/2601.01234v1</id>
    <updated>2026-01-03T00:00:00Z</updated>
    <published>2026-01-02T00:00:00Z</published>
    <title>Retrieval-Augmented Agents for Enterprise Workflows</title>
    <summary>We study agent memory, tool use, and evidence grounding for enterprise AI workflows. The paper reports controlled experiments and deployment constraints.</summary>
    <author><name>Ada Researcher</name></author>
    <category term="cs.AI" />
    <link href="https://arxiv.org/abs/2601.01234v1" rel="alternate" type="text/html" />
    <link title="pdf" href="https://arxiv.org/pdf/2601.01234v1" rel="related" type="application/pdf" />
  </entry>
</feed>`);
});
await new Promise((resolve) => arxivServer.listen(0, "127.0.0.1", resolve));
const arxivUrl = `http://127.0.0.1:${arxivServer.address().port}/api/query`;
const arxiv = await runAsync([
  "research", "arxiv",
  "--project", project1,
  "--query", "agent memory",
  "--limit", "1",
  "--status", "accepted",
  "--api-url", arxivUrl
]);
await new Promise((resolve) => arxivServer.close(resolve));
assert.equal(arxiv.added_count, 1);
assert.equal(arxiv.added_sources[0].type, "paper");
assert.ok(arxiv.added_sources[0].metadata.arxiv_id.includes("2601.01234"));
const paperSummary = fs.readFileSync(path.join(root, "_topic_agent", "projects", project1, arxiv.added_sources[0].extracted_text_path), "utf8");
assert.ok(paperSummary.includes("Retrieval-Augmented Agents"));

const quality1 = fs.readFileSync(path.join(root, "_topic_agent", "projects", project1, "source_quality.md"), "utf8");
assert.ok(quality1.includes("RULE-SOURCE-TEST"));
assert.ok(quality1.includes("| paper | 1 |"));
const sourceIndex1 = fs.readFileSync(path.join(root, "_topic_agent", "projects", project1, "source_index.md"), "utf8");
assert.ok(sourceIndex1.includes("已登记深度摘要"));
const kbBuild1 = run(["research", "build-kb", "--project", project1]);
assert.ok(fs.existsSync(kbBuild1.evidence_items_path));
const evidenceItems1 = JSON.parse(fs.readFileSync(kbBuild1.evidence_items_path, "utf8"));
assert.ok(evidenceItems1.length >= 2);
assert.ok(evidenceItems1.every((item) => item.evidence_id && item.project_id === project1));
assert.ok(evidenceItems1.every((item) => item.claim && Array.isArray(item.source_ids) && item.source_ids.length));
assert.ok(evidenceItems1.every((item) => ["fact", "data", "case", "quote", "theory", "counterpoint"].includes(item.evidence_type)));
assert.ok(evidenceItems1.every((item) => ["strong", "medium", "weak"].includes(item.strength)));
const localEvidence1 = evidenceItems1.find((item) => item.source_ids.includes("S001"));
assert.equal(localEvidence1.strength, "medium");
assert.ok(localEvidence1.notes.includes("trace_complete=false"));
const cEvidence1 = evidenceItems1.find((item) => item.source_ids.includes(cSourceId));
assert.equal(cEvidence1.strength, "weak");
const arxivEvidence1 = evidenceItems1.find((item) => item.source_ids.includes(arxiv.added_sources[0].source_id));
assert.equal(arxivEvidence1.evidence_type, "theory");
assert.equal(arxivEvidence1.strength, "strong");
assert.ok(arxivEvidence1.notes.includes("trace_complete=true"));
run(["library", "backfill-links", "--project", project1]);
const libraryAfterBackfill = fs.readFileSync(path.join(root, "data", "topic_library.csv"), "utf8");
assert.ok(libraryAfterBackfill.includes("https://arxiv.org/abs/2601.01234v1"));
assert.ok(!libraryAfterBackfill.includes("S001 "));
assert.ok(!libraryAfterBackfill.includes(unverifiableTitle));
let project1State = JSON.parse(fs.readFileSync(path.join(root, "_topic_agent", "projects", project1, "project.yml"), "utf8"));
assert.equal(project1State.status, "project_completed");
run(["research", "build-kb", "--project", project1]);
project1State = JSON.parse(fs.readFileSync(path.join(root, "_topic_agent", "projects", project1, "project.yml"), "utf8"));
assert.equal(project1State.status, "project_completed");
archiveFiles = fs.readdirSync(path.join(root, "_topic_agent", "projects", project1, "archive"));
assert.ok(archiveFiles.some((name) => name.endsWith("_knowledge_base.md")));
const kb1 = fs.readFileSync(path.join(root, "_topic_agent", "projects", project1, "knowledge_base.md"), "utf8");
assert.ok(kb1.includes("深度摘要指出 Acme 的关键价值"));
assert.ok(kb1.includes("Retrieval-Augmented Agents"));
const coreFacts1 = kb1.split("## 3. 核心事实")[1].split("## 4. 关键案例")[0];
assert.ok(!coreFacts1.includes(`[${cSourceId}]`));
const evidenceMap1 = fs.readFileSync(path.join(root, "_topic_agent", "projects", project1, "evidence_map.md"), "utf8");
assert.ok(evidenceMap1.includes("Structured Evidence Items"));
let status = run(["batch", "status", "--batch", batch.batch_id]);
assert.equal(status.items[0].status, "completed");
assert.equal(status.items[1].status, "active");

const project2 = status.active_project_id;
run(["directions", "confirm", "--project", project2, "--direction", "D4"]);
run(["research", "run", "--project", project2]);
run(["research", "update-source", "--project", project2, "--source", "S001", "--status", "rejected", "--tier", "D", "--notes", "搜索结果太泛"]);
const rejectedSourcesPath = path.join(root, "_topic_agent", "projects", project2, "rejected_sources.md");
assert.ok(fs.existsSync(rejectedSourcesPath));
const rejectedSourcesText = fs.readFileSync(rejectedSourcesPath, "utf8");
assert.ok(rejectedSourcesText.includes("S001"));
assert.ok(rejectedSourcesText.includes("D 级来源默认进入 rejected_sources"));
const project2Kb = fs.readFileSync(path.join(root, "_topic_agent", "projects", project2, "knowledge_base.md"), "utf8");
assert.ok(!project2Kb.includes("[S001]"));
const project2Evidence = JSON.parse(fs.readFileSync(path.join(root, "_topic_agent", "projects", project2, "evidence_items.json"), "utf8"));
assert.ok(!project2Evidence.some((item) => item.source_ids.includes("S001")));
status = run(["batch", "status", "--batch", batch.batch_id]);
assert.equal(status.status, "completed");
const batchSummary = run(["batch", "summary", "--batch", batch.batch_id]);
const batchSummaryPath = batchSummary.summary_path;
assert.ok(fs.existsSync(batchSummaryPath));
const batchSummaryText = fs.readFileSync(batchSummaryPath, "utf8");
assert.ok(batchSummaryText.includes("回填来源"));
assert.ok(batchSummaryText.includes("S001"));
assert.ok(batchSummaryText.includes("结构化证据"));
assert.ok(batchSummaryText.includes("本批次暴露出的策略问题"));
assert.ok(batchSummaryText.includes("可写入反馈学习模块的规则建议"));
assert.ok(batchSummaryText.includes("feedback add"));
const completedStatus = run(["status"]);
assert.equal(completedStatus.active_batch.status, "completed");
assert.equal(completedStatus.next_action.command, "node bin/topic-agent.mjs review weekly");

let failedBatch = run(["batch", "create", "--rows", "3,4"]);
failedBatch = run(["batch", "fail-current", "--batch", failedBatch.batch_id, "--reason", "测试失败路径一"]);
assert.equal(failedBatch.items[0].status, "failed_with_report");
assert.equal(failedBatch.items[1].status, "active");
failedBatch = run(["batch", "fail-current", "--batch", failedBatch.batch_id, "--reason", "测试失败路径二"]);
assert.equal(failedBatch.status, "completed_with_errors");
const failedSummary = fs.readFileSync(path.join(root, "_topic_agent", "state", "batches", `${failedBatch.batch_id}_summary.md`), "utf8");
assert.ok(failedSummary.includes("失败原因"));
assert.ok(failedSummary.includes("failure_report.md"));
assert.ok(failedSummary.includes("可记录失败原因"));

let skippedBatch = run(["batch", "create", "--rows", "5,6"]);
skippedBatch = run(["batch", "skip-current", "--batch", skippedBatch.batch_id, "--reason", "暂不适合本周栏目"]);
assert.equal(skippedBatch.items[0].status, "skipped_by_user");
assert.equal(skippedBatch.items[0].skip_reason, "暂不适合本周栏目");
skippedBatch = run(["batch", "skip-current", "--batch", skippedBatch.batch_id, "--reason", "资料窗口不够明确"]);
assert.equal(skippedBatch.status, "completed");
const skippedSummary = fs.readFileSync(path.join(root, "_topic_agent", "state", "batches", `${skippedBatch.batch_id}_summary.md`), "utf8");
assert.ok(skippedSummary.includes("跳过原因"));
assert.ok(skippedSummary.includes("暂不适合本周栏目"));
assert.ok(skippedSummary.includes("可记录跳过原因"));

const sourceFeedback = run(["feedback", "add", "--project", project1, "--target", "source:S001", "--sentiment", "negative", "--text", "这个来源太泛"]);
assert.equal(sourceFeedback.project_id, project1);
let feedbackProjectState = JSON.parse(fs.readFileSync(path.join(root, "_topic_agent", "projects", project1, "project.yml"), "utf8"));
assert.equal(feedbackProjectState.status, "feedback_collected");
const projectFeedbackPath = path.join(root, "_topic_agent", "projects", project1, "feedback.md");
assert.ok(fs.existsSync(projectFeedbackPath));
let projectFeedbackText = fs.readFileSync(projectFeedbackPath, "utf8");
assert.ok(projectFeedbackText.includes("Project Feedback"));
assert.ok(projectFeedbackText.includes("FB-001"));
assert.ok(projectFeedbackText.includes("Applied to rules: false"));
run([
  "feedback", "add",
  "--target", "column:工作流",
  "--sentiment", "positive",
  "--text", "工作流类选题应该放 JovaAI 真实场景",
  "--column", "JovaAI 真实场景",
  "--pattern", "工作流"
]);
run([
  "feedback", "add",
  "--project", project1,
  "--target", "direction:D1",
  "--sentiment", "positive",
  "--text", "老板视角这种方向更容易被采纳",
  "--pattern", "老板视角"
]);
const learning = run(["learn", "apply"]);
assert.equal(learning.applied_count, 3);
feedbackProjectState = JSON.parse(fs.readFileSync(path.join(root, "_topic_agent", "projects", project1, "project.yml"), "utf8"));
assert.equal(feedbackProjectState.status, "learning_applied");
projectFeedbackText = fs.readFileSync(projectFeedbackPath, "utf8");
assert.ok(projectFeedbackText.includes("Learning applied for FB-001"));
assert.ok(projectFeedbackText.includes("Learning applied for FB-003"));
const learnedProjectStatus = run(["status", "--project", project1]);
assert.equal(learnedProjectStatus.active_project.feedback.total, 2);
assert.equal(learnedProjectStatus.active_project.feedback.applied_to_rules, 2);
assert.ok(learnedProjectStatus.active_project.artifacts.some((artifact) => artifact.key === "feedback" && artifact.exists));
const feedbackSync = run(["feedback", "sync"]);
assert.ok(feedbackSync.synced_projects.some((project) => project.project_id === project1 && project.status === "learning_applied"));
projectFeedbackText = fs.readFileSync(projectFeedbackPath, "utf8");
assert.ok(projectFeedbackText.includes("Applied to rules: true"));
const sourceRules = run(["rules", "list", "--type", "source"]);
assert.ok(sourceRules.rules.some((rule) => rule.rule_id === "RULE-FB-001" && rule.enabled === true));
const columnRules = run(["rules", "list", "--type", "column"]);
assert.ok(columnRules.rules.some((rule) => rule.rule_id === "RULE-FB-002" && rule.column === "JovaAI 真实场景"));
const strategyRules = run(["rules", "list", "--type", "strategy"]);
assert.ok(strategyRules.rules.some((rule) => rule.rule_id === "RULE-FB-003" && rule.scope === "direction" && rule.pattern === "老板视角"));
const columnCandidatePath = path.join(root, "candidate-column.json");
fs.writeFileSync(columnCandidatePath, JSON.stringify([
  {
    title: "企业 AI 工作流栏目反馈测试",
    source_names: ["manual"],
    content_type: "行业洞察",
    core_viewpoint: "工作流类选题应进入用户指定栏目。",
    initial_links: ["https://example.com/column"]
  }
]), "utf8");
const columnAppend = run(["library", "append", "--input", columnCandidatePath]);
assert.equal(columnAppend.appended[0]["栏目系列"], "JovaAI 真实场景");
const directionCandidate = run([
  "intake", "manual",
  "--title", "老板视角看企业 AI 投入回报",
  "--summary", "老板视角的企业 AI 选题，测试 direction 反馈规则是否参与评分。"
]);
assert.ok(directionCandidate.candidate.applied_rules.some((rule) => rule.rule_id === "RULE-FB-003"));
const disabledRule = run(["rules", "disable", "--type", "source", "--rule", "RULE-FB-001"]);
assert.equal(disabledRule.enabled, false);
const enabledRule = run(["rules", "enable", "--type", "source", "--rule", "RULE-FB-001"]);
assert.equal(enabledRule.enabled, true);
const rolledBackRule = run(["rules", "rollback", "--type", "source", "--rule", "RULE-FB-001"]);
assert.equal(rolledBackRule.action, "rollback");
const sourceRulesAfterRollback = run(["rules", "list", "--type", "source"]);
assert.ok(!sourceRulesAfterRollback.rules.some((rule) => rule.rule_id === "RULE-FB-001"));

const review = run(["review", "weekly"]);
assert.ok(fs.existsSync(review.review_path));
const reviewText = fs.readFileSync(review.review_path, "utf8");
assert.ok(reviewText.includes("用户确认项目"));
assert.ok(reviewText.includes("方向采纳率："));
assert.ok(reviewText.includes("强证据覆盖率："));
assert.ok(reviewText.includes("链接回填完成率："));
assert.ok(reviewText.includes("返工次数："));
assert.ok(reviewText.includes("栏目匹配修正率："));
assert.ok(!reviewText.includes("待方向反馈接入后统计"));
assert.ok(reviewText.includes("高质量来源"));
assert.ok(reviewText.includes("低质量来源"));
const acceptance = run(["acceptance"]);
assert.equal(acceptance.ok, true);
assert.equal(acceptance.passed_count, acceptance.total_count);
assert.ok(fs.existsSync(acceptance.report_path));
const acceptanceText = fs.readFileSync(acceptance.report_path, "utf8");
assert.ok(acceptanceText.includes("Topic Agent PRD Acceptance Report"));
assert.ok(acceptanceText.includes("基础验收"));
assert.ok(acceptanceText.includes("反馈学习验收"));
assert.ok(acceptanceText.includes("分发验收"));

const csv = fs.readFileSync(path.join(root, "data", "topic_library.csv"), "utf8");
assert.ok(csv.includes("母选题ID"));
assert.ok(csv.includes("https://arxiv.org/abs/2601.01234v1"));

console.log(JSON.stringify({ ok: true, root }, null, 2));
