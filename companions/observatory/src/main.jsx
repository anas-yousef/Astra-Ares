import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  BarChart3,
  MessagesSquare,
  Database,
  RefreshCw,
  Download,
  Search,
  ArrowLeft,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Gauge,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import "./style.css";
const E = ["low", "medium", "high", "xhigh", "max", "ultra"];
const colors = {
  low: "#229c83",
  medium: "#418fca",
  high: "#dda632",
  xhigh: "#de7261",
  max: "#a463a6",
  ultra: "#52575b",
};
const names = {
  standard: "Astra Ares",
  economy: "Astra Ares Economy",
  legacy: "Legacy · alias unknown",
};
const n = (x) => Number(x || 0).toLocaleString();
const money = (x) => "$" + Number(x || 0).toFixed(4);
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + "%" : "—");
const bytes = (x) =>
  x > 1048576
    ? (x / 1048576).toFixed(1) + " MB"
    : (x / 1024).toFixed(1) + " KB";
function Stack({ counts }) {
  const total = E.reduce((s, e) => s + (counts[e] || 0), 0);
  return (
    <div className="stack">
      {E.map((e) => (
        <span
          key={e}
          title={`${e}: ${n(counts[e])}`}
          style={{
            width: total ? `${(counts[e] / total) * 100}%` : 0,
            background: colors[e],
          }}
        />
      ))}
    </div>
  );
}
function App() {
  const [view, setView] = useState("overview"),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [profile, setProfile] = useState("all"),
    [mode, setMode] = useState("steps"),
    [repo, setRepo] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [thread, setThread] = useState(""),
    [search, setSearch] = useState(""),
    [effort, setEffort] = useState(""),
    [refresh, setRefresh] = useState(0),
    [auto, setAuto] = useState(true),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState(null),
    [note, setNote] = useState(""),
    [outcome, setOutcome] = useState("unrated");
  const query = new URLSearchParams({
    profile,
    mode,
    repo,
    from,
    to,
    thread,
  }).toString();
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/report?" + query)
        .then((r) => {
          if (!r.ok) throw Error("Report unavailable");
          return r.json();
        })
        .then((d) => {
          if (alive) {
            setData(d);
            setError("");
          }
        })
        .catch((e) => alive && setError(e.message));
    load();
    const id = auto ? setInterval(load, 5000) : null;
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [query, refresh, auto]);
  useEffect(() => {
    setPage(0);
    setSelected(null);
  }, [query, effort, search]);
  useEffect(() => {
    const review = data?.chats.find((c) => c.id === thread)?.review;
    setOutcome(review?.outcome || "unrated");
    setNote(review?.note || "");
  }, [thread]);
  async function sync() {
    try {
      const r = await fetch("/api/sync", { method: "POST" });
      if (!r.ok) throw Error("Sync failed");
      setRefresh((x) => x + 1);
    } catch (e) {
      setError(e.message);
    }
  }
  async function save() {
    try {
      const r = await fetch("/api/reviews/" + thread, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, note }),
      });
      if (!r.ok) throw Error("Could not save review");
      setRefresh((x) => x + 1);
    } catch (e) {
      setError(e.message);
    }
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "jev-report.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  const rows = (data?.rows || []).filter(
    (r) =>
      (!effort || r.effort === effort) &&
      (!search ||
        [r.thread, r.generation, r.repo]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const total = data?.groups.reduce((s, g) => s + g.total, 0) || 0;
  const chats = data?.chats || [];
  const tokens = chats.reduce(
    (a, c) => ({
      input: a.input + c.input,
      cached: a.cached + c.cached,
      output: a.output + c.output,
    }),
    { input: 0, cached: 0, output: 0 },
  );
  return (
    <div className="app">
      <aside>
        <div className="brand">
          <Activity size={25} />
          <span>
            Jev<span className="subbrand">OBSERVATORY</span>
          </span>
        </div>
        <nav>
          {[
            ["overview", BarChart3, "Overview"],
            ["decisions", Activity, "Decisions"],
            ["chats", MessagesSquare, "Chats & outcomes"],
            ["storage", Database, "Data health"],
          ].map(([v, Icon, label]) => (
            <button
              key={v}
              className={view === v ? "active" : ""}
              onClick={() => setView(v)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <span className="live-dot" />
          Local collector<div>SQLite · private on this Mac</div>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <div className="eyebrow">ADAPTIVE REASONING / TELEMETRY</div>
            <h1>
              {thread
                ? "Chat investigation"
                : {
                    overview: "Reasoning, observed.",
                    decisions: "Decision explorer",
                    chats: "Chats & outcomes",
                    storage: "Data health",
                  }[view]}
            </h1>
          </div>
          <div className="actions">
            <label className="live">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => setAuto(e.target.checked)}
              />
              Live
            </label>
            <button
              className="icon"
              title="Refresh collector"
              aria-label="Refresh collector"
              onClick={sync}
            >
              <RefreshCw
                size={18}
                className={data?.status.busy ? "spin" : ""}
              />
            </button>
            <button
              className="icon"
              title="Export current report"
              aria-label="Export current report"
              disabled={!data}
              onClick={exportData}
            >
              <Download size={18} />
            </button>
          </div>
        </header>
        <div className="filters">
          <label>
            Profile
            <select
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
            >
              <option value="all">All profiles</option>
              {Object.entries(names).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Repository
            <select value={repo} onChange={(e) => setRepo(e.target.value)}>
              <option value="">All repositories</option>
              {data?.repos.map((r) => (
                <option key={r} value={r}>
                  {r.split("/").at(-1) || r}
                </option>
              ))}
            </select>
          </label>
          <label>
            From (UTC)
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            To (UTC)
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <div className="segmented">
            {[
              ["steps", "Applied steps"],
              ["fresh", "Fresh decisions"],
            ].map(([v, l]) => (
              <button
                className={mode === v ? "chosen" : ""}
                key={v}
                onClick={() => setMode(v)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <div role="alert" className="notice danger">
            {error}
            <button onClick={() => setRefresh((x) => x + 1)}>Retry</button>
          </div>
        )}
        {data?.status.error && (
          <div role="alert" className="notice danger">
            Collector: {data.status.error}
          </div>
        )}
        {thread && (
          <div className="threadbar">
            <button
              onClick={() => {
                setThread("");
                setView("chats");
              }}
            >
              <ArrowLeft size={16} />
              All chats
            </button>
            <code>{thread}</code>
            <a href={"codex://threads/" + thread} title="Open in Codex">
              <ExternalLink size={16} />
            </a>
          </div>
        )}
        {!data ? (
          <div className="empty">Loading telemetry…</div>
        ) : (
          <>
            {view === "overview" && (
              <>
                <section className="metrics">
                  <Metric
                    label={
                      mode === "fresh" ? "Fresh decisions" : "Confirmed steps"
                    }
                    value={n(total)}
                    detail={`${n(chats.length)} chats in selection`}
                  />
                  <Metric
                    label="Jev evaluator cost"
                    value={money(data.metrics.cost)}
                    detail="Separate from Astra consumption"
                  />
                  <Metric
                    label="Evaluator latency · p50"
                    value={n(Math.round(data.metrics.p50)) + " ms"}
                    detail={`p95 ${n(Math.round(data.metrics.p95))} ms`}
                  />
                  <Metric
                    label="Lease reuse"
                    value={pct(
                      data.metrics.steps - data.metrics.fresh,
                      data.metrics.steps,
                    )}
                    detail={`${n(data.metrics.steps - data.metrics.fresh)} steps without a new call`}
                  />
                </section>
                <section className="section">
                  <div className="section-title">
                    <h2>Effort distribution</h2>
                    <span>
                      {mode === "steps"
                        ? "Native-confirmed generations"
                        : "New evaluations · excludes lease reuse"}
                    </span>
                  </div>
                  <div className="legend">
                    {E.map((e) => (
                      <span key={e}>
                        <i style={{ background: colors[e] }} />
                        {e === "xhigh" ? "Extra high" : e}
                      </span>
                    ))}
                  </div>
                  <div className="profiles">
                    {data.groups.map((g) => (
                      <article className="profile" key={g.profile}>
                        <div className="profile-head">
                          <h3>{names[g.profile]}</h3>
                          <strong>
                            {n(g.total)}
                            <small>
                              {" "}
                              {mode === "steps" ? "steps" : "decisions"}
                            </small>
                          </strong>
                        </div>
                        <Stack counts={g} />
                        <div className="effort-grid">
                          {E.map((e) => (
                            <div key={e}>
                              <small>{e}</small>
                              <strong>{pct(g[e], g.total)}</strong>
                              <span>{n(g[e])}</span>
                            </div>
                          ))}
                        </div>
                        {g.profile === "economy" && (
                          <div className="policy">
                            <CheckCircle2 size={15} />
                            {n(g.violations)} max / ultra violations
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
                <section className="section">
                  <div className="section-title">
                    <h2>Effort over time</h2>
                    <span>
                      UTC ·{" "}
                      {mode === "steps" ? "applied steps" : "fresh decisions"}
                    </span>
                  </div>
                  <div
                    className="chart"
                    role="img"
                    aria-label="Stacked daily effort distribution"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.days}>
                        <CartesianGrid vertical={false} stroke="#e8ecec" />
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 12 }}
                          tickFormatter={(s) => s.slice(5)}
                        />
                        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                        <Tooltip />
                        {E.map((e) => (
                          <Bar
                            isAnimationActive={false}
                            key={e}
                            dataKey={e}
                            stackId="effort"
                            fill={colors[e]}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
                <section className="section">
                  <div className="section-title">
                    <h2>Consumption & evidence</h2>
                    <span>Matched chat/turn counters · partial coverage</span>
                  </div>
                  <div className="metrics compact">
                    <Metric
                      label="Astra input tokens"
                      value={n(tokens.input)}
                      detail={`${n(tokens.cached)} cached input`}
                    />
                    <Metric
                      label="Astra output tokens"
                      value={n(tokens.output)}
                      detail="Includes reasoning where reported"
                    />
                    <Metric
                      label="Reviewed chats"
                      value={n(
                        chats.filter(
                          (c) => c.review && c.review.outcome !== "unrated",
                        ).length,
                      )}
                      detail={`${n(chats.length)} chats in selection`}
                    />
                    <Metric
                      label="Savings verdict"
                      value="Not established"
                      detail="No matched fixed-effort baseline"
                    />
                  </div>
                  <div className="notice">
                    <Gauge size={18} />
                    <span>
                      Different workloads are not a controlled comparison.
                      Extra-high eligibility and quality require outcome review.
                      Token counters cover whole matched turns, not individual
                      effort steps; the first cumulative snapshot is excluded.
                    </span>
                  </div>
                </section>
              </>
            )}
            {(view === "decisions" || thread) && (
              <section className="section">
                <div className="section-title">
                  <h2>Decision ledger</h2>
                  <span>
                    {n(rows.length)} displayed / {n(data.rowCount)} matching ·
                    latest 2,000 available
                  </span>
                </div>
                <div className="table-tools">
                  <label className="search">
                    <Search size={16} />
                    <input
                      aria-label="Search decisions"
                      placeholder="Chat, repository, generation ID"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Filter effort"
                    value={effort}
                    onChange={(e) => setEffort(e.target.value)}
                  >
                    <option value="">Every effort</option>
                    {E.map((e) => (
                      <option key={e}>{e}</option>
                    ))}
                  </select>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Time (UTC)</th>
                        <th>Profile</th>
                        <th>Effort</th>
                        <th>Step</th>
                        <th>Source</th>
                        <th>Latency</th>
                        <th>Cost</th>
                        <th>Chat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(page * 30, (page + 1) * 30).map((r) => (
                        <tr
                          key={r.source + ":" + r.offset}
                          onClick={() => setSelected(r)}
                          tabIndex={0}
                          onKeyDown={(e) => e.key === "Enter" && setSelected(r)}
                        >
                          <td>{r.at.slice(5, 19).replace("T", " ")}</td>
                          <td>{names[r.profile]}</td>
                          <td>
                            <span
                              className="badge"
                              style={{
                                borderColor: colors[r.effort],
                                color: colors[r.effort],
                              }}
                            >
                              {r.effort}
                            </span>
                          </td>
                          <td>{r.step}</td>
                          <td>{r.reused ? "Lease reused" : "Fresh"}</td>
                          <td>{r.reused ? "—" : Math.round(r.ms) + " ms"}</td>
                          <td>{money(r.cost)}</td>
                          <td>
                            <code>{r.thread.slice(-8)}</code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!rows.length && (
                  <div className="empty">No decisions in this selection.</div>
                )}
                <div className="pagination">
                  <button
                    disabled={!page}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    {page + 1} / {Math.max(1, Math.ceil(rows.length / 30))}
                  </span>
                  <button
                    disabled={(page + 1) * 30 >= rows.length}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </section>
            )}
            {view === "chats" && !thread && (
              <section className="section">
                <div className="section-title">
                  <h2>Observed chats</h2>
                  <span>Outcome ratings are manual</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Repository / chat</th>
                        <th>Profile</th>
                        <th>Steps</th>
                        <th>Effort mix</th>
                        <th>Input / output</th>
                        <th>Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chats.map((c) => (
                        <tr
                          key={c.id}
                          onClick={() => {
                            setThread(c.id);
                            setView("decisions");
                          }}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              setThread(c.id);
                              setView("decisions");
                            }
                          }}
                        >
                          <td>
                            <strong>
                              {c.repo.split("/").at(-1) ||
                                "Unmatched repository"}
                            </strong>
                            <code className="block">{c.id}</code>
                          </td>
                          <td>{c.profiles.map((p) => names[p]).join(", ")}</td>
                          <td>{n(c.steps)}</td>
                          <td className="mixcell">
                            <Stack counts={c.efforts} />
                          </td>
                          <td>
                            {c.usageSamples
                              ? `${n(c.input)} / ${n(c.output)}`
                              : "Unavailable"}
                          </td>
                          <td>{c.review?.outcome || "unrated"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!chats.length && (
                  <div className="empty">No chats in this selection.</div>
                )}
              </section>
            )}
            {thread && (
              <section className="section">
                <h2>Outcome review</h2>
                <div className="review">
                  <select
                    aria-label="Chat outcome"
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                  >
                    <option value="unrated">Not rated</option>
                    <option value="pass">Successful</option>
                    <option value="rework">Needed rework</option>
                    <option value="failed">Failed</option>
                  </select>
                  <textarea
                    aria-label="Review notes"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Correctness, rework, extra-high justification…"
                    maxLength={4000}
                  />
                  <button className="primary" onClick={save}>
                    Save review
                  </button>
                </div>
              </section>
            )}
            {view === "storage" && (
              <>
                <section className="metrics">
                  <Metric
                    label="Jev source logs"
                    value={bytes(data.status.sourceBytes)}
                    detail={`${data.status.files} log files`}
                  />
                  <Metric
                    label="Metrics database"
                    value={bytes(data.status.dbBytes)}
                    detail="SQLite · original logs untouched"
                  />
                  <Metric
                    label="Last completed import"
                    value={
                      data.status.lastSync
                        ? new Date(data.status.lastSync).toLocaleTimeString()
                        : "Importing"
                    }
                    detail={
                      data.status.busy
                        ? "Collector running"
                        : "Checks every 30 seconds"
                    }
                  />
                  <Metric
                    label="Import parse errors"
                    value={n(data.status.malformed)}
                    detail="Current collector process"
                  />
                </section>
                <section className="section">
                  <h2>Storage policy</h2>
                  <dl>
                    <dt>Collected</dt>
                    <dd>
                      Efforts, probabilities, lease lengths, latency, costs,
                      IDs, repository paths, token counters, and your outcome
                      reviews.
                    </dd>
                    <dt>Excluded</dt>
                    <dd>
                      Prompts, responses, tool output, API keys, and raw error
                      messages.
                    </dd>
                    <dt>Retention</dt>
                    <dd>
                      Metrics retained indefinitely. No source logs are deleted.
                      Moving to a remote database requires a collector on this
                      Mac and a separate source-log retention policy.
                    </dd>
                    <dt>Coverage</dt>
                    <dd>
                      Only Codex session files matching observed Jev chat IDs
                      are scanned. Missing sessions remain unmatched. Legacy
                      model aliases remain unknown.
                    </dd>
                    <dt>Token attribution</dt>
                    <dd>
                      Positive changes in cumulative counters, matched by exact
                      chat and turn IDs. Mixed-profile turns can overlap across
                      profile filters. No per-effort token attribution or
                      inferred savings.
                    </dd>
                  </dl>
                </section>
                <section className="section">
                  <h2>Recent bridge errors · all time, all profiles</h2>
                  {data.errors.length ? (
                    data.errors.map((e, i) => (
                      <div className="error-row" key={i}>
                        <AlertCircle size={16} />
                        <time>{e.at}</time>
                        <strong>{e.type}</strong>
                        <code>{e.thread.slice(-8)}</code>
                      </div>
                    ))
                  ) : (
                    <div className="empty">No recorded bridge errors.</div>
                  )}
                </section>
              </>
            )}
            <footer>
              <span className="live-dot" />
              {data.status.busy ? "Importing telemetry" : "Local telemetry"}
              <span>
                Last sync{" "}
                {data.status.lastSync
                  ? new Date(data.status.lastSync).toLocaleString()
                  : "pending"}
              </span>
              <span>Jev Observatory</span>
            </footer>
          </>
        )}
        {selected && (
          <div className="overlay" onClick={() => setSelected(null)}>
            <section
              className="dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Decision details"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="section-title">
                <h2>Decision · step {selected.step}</h2>
                <button onClick={() => setSelected(null)}>Close</button>
              </div>
              <dl>
                {[
                  ["Profile", names[selected.profile]],
                  ["Effort", selected.effort],
                  ["Previous effort", selected.previous],
                  ["Lease", selected.lease + " steps"],
                  [
                    "Native confirmation",
                    selected.confirmed ? "Confirmed" : "Missing",
                  ],
                  ["New tool failures", selected.failures],
                  [
                    "OpenRouter generation",
                    selected.generation || "Unavailable",
                  ],
                  ["Chat", selected.thread],
                  ["Turn", selected.turn],
                ].map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt>{k}</dt>
                    <dd>{String(v)}</dd>
                  </React.Fragment>
                ))}
              </dl>
              <h3>Jev choice probabilities</h3>
              <pre>
                {JSON.stringify(JSON.parse(selected.probabilities), null, 2)}
              </pre>
              <button
                className="primary"
                onClick={() => {
                  setThread(selected.thread);
                  setView("decisions");
                  setSelected(null);
                }}
              >
                Investigate chat
              </button>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
function Metric({ label, value, detail }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
