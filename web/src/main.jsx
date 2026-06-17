import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Inbox,
  PackageCheck,
  RefreshCw,
  Search,
  XCircle
} from "lucide-react";
import "./styles.css";

const ACTIONS = [
  { id: "accept", label: "采纳", icon: CheckCircle2 },
  { id: "snooze", label: "稍后", icon: Clock3 },
  { id: "reject", label: "拒绝", icon: XCircle },
  { id: "needs_more", label: "补资料", icon: Search }
];

const STATUS_LABELS = {
  pending_review: "待审核",
  accepted_pending_batch: "待建批次",
  snoozed: "稍后",
  rejected: "已拒绝",
  needs_more: "需补资料",
  batched: "已入批次"
};

function App() {
  const [triage, setTriage] = useState(null);
  const [status, setStatus] = useState(null);
  const [selectedDate, setSelectedDate] = useState("latest");
  const [scope, setScope] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function load(date = selectedDate, nextScope = scope) {
    setBusy("refresh");
    try {
      const params = new URLSearchParams({ date, scope: nextScope });
      const [triageRes, statusRes] = await Promise.all([
        fetch(`/api/triage?${params.toString()}`),
        fetch("/api/status")
      ]);
      const triageJson = await triageRes.json();
      const statusJson = await statusRes.json();
      if (!triageRes.ok) throw new Error(triageJson.error || "读取候选失败");
      setTriage(triageJson);
      setStatus(statusJson);
      setSelectedDate(triageJson.selected_date || "latest");
      setScope(triageJson.scope || nextScope);
      const nextSelected = triageJson.candidates.find((candidate) => candidate.id === selectedId)
        || triageJson.candidates[0]
        || null;
      setSelectedId(nextSelected?.id || null);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    load("latest", "all");
  }, []);

  const candidates = triage?.candidates || [];
  const filteredCandidates = useMemo(() => {
    if (filter === "all") return candidates;
    return candidates.filter((candidate) => candidate.triage_status === filter);
  }, [candidates, filter]);
  const selected = candidates.find((candidate) => candidate.id === selectedId) || filteredCandidates[0] || null;
  const acceptedPending = candidates.filter((candidate) => candidate.triage_status === "accepted_pending_batch");

  useEffect(() => {
    setReason(selected?.triage_reason || "");
  }, [selected?.id]);

  async function decide(action) {
    if (!selected) return;
    setBusy(action);
    setMessage("");
    try {
      const res = await fetch(`/api/triage/${encodeURIComponent(selected.id)}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "写入决策失败");
      setMessage(`${selected.title}：${ACTIONS.find((item) => item.id === action)?.label || action}`);
      await load(selectedDate, scope);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  }

  async function createBatch() {
    setBusy("batch");
    setMessage("");
    try {
      const res = await fetch("/api/triage/batch", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "创建批次失败");
      setMessage(`已创建 ${data.batch.batch_id}，共 ${data.batch.total_count} 个选题`);
      await load(selectedDate, scope);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="app-shell">
      <aside className="inbox-panel">
        <HeaderBlock triage={triage} busy={busy} onRefresh={() => load(selectedDate, scope)} />
        <div className="toolbar">
          <select
            value={scope}
            onChange={(event) => {
              const nextScope = event.target.value;
              setScope(nextScope);
              load(selectedDate, nextScope);
            }}
            aria-label="候选范围"
          >
            <option value="all">全部候选池</option>
            <option value="date">按日期</option>
          </select>
          <select
            value={selectedDate}
            onChange={(event) => {
              setSelectedDate(event.target.value);
              load(event.target.value, scope);
            }}
            aria-label="候选日期"
          >
            {(triage?.available_dates || []).map((date) => (
              <option key={date} value={date}>{date}</option>
            ))}
          </select>
          <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="状态过滤">
            <option value="all">全部</option>
            <option value="pending_review">待审核</option>
            <option value="accepted_pending_batch">待建批次</option>
            <option value="needs_more">需补资料</option>
            <option value="snoozed">稍后</option>
            <option value="rejected">已拒绝</option>
            <option value="batched">已入批次</option>
          </select>
        </div>
        <CandidateList
          candidates={filteredCandidates}
          totalCount={candidates.length}
          scope={scope}
          selectedId={selected?.id}
          onSelect={setSelectedId}
        />
      </aside>

      <section className="detail-panel">
        {selected ? <CandidateDetail candidate={selected} /> : <EmptyState />}
      </section>

      <aside className="decision-panel">
        <div className="status-strip">
          <div>
            <span>Active</span>
            <strong>{status?.active_batch?.batch_id || "暂无批次"}</strong>
          </div>
          <div>
            <span>Pending</span>
            <strong>{acceptedPending.length}</strong>
          </div>
        </div>

        <section className="decision-box">
          <div className="section-title">
            <Inbox size={16} />
            <span>{selected ? STATUS_LABELS[selected.triage_status] || selected.triage_status : "待选择"}</span>
          </div>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="判断理由、补资料要求或栏目修正"
          />
          <div className="action-grid">
            {ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  className={`action-button ${action.id}`}
                  onClick={() => decide(action.id)}
                  disabled={!selected || Boolean(busy)}
                >
                  <Icon size={17} />
                  <span>{busy === action.id ? "写入中" : action.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="tray">
          <div className="section-title">
            <PackageCheck size={16} />
            <span>已采纳托盘</span>
          </div>
          <div className="tray-count">
            <strong>{acceptedPending.length}</strong>
            <span>个待建批次</span>
          </div>
          <button className="batch-button" onClick={createBatch} disabled={!acceptedPending.length || Boolean(busy)}>
            <Archive size={17} />
            <span>{busy === "batch" ? "创建中" : "创建批次"}</span>
          </button>
          <div className="tray-list">
            {acceptedPending.slice(0, 5).map((candidate) => (
              <button key={candidate.id} onClick={() => setSelectedId(candidate.id)}>
                {candidate.title}
              </button>
            ))}
          </div>
        </section>

        {message ? <div className="message">{message}</div> : null}
      </aside>
    </main>
  );
}

function HeaderBlock({ triage, busy, onRefresh }) {
  return (
    <header className="header-block">
      <div>
        <p>Topic Agent</p>
        <h1>Triage</h1>
      </div>
      <button className="icon-button" onClick={onRefresh} disabled={busy === "refresh"} aria-label="刷新">
        <RefreshCw size={18} />
      </button>
      <div className="metric-row">
        <Metric label="候选" value={triage?.count ?? 0} />
        <Metric label="待建批次" value={triage?.accepted_pending_count ?? 0} />
      </div>
    </header>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CandidateList({ candidates, totalCount, scope, selectedId, onSelect }) {
  if (!candidates.length) return <div className="empty-list">没有候选</div>;
  return (
    <>
      <div className="list-summary">
        <span>显示 {candidates.length} / {totalCount} 条</span>
        <span>{scope === "all" ? "历史 + 最新" : "当前日期"}</span>
      </div>
      <div className="candidate-list">
        {candidates.map((candidate) => (
          <button
            key={candidate.id}
            className={`candidate-row ${candidate.id === selectedId ? "active" : ""}`}
            onClick={() => onSelect(candidate.id)}
          >
            <span className={`status-dot ${candidate.triage_status}`} />
            <span className="candidate-copy">
              <strong>{candidate.title}</strong>
              <small>{candidate.column} / {candidate.source_names?.join(" / ") || "unknown"}</small>
            </span>
            <span className="score">{candidate.total_score ?? "-"}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function CandidateDetail({ candidate }) {
  const scores = Object.entries(candidate.scores || {});
  return (
    <article className="candidate-detail">
      <div className="detail-kicker">
        <span>{candidate.content_type}</span>
        <span>{candidate.column}</span>
        <span>{STATUS_LABELS[candidate.triage_status] || candidate.triage_status}</span>
      </div>
      <h2>{candidate.title}</h2>
      <p className="viewpoint">{candidate.core_viewpoint}</p>

      <div className="detail-grid">
        <InfoBlock title="推荐理由" value={candidate.recommended_reason} />
        <InfoBlock title="不确定点" value={candidate.uncertainty} tone="warning" />
      </div>

      <section className="source-section">
        <h3>来源</h3>
        <div className="source-list">
          {(candidate.initial_links || []).length ? candidate.initial_links.map((link) => (
            <a key={link} href={link.startsWith("http") ? link : "#"} target="_blank" rel="noreferrer">
              <ExternalLink size={14} />
              <span>{link}</span>
            </a>
          )) : <span className="muted">暂无初步链接</span>}
        </div>
      </section>

      <section className="score-section">
        <h3>评分</h3>
        <div className="score-grid">
          {scores.map(([key, value]) => (
            <div key={key} className="score-item">
              <span>{scoreLabel(key)}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

function InfoBlock({ title, value, tone }) {
  return (
    <div className={`info-block ${tone || ""}`}>
      <span>{tone === "warning" ? <AlertTriangle size={14} /> : null}{title}</span>
      <p>{value}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <Inbox size={28} />
      <span>暂无候选</span>
    </div>
  );
}

function scoreLabel(key) {
  return {
    spread_potential: "传播",
    info_gap: "信息差",
    enterprise_ai_relevance: "企业 AI",
    case_value: "案例",
    convertibility: "转化",
    evidence_availability: "证据",
    freshness: "新鲜度",
    novelty: "新意",
    preference_fit: "偏好"
  }[key] || key;
}

createRoot(document.getElementById("root")).render(<App />);
