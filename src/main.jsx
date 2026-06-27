import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const configuredApiUrl = (import.meta.env.VITE_API_URL || "").trim();
const API_URL =
  configuredApiUrl
    ? configuredApiUrl.replace(/\/$/, "")
    : window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? `${window.location.protocol}//${window.location.hostname}:5050`
      : "";
const LIVE_RESULT_STATUS_TYPES = new Set(["inprogress", "pause", "interrupted"]);
const FR_TIME_ZONE = "Europe/Paris";
const MATCH_DAY_START_HOUR = 6;

function App() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [matches, setMatches] = useState([]);
  const [scoringRules, setScoringRules] = useState({});
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [participantPredictions, setParticipantPredictions] = useState([]);
  const [participantScore, setParticipantScore] = useState({ total_points: 0, rows: [] });
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sofascoreStatus, setSofascoreStatus] = useState(null);
  const [leaderboardMode, setLeaderboardMode] = useState("all");
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem("cdm_admin_token") || "");
  const [adminUser, setAdminUser] = useState(() => localStorage.getItem("cdm_admin_user") || "");
  const currentPath = window.location.pathname;
  const isAdminPage = currentPath === "/admin" || currentPath === "/test";
  const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

  async function refresh() {
    await fetch(`${API_URL}/api/results/refresh`, { method: "POST" }).catch(() => null);
    const [leaderboardRes, participantsRes, matchesRes, scoringRes] = await Promise.all([
      fetch(`${API_URL}/api/leaderboard`),
      fetch(`${API_URL}/api/participants`),
      fetch(`${API_URL}/api/matches`),
      fetch(`${API_URL}/api/scoring`),
    ]);
    setLeaderboard(await leaderboardRes.json());
    setParticipants(await participantsRes.json());
    setMatches(await matchesRes.json());
    setScoringRules(await scoringRes.json());
  }

  useEffect(() => {
    if (window.location.pathname === "/test") {
      window.history.replaceState(null, "", "/admin");
    }
    refresh().catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!adminToken) return;
    fetch(`${API_URL}/api/admin/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }).then((response) => {
      if (!response.ok) {
        logoutAdmin();
      }
    });
  }, [adminToken]);

  function authHeaders() {
    return adminToken ? { Authorization: `Bearer ${adminToken}` } : {};
  }

  async function loginAdmin(username, password) {
    await runAction(async () => {
      const response = await fetch(`${API_URL}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (response.ok) {
        const payload = await response.json();
        localStorage.setItem("cdm_admin_token", payload.token);
        localStorage.setItem("cdm_admin_user", payload.username);
        setAdminToken(payload.token);
        setAdminUser(payload.username);
      }
      return response;
    }, "Connecté.");
  }

  function logoutAdmin() {
    localStorage.removeItem("cdm_admin_token");
    localStorage.removeItem("cdm_admin_user");
    setAdminToken("");
    setAdminUser("");
  }

  async function runAction(action, success) {
    setBusy(true);
    setMessage("");
    try {
      const response = await action();
      if (response && !response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Action impossible.");
      }
      await refresh();
      setMessage(success);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function importXlsx(event) {
    event.preventDefault();
    if (!name.trim() || !file) {
      setMessage("Nom et fichier XLSX obligatoires.");
      return;
    }
    await runAction(async () => {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("file", file);
      const response = await fetch(`${API_URL}/api/import`, {
        method: "POST",
        headers: authHeaders(),
        body: formData,
      });
      if (response.ok) {
        setName("");
        setFile(null);
        event.target.reset();
      }
      return response;
    }, "Fichier importé.");
  }

  async function openParticipant(row) {
    setSelectedParticipant(row);
    setParticipantPredictions([]);
    setParticipantScore({ total_points: 0, rows: [] });
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/api/score-preview/${row.id}`);
      if (!response.ok) throw new Error("Impossible de charger les pronostics.");
      const payload = await response.json();
      setParticipantScore(payload);
      setParticipantPredictions(payload.rows || []);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteParticipant(row) {
    if (!window.confirm(`Supprimer ${row.name} ?`)) return;
    await runAction(
      () =>
        fetch(`${API_URL}/api/participants/${row.id}`, {
          method: "DELETE",
          headers: authHeaders(),
        }),
      "Participant supprimé.",
    );
    if (selectedParticipant?.id === row.id) {
      setSelectedParticipant(null);
    }
  }

  async function updateParticipantSubset(row, enabled) {
    await runAction(
      () =>
        fetch(`${API_URL}/api/participants/${row.id}/subset`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ enabled }),
        }),
      enabled ? "Participant ajouté à Famille." : "Participant retiré de Famille.",
    );
  }

  async function testSofascore() {
    setBusy(true);
    setMessage("");
    setSofascoreStatus(null);
    try {
      const response = await fetch(`${API_URL}/api/admin/sofascore/test`, {
        method: "POST",
        headers: authHeaders(),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Test SofaScore impossible.");
      }
      setSofascoreStatus(payload);
      setMessage(payload.ok ? "SofaScore répond correctement." : "SofaScore répond partiellement.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  const completedMatches = useMemo(
    () => matches.filter((match) => match.result_home_goals !== null).length,
    [matches],
  );

  return (
    <div className="page-frame">
      <aside className="side-panel side-panel-left" aria-hidden="true">
        <div className="side-stars">
          <span>★</span>
          <span>★</span>
        </div>
      </aside>

      <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span className="ball">26</span>
          </div>
          <div>
          <h1>CDM 2026</h1>
          <p>{isAdminPage ? "Administration locale" : "Pronostics, résultats et classement"}</p>
          </div>
        </div>
        <nav className="nav">
          <a className={!isAdminPage ? "active" : ""} href="/">
            Classement
          </a>
          <a className={isAdminPage ? "active" : ""} href="/admin">
            Admin
          </a>
        </nav>
        <div className="stats">
          <Stat label="Participants" value={participants.length} />
          <Stat label="Matchs joués" value={`${completedMatches}/${matches.length}`} />
        </div>
      </header>

      {message && <p className="message">{message}</p>}

      {isAdminPage ? (
        <AdminPage
          adminToken={adminToken}
          adminUser={adminUser}
          busy={busy}
          file={file}
          importXlsx={importXlsx}
          isLocalhost={isLocalhost}
          leaderboard={leaderboard}
          loginAdmin={loginAdmin}
          logoutAdmin={logoutAdmin}
          matches={matches}
          name={name}
          openParticipant={openParticipant}
          deleteParticipant={deleteParticipant}
          leaderboardMode={leaderboardMode}
          runAction={runAction}
          setFile={setFile}
          setLeaderboardMode={setLeaderboardMode}
          setName={setName}
          sofascoreStatus={sofascoreStatus}
          testSofascore={testSofascore}
          updateParticipantSubset={updateParticipantSubset}
          authHeaders={authHeaders}
        />
      ) : (
        <HomePage
          leaderboard={leaderboard}
          leaderboardMode={leaderboardMode}
          matches={matches}
          openParticipant={openParticipant}
          setLeaderboardMode={setLeaderboardMode}
        />
      )}

      {selectedParticipant && (
        <ParticipantPanel
          participant={selectedParticipant}
          predictions={participantPredictions}
          matches={matches}
          scoringRules={scoringRules}
          totalPoints={participantScore.total_points}
          editable={isAdminPage && Boolean(adminToken)}
          authHeaders={authHeaders}
          onClose={() => setSelectedParticipant(null)}
          onSaved={() => openParticipant(selectedParticipant).then(refresh)}
        />
      )}
      </main>

      <aside className="side-panel side-panel-right" aria-hidden="true">
        <img className="side-rooster" src="/assets/rooster-gold.svg" alt="" />
      </aside>
    </div>
  );
}

function HomePage({ leaderboard, leaderboardMode, matches, openParticipant, setLeaderboardMode }) {
  return (
    <>
      <LeaderboardPanel
        leaderboard={leaderboard}
        leaderboardMode={leaderboardMode}
        openParticipant={openParticipant}
        setLeaderboardMode={setLeaderboardMode}
      />

      <MatchesPanel matches={matches} />
    </>
  );
}

function AdminPage({
  adminToken,
  adminUser,
  authHeaders,
  busy,
  importXlsx,
  isLocalhost,
  leaderboard,
  leaderboardMode,
  loginAdmin,
  logoutAdmin,
  matches,
  name,
  openParticipant,
  deleteParticipant,
  runAction,
  setLeaderboardMode,
  setFile,
  setName,
  sofascoreStatus,
  testSofascore,
  updateParticipantSubset,
}) {
  if (!adminToken) {
    return <LoginPanel busy={busy} loginAdmin={loginAdmin} />;
  }

  return (
    <>
      <section className="panel admin-strip">
        <div>
          <h2>Admin</h2>
          <p>Connecté en tant que {adminUser}</p>
        </div>
        <button className="secondary" onClick={logoutAdmin}>
          Déconnexion
        </button>
      </section>

      <section className="panel">
        <h2>Importer un fichier</h2>
        <form onSubmit={importXlsx} className="form">
          <label>
            Nom
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Fichier XLSX
            <input
              type="file"
              accept=".xlsx"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>
          <button disabled={busy}>Importer</button>
        </form>
      </section>

      {isLocalhost && <TestPage authHeaders={authHeaders} busy={busy} runAction={runAction} />}
      <SofascorePanel busy={busy} status={sofascoreStatus} testSofascore={testSofascore} />
      <PointsHistoryPanel authHeaders={authHeaders} />
      <LeaderboardPanel
        leaderboard={leaderboard}
        leaderboardMode={leaderboardMode}
        openParticipant={openParticipant}
        deleteParticipant={deleteParticipant}
        setLeaderboardMode={setLeaderboardMode}
        updateParticipantSubset={updateParticipantSubset}
        editable
      />
      <MatchesPanel authHeaders={authHeaders} editable matches={matches} runAction={runAction} />
    </>
  );
}

function PointsHistoryPanel({ authHeaders }) {
  const [history, setHistory] = useState({ days: [], series: [] });
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [hiddenSeriesIds, setHiddenSeriesIds] = useState([]);
  const visibleSeries = history.series.filter((row) => !hiddenSeriesIds.includes(row.id));

  function toggleSeries(seriesId) {
    setHiddenSeriesIds((current) =>
      current.includes(seriesId)
        ? current.filter((id) => id !== seriesId)
        : [...current, seriesId],
    );
  }

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError("");
    fetch(`${API_URL}/api/admin/points-history`, {
      headers: authHeaders(),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Historique impossible à charger.");
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        setHistory({
          days: payload.days || [],
          series: payload.series || [],
        });
        setHiddenSeriesIds([]);
        setStatus("ready");
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setError(fetchError.message);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="panel points-history-panel">
      <div className="panel-head">
        <div>
          <h2>Évolution des points</h2>
          <p>
            Cumul jour par jour pour tous les participants du classement affiché.
          </p>
        </div>
      </div>

      {status === "loading" && <p className="empty">Chargement de l'historique.</p>}
      {status === "error" && <p className="empty">{error}</p>}
      {status === "ready" && history.days.length === 0 && (
        <p className="empty">Aucun résultat daté pour construire l'historique.</p>
      )}
      {status === "ready" && history.days.length > 0 && (
        <PointsHistoryChart
          days={history.days}
          series={visibleSeries}
          allSeries={history.series}
          hiddenSeriesIds={hiddenSeriesIds}
          onToggleSeries={toggleSeries}
        />
      )}
    </section>
  );
}

function PointsHistoryChart({ days, series, allSeries, hiddenSeriesIds, onToggleSeries }) {
  const width = 760;
  const height = 300;
  const padding = { top: 18, right: 84, bottom: 36, left: 42 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxPoints = Math.max(1, ...series.flatMap((row) => row.points || [0]));
  const ticks = Array.from({ length: 5 }, (_, index) => Math.round((maxPoints * index) / 4));
  const colors = ["#f2c14e", "#55d684", "#7fb3ff", "#ff7a90", "#c59cff", "#70e1d4", "#ffb26b", "#d5e55c"];

  function pointX(index) {
    if (days.length <= 1) return padding.left + plotWidth / 2;
    return padding.left + (index / (days.length - 1)) * plotWidth;
  }

  function pointY(value) {
    return padding.top + plotHeight - (Number(value || 0) / maxPoints) * plotHeight;
  }

  function linePath(points) {
    return points
      .map((value, index) => `${index === 0 ? "M" : "L"} ${pointX(index).toFixed(2)} ${pointY(value).toFixed(2)}`)
      .join(" ");
  }

  function lastPoint(points) {
    if (!points || points.length === 0) return null;
    const index = points.length - 1;
    return {
      x: pointX(index),
      y: pointY(points[index]),
    };
  }

  return (
    <div className="points-history">
      <svg className="points-history-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Évolution des points">
        {ticks.map((tick) => {
          const y = pointY(tick);
          return (
            <g key={tick}>
              <line className="chart-grid-line" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text className="chart-axis-label" x={padding.left - 10} y={y + 4} textAnchor="end">
                {tick}
              </text>
            </g>
          );
        })}
        {days.map((day, index) => {
          if (days.length > 8 && index % Math.ceil(days.length / 8) !== 0 && index !== days.length - 1) return null;
          const x = pointX(index);
          return (
            <text className="chart-axis-label" x={x} y={height - 10} textAnchor="middle" key={day.date}>
              {day.label}
            </text>
          );
        })}
        <line className="chart-axis-line" x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} />
        <line className="chart-axis-line" x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} />
        {series.map((row, index) => (
          <g key={row.id}>
            <path className="chart-line" d={linePath(row.points || [])} stroke={colors[index % colors.length]} />
            {(row.points || []).map((value, pointIndex) => (
              <circle
                className="chart-point"
                cx={pointX(pointIndex)}
                cy={pointY(value)}
                fill={colors[index % colors.length]}
                key={`${row.id}-${pointIndex}`}
                r="3"
              />
            ))}
            {lastPoint(row.points || []) && (
              <g>
                <rect
                  className="chart-end-label-bg"
                  x={Math.min(width - padding.right + 8, lastPoint(row.points || []).x + 8)}
                  y={Math.max(8, lastPoint(row.points || []).y - 10)}
                  rx="5"
                  ry="5"
                  width={Math.min(160, Math.max(48, row.name.length * 7 + 18))}
                  height="18"
                  fill={colors[index % colors.length]}
                />
                <text
                  className="chart-end-label"
                  x={Math.min(width - padding.right + 12, lastPoint(row.points || []).x + 12)}
                  y={Math.max(21, lastPoint(row.points || []).y + 3)}
                >
                  {row.name}
                </text>
              </g>
            )}
          </g>
        ))}
      </svg>
      <div className="points-history-legend">
        {allSeries.map((row, index) => {
          const hidden = hiddenSeriesIds.includes(row.id);
          return (
          <button
            className={`history-legend-item ${hidden ? "hidden" : ""}`}
            key={row.id}
            type="button"
            onClick={() => onToggleSeries(row.id)}
            aria-pressed={!hidden}
          >
            <i style={{ background: colors[index % colors.length] }} />
            {row.name}
            <strong>{row.total} pts</strong>
          </button>
          );
        })}
      </div>
    </div>
  );
}

function SofascorePanel({ busy, status, testSofascore }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>SofaScore</h2>
          <p>Test de connexion sans modifier les scores.</p>
        </div>
        <button className="secondary" disabled={busy} onClick={testSofascore}>
          Tester
        </button>
      </div>

      {status && (
        <div className={`provider-status ${status.ok ? "ok" : "warning"}`}>
          <div className="provider-status-head">
            <strong>{status.ok ? "Accès OK" : "Accès partiel"}</strong>
            <span>
              Tournament {status.tournament_id} · season {status.season_id}
            </span>
          </div>
          <div className="provider-checks">
            {(status.checks || []).map((check) => (
              <div className="provider-check" key={check.name}>
                <span className={check.ok ? "status-ok" : "status-error"}>
                  {check.ok ? "OK" : "Erreur"}
                </span>
                <strong>{sofascoreCheckLabel(check.name)}</strong>
                <span>
                  {sofascoreCheckSummary(check)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function LoginPanel({ busy, loginAdmin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function submit(event) {
    event.preventDefault();
    loginAdmin(username, password);
  }

  return (
    <section className="panel login-panel">
      <h2>Connexion admin</h2>
      <form className="form" onSubmit={submit}>
        <label>
          Utilisateur
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button disabled={busy}>Se connecter</button>
      </form>
    </section>
  );
}

function LeaderboardPanel({
  deleteParticipant,
  editable = false,
  leaderboard,
  leaderboardMode,
  openParticipant,
  setLeaderboardMode,
  updateParticipantSubset,
}) {
  const visibleLeaderboard = leaderboardMode === "subset"
    ? leaderboard.filter((row) => row.subset_enabled)
    : leaderboard;
  const subsetCount = leaderboard.filter((row) => row.subset_enabled).length;
  const rankLabels = visibleLeaderboard.map((row, index) => {
    if (index > 0 && row.points === visibleLeaderboard[index - 1].points) {
      return "-";
    }

    return visibleLeaderboard
      .slice(0, index)
      .filter((previousRow, previousIndex, previousRows) => (
        previousIndex === 0 || previousRow.points !== previousRows[previousIndex - 1].points
      )).length + 1;
  });

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{leaderboardMode === "subset" ? "Famille" : "Classement général"}</h2>
          <p>
            {leaderboardMode === "subset"
              ? `${subsetCount} participant${subsetCount > 1 ? "s" : ""} activé${subsetCount > 1 ? "s" : ""}`
              : `${leaderboard.length} participant${leaderboard.length > 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="segmented">
          <button
            className={leaderboardMode === "all" ? "active" : ""}
            onClick={() => setLeaderboardMode("all")}
          >
            Général
          </button>
          <button
            className={leaderboardMode === "subset" ? "active" : ""}
            onClick={() => setLeaderboardMode("subset")}
          >
            Famille
          </button>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Participant</th>
            <th>Points</th>
            <th>Pronostics</th>
            {editable && <th>Famille</th>}
            {editable && <th></th>}
          </tr>
        </thead>
        <tbody>
          {visibleLeaderboard.map((row, index) => (
            <tr key={row.id} className="clickable" onClick={() => openParticipant(row)}>
              <td>{rankLabels[index]}</td>
              <td>{row.name}</td>
              <td>{row.points}</td>
              <td>{row.predictions}</td>
              {editable && (
                <td onClick={(event) => event.stopPropagation()}>
                  <label className="subset-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(row.subset_enabled)}
                      onChange={(event) => updateParticipantSubset(row, event.target.checked)}
                    />
                    <span>Actif</span>
                  </label>
                </td>
              )}
              {editable && (
                <td onClick={(event) => event.stopPropagation()}>
                  <button className="small danger" onClick={() => deleteParticipant(row)}>
                    Supprimer
                  </button>
                </td>
              )}
            </tr>
          ))}
          {visibleLeaderboard.length === 0 && (
            <tr>
              <td colSpan={editable ? 6 : 4} className="empty-row">
                Aucun participant dans ce classement.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function TestPage({ authHeaders, busy, runAction }) {
  const postAdmin = (path, options = {}) =>
    fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { ...authHeaders(), ...(options.headers || {}) },
      body: options.body,
    });

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Mode test</h2>
          <p>Disponible uniquement en local.</p>
        </div>
      </div>
      <div className="actions">
        <button
          disabled={busy}
          onClick={() =>
            runAction(
              () =>
                postAdmin("/api/demo/seed", {
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ count: 12 }),
                }),
              "Participants fictifs générés.",
            )
          }
        >
          Générer participants
        </button>
        <button
          disabled={busy}
          onClick={() =>
            runAction(
              () =>
                postAdmin("/api/demo/participant", {
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({}),
                }),
              "Participant fictif généré.",
            )
          }
        >
          Ajouter 1 participant
        </button>
        <button
          disabled={busy}
          onClick={() =>
            runAction(
              () => postAdmin("/api/demo/simulate-group-next"),
              "Prochain match de groupe simulé.",
            )
          }
        >
          Simuler prochain groupe
        </button>
        <button
          disabled={busy}
          onClick={() =>
            runAction(
              () => postAdmin("/api/demo/simulate-groups"),
              "Tous les groupes sont simulés.",
            )
          }
        >
          Simuler groupes
        </button>
        <button
          disabled={busy}
          onClick={() =>
            runAction(
              () => postAdmin("/api/demo/simulate-bracket-next"),
              "Prochain match de bracket simulé.",
            )
          }
        >
          Simuler prochain bracket
        </button>
        <button
          disabled={busy}
          onClick={() =>
            runAction(
              () => postAdmin("/api/demo/simulate-bracket"),
              "Tout le bracket disponible est simulé.",
            )
          }
        >
          Simuler bracket
        </button>
        <button
          className="danger"
          disabled={busy}
          onClick={() =>
            runAction(
              () => postAdmin("/api/demo/reset"),
              "Résultats réinitialisés.",
            )
          }
        >
          Réinitialiser
        </button>
      </div>
    </section>
  );
}

function MatchesPanel({ authHeaders, editable = false, matches, runAction }) {
  const groupMatches = matches.filter((match) => match.stage === "group");
  const bracketMatches = matches.filter((match) => match.stage !== "group");
  const groups = groupMatches.reduce((acc, match) => {
    const key = match.group_code || "?";
    acc[key] = acc[key] || [];
    acc[key].push(match);
    return acc;
  }, {});
  const orderedGroups = Object.keys(groups).sort();

  return (
    <>
      <TodayMatchesPanel matches={matches} />

      <section className="panel">
        <h2>Groupes</h2>
        <div className="group-grid">
          {orderedGroups.map((groupCode) => (
            <GroupCard
              key={groupCode}
              authHeaders={authHeaders}
              editable={editable}
              groupCode={groupCode}
              matches={groups[groupCode]}
              runAction={runAction}
            />
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Bracket</h2>
        {bracketMatches.length === 0 ? (
          <p className="empty">Aucun match de phase finale chargé.</p>
        ) : (
          <Bracket authHeaders={authHeaders} editable={editable} matches={bracketMatches} runAction={runAction} />
        )}
      </section>
    </>
  );
}

function TodayMatchesPanel({ matches }) {
  const todayMatches = todayMatchEntries(matches);

  return (
    <section className="panel today-matches-panel">
      <div className="panel-head">
        <h2>Match du jour</h2>
      </div>

      {todayMatches.length === 0 ? (
        <p className="empty">Aucun match prévu.</p>
      ) : (
        <div className="today-matches-grid">
          {todayMatches.map(({ match, kickoff }) => (
            <article className={`today-match-card ${isMatchInProgress(match) ? "in-progress" : ""}`} key={match.match_num}>
              <LiveMatchIcon match={match} />
              <div className="today-match-meta">
                <span>Match {match.match_num}</span>
                <strong>{kickoff.timeLabel}</strong>
              </div>
              <div className="today-match-teams">
                <span>{match.home_team}</span>
                <strong>{formatResult(match)}</strong>
                <span>{match.away_team}</span>
              </div>
              <div className="today-match-footer">
                <span>{stageLabel(match.stage)}</span>
                <strong className={matchStatusClass(match)}>{matchStatusLabel(match)}</strong>
              </div>
              {match.venue && <p className="today-match-venue">{match.venue}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Bracket({ authHeaders, editable = false, matches, runAction }) {
  const mainMatches = matches.filter((match) => match.stage !== "third_place");
  const thirdPlace = matches.find((match) => match.stage === "third_place");
  const rounds = [
    ["Seizièmes", mainMatches.filter((match) => match.stage === "round_of_32")],
    ["Huitièmes", mainMatches.filter((match) => match.stage === "round_of_16")],
    ["Quarts", mainMatches.filter((match) => match.stage === "quarter_final")],
    ["Demies", mainMatches.filter((match) => match.stage === "semi_final")],
    ["Finale", mainMatches.filter((match) => match.stage === "final")],
  ].map(([label, roundMatches]) => [
    label,
    roundMatches.slice().sort(compareBracketMatches),
  ]);
  const layout = buildBracketLayout(rounds, editable);

  return (
    <div className="bracket-shell">
      <div className="static-bracket" style={{ height: layout.height }}>
        <div className="bracket-board" style={{ width: layout.width, height: layout.height }}>
          <svg className="bracket-lines" viewBox={`0 0 ${layout.width} ${layout.height}`}>
          {layout.lines.map((line) => (
            <path key={line.key} d={line.path} />
          ))}
          </svg>

          {rounds.map(([label, roundMatches], roundIndex) => (
            <section
              className="static-round"
              key={label}
              style={{ left: layout.rounds[roundIndex].x, width: layout.cardWidth }}
            >
              <h3>{label}</h3>
              {roundMatches.map((match, matchIndex) => (
                <BracketCard
                  key={match.match_num}
                  authHeaders={authHeaders}
                  editorSide={editable && roundIndex === 0 ? "left" : "bottom"}
                  editable={editable}
                  match={match}
                  runAction={runAction}
                  top={layout.rounds[roundIndex].items[matchIndex].top}
                />
              ))}
            </section>
          ))}

          {thirdPlace && (
            <section className="third-place" style={{ left: layout.thirdPlace.x, top: layout.thirdPlace.top }}>
              <h3>Petite finale</h3>
              <BracketCard
                authHeaders={authHeaders}
                editable={editable}
                match={thirdPlace}
                runAction={runAction}
                top={34}
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

const BRACKET_VISUAL_ORDER = {
  round_of_32: [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87],
  round_of_16: [90, 89, 93, 94, 91, 92, 95, 96],
  quarter_final: [97, 98, 99, 100],
  semi_final: [101, 102],
  final: [104],
};

const BRACKET_VISUAL_RANK = Object.fromEntries(
  Object.entries(BRACKET_VISUAL_ORDER).map(([stage, matchNums]) => [
    stage,
    new Map(matchNums.map((matchNum, index) => [matchNum, index])),
  ]),
);

function compareBracketMatches(a, b) {
  const rank = BRACKET_VISUAL_RANK[a.stage];
  if (a.stage !== b.stage) {
    return a.match_num - b.match_num;
  }
  return (rank?.get(a.match_num) ?? a.match_num) - (rank?.get(b.match_num) ?? b.match_num);
}

function BracketCard({ authHeaders, editable = false, editorSide = "bottom", match, runAction, top }) {
  const hasResult = match.result_home_goals !== null;
  const homeWins = hasResult && resultWinner(match) === "home";
  const awayWins = hasResult && resultWinner(match) === "away";

  return (
    <article className={`bracket-card editor-${editorSide} ${isMatchInProgress(match) ? "in-progress" : ""}`} style={{ top }}>
      <LiveMatchIcon match={match} />
      <div className={`bracket-side ${homeWins ? "winner" : ""}`}>
        <span>{match.home_team}</span>
        <strong>{hasResult ? resultSideLabel(match, "home") : ""}</strong>
      </div>
      <div className={`bracket-side ${awayWins ? "winner" : ""}`}>
        <span>{match.away_team}</span>
        <strong>{hasResult ? resultSideLabel(match, "away") : ""}</strong>
      </div>
      {editable && <ResultEditor authHeaders={authHeaders} match={match} runAction={runAction} />}
    </article>
  );
}

function buildBracketLayout(rounds, editable = false) {
  const cardWidth = 188;
  const cardHeight = 68;
  const roundGap = 44;
  const firstGap = 16;
  const headerHeight = 34;
  const editorGutter = editable ? 152 : 0;
  const xStep = cardWidth + roundGap;
  const roundsLayout = rounds.map(([label, matches], roundIndex) => {
    const step = (cardHeight + firstGap) * 2 ** roundIndex;
    const firstTop = headerHeight + ((cardHeight + firstGap) * (2 ** roundIndex - 1)) / 2;
    return {
      label,
      x: editorGutter + roundIndex * xStep,
      items: matches.map((match, index) => ({
        match,
        top: firstTop + index * step,
        center: firstTop + index * step + cardHeight / 2,
      })),
    };
  });
  const height = headerHeight + 16 * (cardHeight + firstGap) - firstGap;
  const width = editorGutter + rounds.length * cardWidth + (rounds.length - 1) * roundGap;
  const thirdPlace = {
    x: roundsLayout[4].x,
    top: headerHeight + 9 * (cardHeight + firstGap),
  };
  const lines = [];

  for (let roundIndex = 0; roundIndex < roundsLayout.length - 1; roundIndex += 1) {
    const current = roundsLayout[roundIndex];
    const next = roundsLayout[roundIndex + 1];
    for (let index = 0; index < current.items.length; index += 1) {
      const from = current.items[index];
      const to = next.items[Math.floor(index / 2)];
      if (!to) continue;
      const x1 = current.x + cardWidth;
      const x2 = next.x;
      const xm = x1 + (x2 - x1) / 2;
      const path = `M ${x1} ${from.center} H ${xm} V ${to.center} H ${x2}`;
      lines.push({ key: `${roundIndex}-${index}`, path });
    }
  }

  return { cardWidth, height, lines, rounds: roundsLayout, thirdPlace, width };
}

function GroupCard({ authHeaders, editable = false, groupCode, matches, runAction }) {
  const standings = computeGroupStandings(matches);

  return (
    <article className="group-card">
      <div className="group-head">
        <h3>Groupe {groupCode}</h3>
        <span>{matches.filter((match) => match.result_home_goals !== null).length}/6 joués</span>
      </div>

      <table className="standings">
        <thead>
          <tr>
            <th>Équipe</th>
            <th>Pts</th>
            <th>Diff</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((team) => (
            <tr key={team.name}>
              <td>{team.name}</td>
              <td>{team.points}</td>
              <td>{team.diff}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="group-matches">
        {matches
          .slice()
          .sort((a, b) => a.match_num - b.match_num)
          .map((match) => (
            <MatchRow
              key={match.match_num}
              authHeaders={authHeaders}
              editable={editable}
              match={match}
              runAction={runAction}
            />
          ))}
      </div>
    </article>
  );
}

function MatchRow({ authHeaders, editable = false, match, runAction }) {
  return (
    <div className={`match-row ${editable ? "editable" : ""} ${isMatchInProgress(match) ? "in-progress" : ""}`}>
      <LiveMatchIcon match={match} />
      <span className="team">{match.home_team}</span>
      {editable ? (
        <ResultEditor authHeaders={authHeaders} match={match} runAction={runAction} />
      ) : (
        <strong>{formatResult(match)}</strong>
      )}
      <span className="team away">{match.away_team}</span>
    </div>
  );
}

function LiveMatchIcon({ match }) {
  if (!isMatchInProgress(match)) return null;
  return (
    <span className="live-match-icon" title="Match en cours" aria-label="Match en cours">
      ●
    </span>
  );
}

function isMatchInProgress(match) {
  return LIVE_RESULT_STATUS_TYPES.has(String(match.result_status_type || "").toLowerCase());
}

function matchStatusLabel(match) {
  if (isMatchInProgress(match)) {
    if (Number.isFinite(Number(match.result_live_minute))) {
      return `${Number(match.result_live_minute)}'`;
    }
    return match.result_status_description || "En cours";
  }
  if (match.result_home_goals !== null) return "Terminé";
  return "À venir";
}

function matchStatusClass(match) {
  if (isMatchInProgress(match)) return "live";
  if (match.result_home_goals !== null) return "done";
  return "upcoming";
}

function sofascoreCheckLabel(name) {
  return {
    seasons: "Saisons",
    last_page: "Derniers matchs",
    next_page: "Prochains matchs",
    calendar: "Calendrier local",
    internal_matches: "Matchs internes",
    full_fetch: "Fetch complet",
    mapping: "Mapping résultats",
  }[name] || name;
}

function sofascoreCheckSummary(check) {
  if (!check.ok) return check.error || check.summary || "Erreur";
  if (check.summary) {
    return check.duration_ms ? `${check.summary} · ${check.duration_ms} ms` : check.summary;
  }
  return `${check.events ?? 0} event(s) · ${check.duration_ms} ms`;
}

function ResultEditor({ authHeaders, match, runAction }) {
  const hasResult = match.result_home_goals !== null;
  const [editing, setEditing] = useState(false);
  const [home, setHome] = useState(match.result_home_goals ?? 0);
  const [away, setAway] = useState(match.result_away_goals ?? 0);
  const [homePenalties, setHomePenalties] = useState(match.result_home_penalties ?? "");
  const [awayPenalties, setAwayPenalties] = useState(match.result_away_penalties ?? "");

  useEffect(() => {
    setHome(match.result_home_goals ?? 0);
    setAway(match.result_away_goals ?? 0);
    setHomePenalties(match.result_home_penalties ?? "");
    setAwayPenalties(match.result_away_penalties ?? "");
    setEditing(false);
  }, [
    match.result_home_goals,
    match.result_away_goals,
    match.result_home_penalties,
    match.result_away_penalties,
  ]);

  const needsPenalties = match.stage !== "group" && Number(home) === Number(away);
  const changed =
    Number(home) !== match.result_home_goals ||
    Number(away) !== match.result_away_goals ||
    nullableNumber(homePenalties) !== match.result_home_penalties ||
    nullableNumber(awayPenalties) !== match.result_away_penalties;
  const penaltiesInvalid =
    needsPenalties &&
    (homePenalties === "" || awayPenalties === "" || Number(homePenalties) === Number(awayPenalties));
  const disabled = home === "" || away === "" || !changed || penaltiesInvalid;

  function save() {
    runAction(
      () =>
        fetch(`${API_URL}/api/results/${match.match_num}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            home_goals: Number(home),
            away_goals: Number(away),
            home_penalties: needsPenalties ? Number(homePenalties) : null,
            away_penalties: needsPenalties ? Number(awayPenalties) : null,
            source: "manual",
          }),
        }),
      "Résultat enregistré.",
    );
  }

  if (!editing) {
    return (
      <button className="result-display" onClick={() => setEditing(true)}>
        {hasResult ? formatResult(match) : "Saisir"}
      </button>
    );
  }

  return (
    <div className={`result-editor ${needsPenalties ? "with-penalties" : ""}`}>
      <div className="score-inputs">
        <input type="number" min="0" value={home} onChange={(event) => setHome(event.target.value)} />
        <span>-</span>
        <input type="number" min="0" value={away} onChange={(event) => setAway(event.target.value)} />
      </div>
      {needsPenalties && (
        <div className="score-inputs penalties" title="Tirs au but">
          <input type="number" min="0" value={homePenalties} onChange={(event) => setHomePenalties(event.target.value)} />
          <span>tab</span>
          <input type="number" min="0" value={awayPenalties} onChange={(event) => setAwayPenalties(event.target.value)} />
        </div>
      )}
      <div className="result-actions">
        <button className="small" disabled={disabled} onClick={save}>
          OK
        </button>
        <button className="small secondary" onClick={() => setEditing(false)}>
          ×
        </button>
      </div>
    </div>
  );
}

function formatResult(match) {
  if (match.result_home_goals === null) return "-";
  const score = `${match.result_home_goals} - ${match.result_away_goals}`;
  if (match.result_home_penalties !== null && match.result_away_penalties !== null) {
    return `${score} tab ${match.result_home_penalties} - ${match.result_away_penalties}`;
  }
  return score;
}

function resultSideLabel(match, side) {
  const goals = side === "home" ? match.result_home_goals : match.result_away_goals;
  const penalties = side === "home" ? match.result_home_penalties : match.result_away_penalties;
  return penalties === null ? goals : `${goals} (${penalties})`;
}

function resultWinner(match) {
  if (match.result_home_goals > match.result_away_goals) return "home";
  if (match.result_away_goals > match.result_home_goals) return "away";
  if (match.result_home_penalties > match.result_away_penalties) return "home";
  if (match.result_away_penalties > match.result_home_penalties) return "away";
  return null;
}

function nullableNumber(value) {
  return value === "" || value === null || value === undefined ? null : Number(value);
}

function computeGroupStandings(matches) {
  const table = new Map();

  function ensureTeam(name) {
    if (!table.has(name)) {
      table.set(name, { name, points: 0, goalsFor: 0, goalsAgainst: 0, diff: 0 });
    }
    return table.get(name);
  }

  for (const match of matches) {
    const home = ensureTeam(match.home_team);
    const away = ensureTeam(match.away_team);
    if (match.result_home_goals === null) continue;

    const homeGoals = match.result_home_goals;
    const awayGoals = match.result_away_goals;
    home.goalsFor += homeGoals;
    home.goalsAgainst += awayGoals;
    away.goalsFor += awayGoals;
    away.goalsAgainst += homeGoals;

    if (homeGoals > awayGoals) home.points += 3;
    else if (homeGoals < awayGoals) away.points += 3;
    else {
      home.points += 1;
      away.points += 1;
    }
  }

  return Array.from(table.values())
    .map((team) => ({ ...team, diff: team.goalsFor - team.goalsAgainst }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.diff - a.diff ||
        b.goalsFor - a.goalsFor ||
        a.name.localeCompare(b.name),
    );
}

function ParticipantPanel({ authHeaders, editable, matches, participant, predictions, scoringRules, totalPoints, onClose, onSaved }) {
  const [drafts, setDrafts] = useState({});
  const [savingMatch, setSavingMatch] = useState(null);
  const [stageFilter, setStageFilter] = useState("all");
  const sections = predictionSections(predictions);
  const visibleSections = stageFilter === "all"
    ? sections
    : sections.filter((section) => section.key === stageFilter);

  useEffect(() => {
    const nextDrafts = {};
    for (const row of predictions) {
      nextDrafts[row.match_num] = {
        home: row.predicted_home,
        away: row.predicted_away,
        homePenalties: row.predicted_home_penalties,
        awayPenalties: row.predicted_away_penalties,
      };
    }
    setDrafts(nextDrafts);
  }, [predictions]);

  function updateDraft(matchNum, side, value) {
    setDrafts((current) => ({
      ...current,
      [matchNum]: {
        ...current[matchNum],
        [side]: value,
      },
    }));
  }

  async function saveDraft(matchNum) {
    const draft = drafts[matchNum];
    const row = predictions.find((item) => item.match_num === matchNum);
    const needsPenalties = rowNeedsPredictionPenalties(draft, row);
    setSavingMatch(matchNum);
    try {
      const response = await fetch(`${API_URL}/api/predictions/${participant.id}/${matchNum}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          home_goals: Number(draft.home),
          away_goals: Number(draft.away),
          home_penalties: needsPenalties ? Number(draft.homePenalties) : null,
          away_penalties: needsPenalties ? Number(draft.awayPenalties) : null,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Sauvegarde impossible.");
      }
      await onSaved();
    } finally {
      setSavingMatch(null);
    }
  }

  async function saveKnockoutDrafts() {
    const knockoutPredictions = predictions
      .filter((row) => row.stage !== "group")
      .map((row) => ({ row, draft: drafts[row.match_num] || {} }))
      .filter(({ row, draft }) => {
        if (draft.home === "" || draft.home === null || draft.home === undefined || draft.away === "" || draft.away === null || draft.away === undefined) {
          return false;
        }
        if (!rowNeedsPredictionPenalties(draft, row)) return true;
        return (
          draft.homePenalties !== "" &&
          draft.homePenalties !== null &&
          draft.homePenalties !== undefined &&
          draft.awayPenalties !== "" &&
          draft.awayPenalties !== null &&
          draft.awayPenalties !== undefined &&
          Number(draft.homePenalties) !== Number(draft.awayPenalties)
        );
      })
      .map(({ row, draft }) => {
        const needsPenalties = rowNeedsPredictionPenalties(draft, row);
        return {
          match_num: row.match_num,
          home_goals: Number(draft.home),
          away_goals: Number(draft.away),
          home_penalties: needsPenalties ? Number(draft.homePenalties) : null,
          away_penalties: needsPenalties ? Number(draft.awayPenalties) : null,
        };
      });
    if (knockoutPredictions.length === 0) return;
    setSavingMatch("bulk-knockout");
    try {
      const response = await fetch(`${API_URL}/api/participants/${participant.id}/predictions/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ predictions: knockoutPredictions }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Sauvegarde impossible.");
      }
      await onSaved();
    } finally {
      setSavingMatch(null);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <aside className="drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <h2>{participant.name}</h2>
            <p>
              {totalPoints} points sur les matchs joués
              {editable ? " · édition admin" : ""}
            </p>
          </div>
          <button className="secondary" onClick={onClose}>
            Fermer
          </button>
        </div>

        <ScoringRules rules={scoringRules} />

        <ParticipantRecentPredictions matches={matches} predictions={predictions} scoringRules={scoringRules} />

        {editable && (
          <div className="prediction-admin-actions">
            <button
              className="secondary"
              disabled={savingMatch === "bulk-knockout"}
              onClick={saveKnockoutDrafts}
            >
              Calculer et enregistrer les phases finales
            </button>
          </div>
        )}

        <div className="prediction-filter" aria-label="Filtrer les pronostics">
          <button
            className={stageFilter === "all" ? "active" : ""}
            onClick={() => setStageFilter("all")}
          >
            Tout
          </button>
          {sections.map((section) => (
            <button
              className={stageFilter === section.key ? "active" : ""}
              key={section.key}
              onClick={() => setStageFilter(section.key)}
            >
              {section.label}
              <span>{section.rows.length}</span>
            </button>
          ))}
        </div>

        <div className="prediction-sections">
          {visibleSections.map((section) => (
            <section className="prediction-section" key={section.key}>
              <div className="prediction-section-head">
                <h3>{section.label}</h3>
                <span>{section.rows.length} matchs</span>
              </div>
              <div className="prediction-grid">
                {section.rows.map((row) => {
                  const predictedHomeTeam = row.predicted_home_team || row.home_team;
                  const predictedAwayTeam = row.predicted_away_team || row.away_team;
                  const draft = drafts[row.match_num] || {
                    home: row.predicted_home,
                    away: row.predicted_away,
                    homePenalties: row.predicted_home_penalties,
                    awayPenalties: row.predicted_away_penalties,
                  };
                  const needsPenalties = rowNeedsPredictionPenalties(draft, row);
                  const scoreInvalid =
                    draft.home === "" ||
                    draft.home === null ||
                    draft.home === undefined ||
                    draft.away === "" ||
                    draft.away === null ||
                    draft.away === undefined;
                  const penaltiesInvalid =
                    needsPenalties &&
                    (draft.homePenalties === "" ||
                      draft.homePenalties === null ||
                      draft.homePenalties === undefined ||
                      draft.awayPenalties === "" ||
                      draft.awayPenalties === null ||
                      draft.awayPenalties === undefined ||
                      Number(draft.homePenalties) === Number(draft.awayPenalties));
                  const changed =
                    nullableNumber(draft.home) !== row.predicted_home ||
                    nullableNumber(draft.away) !== row.predicted_away ||
                    nullableNumber(draft.homePenalties) !== row.predicted_home_penalties ||
                    nullableNumber(draft.awayPenalties) !== row.predicted_away_penalties;

                  return (
                    <article className="prediction-card" key={row.match_num}>
                      <div className="prediction-meta">
                        <span>{row.match_num}</span>
                        <strong>{row.points} pts</strong>
                      </div>
                      <div className="prediction-match">
                        <span className="team-name">{predictedHomeTeam}</span>
                        {editable ? (
                          <div className={`prediction-score-editor ${needsPenalties ? "with-penalties" : ""}`}>
                            <div className="score-edit compact">
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={draft.home ?? ""}
                                onChange={(event) => updateDraft(row.match_num, "home", event.target.value)}
                              />
                              <span>-</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={draft.away ?? ""}
                                onChange={(event) => updateDraft(row.match_num, "away", event.target.value)}
                              />
                            </div>
                            {needsPenalties && (
                              <div className="score-edit compact penalties">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={draft.homePenalties ?? ""}
                                  onChange={(event) => updateDraft(row.match_num, "homePenalties", event.target.value)}
                                />
                                <span>tab</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={draft.awayPenalties ?? ""}
                                  onChange={(event) => updateDraft(row.match_num, "awayPenalties", event.target.value)}
                                />
                              </div>
                            )}
                          </div>
                        ) : (
                          <strong className="prediction-score">
                            {formatPredictionScore(row)}
                          </strong>
                        )}
                        <span className="team-name away">{predictedAwayTeam}</span>
                      </div>
                      <div className="prediction-footer">
                        <span>
                          Résultat : {formatPredictionResult(row)}
                        </span>
                        {editable && (
                          <button
                            className="small"
                            disabled={scoreInvalid || !changed || penaltiesInvalid || savingMatch === row.match_num}
                            onClick={() => saveDraft(row.match_num)}
                          >
                            OK
                          </button>
                        )}
                      </div>
                      <PredictionPointsBreakdown row={row} scoringRules={scoringRules} />
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}

function ParticipantRecentPredictions({ matches, predictions, scoringRules }) {
  const predictionByMatch = new Map(predictions.map((row) => [row.match_num, row]));
  const daySections = [
    {
      key: "today",
      title: "Pronostics du jour",
      empty: "Aucun pronostic sur les matchs du jour.",
      entries: dayMatchEntries(matches),
    },
    {
      key: "yesterday",
      title: "Pronostics de la veille",
      empty: "Aucun pronostic sur les matchs de la veille.",
      entries: dayMatchEntries(matches, -1),
    },
  ].map((section) => ({
    ...section,
    predictions: section.entries
      .map(({ match, kickoff }) => ({ match, kickoff, row: predictionByMatch.get(match.match_num) }))
      .filter(({ row }) => row),
  }));

  return (
    <section className="today-predictions">
      {daySections.map((section) => (
        <div className="daily-prediction-section" key={section.key}>
          <div className="prediction-section-head">
            <h3>{section.title}</h3>
            <span>{section.predictions.length} match{section.predictions.length > 1 ? "s" : ""}</span>
          </div>

          {section.predictions.length === 0 ? (
            <p className="empty">{section.empty}</p>
          ) : (
            <div className="today-predictions-grid">
              {section.predictions.map(({ match, kickoff, row }) => (
                <article className="today-prediction-card" key={match.match_num}>
                  <div className="prediction-meta">
                    <span>Match {match.match_num}</span>
                    <strong>{kickoff.timeLabel}</strong>
                  </div>
                  <div className="prediction-match">
                    <span className="team-name">{row.predicted_home_team || match.home_team}</span>
                    <strong className="prediction-score">{formatPredictionScore(row)}</strong>
                    <span className="team-name away">{row.predicted_away_team || match.away_team}</span>
                  </div>
                  <div className="prediction-footer">
                    <span>Résultat : {formatPredictionResult(row)}</span>
                    <strong>{row.points} pts</strong>
                  </div>
                  <div className="today-prediction-status">
                    <span>{stageLabel(match.stage)}</span>
                    <strong className={matchStatusClass(match)}>{matchStatusLabel(match)}</strong>
                  </div>
                  <PredictionPointsBreakdown row={row} scoringRules={scoringRules} />
                </article>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function PredictionPointsBreakdown({ row, scoringRules }) {
  const details = row.point_details || [];
  if (details.length === 0 && row.result_home === null) return null;

  if (details.length === 0) {
    return <div className="points-breakdown empty-breakdown">Aucun point sur ce match</div>;
  }

  return (
    <div className="points-breakdown">
      {details.map((detail, index) => (
        <span className="points-chip" key={`${detail.key}-${detail.team || "score"}-${index}`}>
          {pointDetailLabel(detail)}
          <strong>+{Number(detail.points ?? scoringRules[detail.key] ?? 0)} pts</strong>
        </span>
      ))}
    </div>
  );
}

function ScoringRules({ rules }) {
  const groups = scoringRuleGroups(rules).filter((group) => group.entries.length > 0);
  if (groups.length === 0) return null;

  return (
    <details className="scoring-rules">
      <summary className="scoring-rules-summary">Barème</summary>
      <div className="scoring-rules-head">
        <h3>Barème</h3>
        <p>
          Voici le barème utilisé pour calculer les points.
        </p>
      </div>
      <div className="scoring-groups">
        {groups.map((group) => (
          <div className="scoring-group" key={group.title}>
            <h4>{group.title}</h4>
            <div className="scoring-list">
              {group.entries.map(([key, value]) => (
                <span className="scoring-row" key={key}>
                  <span>{scoringRuleLabel(key)}</span>
                  <strong>{value} pts</strong>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function predictionSections(predictions) {
  const order = ["group", "round_of_32", "round_of_16", "quarter_final", "semi_final", "third_place", "final"];
  return order
    .map((stage) => ({
      key: stage,
      label: stageLabel(stage),
      rows: predictions.filter((row) => row.stage === stage),
    }))
    .filter((section) => section.rows.length > 0);
}

function scoringRuleGroups(rules) {
  const groups = [
    {
      title: "Score du match",
      keys: ["resultat_ok", "score_exact", "gagnant_ok"],
    },
    {
      title: "Bonne affiche",
      keys: [
        "affiche_seizieme_ok",
        "affiche_huitieme_ok",
        "affiche_quart_ok",
        "affiche_demi_ok",
        "affiche_petite_finale_ok",
        "affiche_finale_ok",
      ],
    },
    {
      title: "Équipe au bon tour",
      keys: [
        "seizieme_de_finaliste_ok",
        "huitieme_de_finaliste_ok",
        "quart_de_finaliste_ok",
        "demi_ok",
        "petite_finale_ok",
        "finaliste_ok",
      ],
    },
  ];
  return groups.map((group) => ({
    ...group,
    entries: group.keys
      .filter((key) => Number.isFinite(Number(rules[key])))
      .map((key) => [key, Number(rules[key])]),
  }));
}

function scoringRuleLabel(key) {
  return {
    resultat_ok: "Bon résultat, sans score exact",
    score_exact: "Score exact du match",
    affiche_seizieme_ok: "Bonne affiche pronostiquée en 16e",
    seizieme_de_finaliste_ok: "Équipe bien pronostiquée en 16e",
    affiche_huitieme_ok: "Bonne affiche pronostiquée en 8e",
    huitieme_de_finaliste_ok: "Équipe bien pronostiquée en 8e",
    affiche_quart_ok: "Bonne affiche pronostiquée en quart",
    quart_de_finaliste_ok: "Équipe bien pronostiquée en quart",
    affiche_demi_ok: "Bonne affiche pronostiquée en demi",
    demi_ok: "Équipe bien pronostiquée en demi",
    affiche_petite_finale_ok: "Bonne affiche pronostiquée en petite finale",
    petite_finale_ok: "Équipe bien pronostiquée en petite finale",
    affiche_finale_ok: "Bonne affiche pronostiquée en finale",
    finaliste_ok: "Équipe bien pronostiquée en finale",
    gagnant_ok: "Vainqueur final bien pronostiqué",
  }[key] || key;
}

function pointDetailLabel(detail) {
  if (!detail.team) return scoringRuleLabel(detail.key);
  return `${scoringRuleLabel(detail.key)} : ${detail.team}`;
}

function rowNeedsPredictionPenalties(draft, row) {
  if (!row || row.stage === "group") return false;
  if (draft.home === "" || draft.away === "" || draft.home === null || draft.away === null) return false;
  return Number(draft.home) === Number(draft.away);
}

function formatPredictionScore(row) {
  if (row.predicted_home === null || row.predicted_away === null) return "Non renseigné";
  const score = `${row.predicted_home} - ${row.predicted_away}`;
  if (row.predicted_home_penalties !== null && row.predicted_away_penalties !== null) {
    return `${score} tab ${row.predicted_home_penalties} - ${row.predicted_away_penalties}`;
  }
  return score;
}

function formatPredictionResult(row) {
  if (row.result_home === null) return "Non joué";
  const score = `${row.result_home} - ${row.result_away}`;
  if (row.result_home_penalties !== null && row.result_away_penalties !== null) {
    return `${score} tab ${row.result_home_penalties} - ${row.result_away_penalties}`;
  }
  return score;
}

function todayMatchEntries(matches) {
  return dayMatchEntries(matches);
}

function dayMatchEntries(matches, dayOffset = 0) {
  const window = franceMatchDayWindow(new Date(), dayOffset);
  return matches
    .map((match) => ({ match, kickoff: matchKickoffInfo(match) }))
    .filter(({ kickoff }) => kickoff && kickoff.localTimestamp > window.start && kickoff.localTimestamp < window.end)
    .sort((a, b) => a.kickoff.localTimestamp - b.kickoff.localTimestamp);
}

function matchKickoffInfo(match) {
  if (Number.isFinite(Number(match.calendar_timestamp))) {
    const date = new Date(Number(match.calendar_timestamp) * 1000);
    const local = franceLocalParts(date);
    if (local) {
      return {
        localTimestamp: localTimestamp(local),
        timeLabel: `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`,
      };
    }
  }

  const kickoff = String(match.kickoff || "").trim();
  if (!kickoff) return null;

  const local = hasExplicitTimezone(kickoff)
    ? franceLocalParts(new Date(kickoff))
    : parseFranceLocalKickoff(kickoff);
  if (!local) return null;

  return {
    localTimestamp: localTimestamp(local),
    timeLabel: `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`,
  };
}

function franceMatchDayWindow(date = new Date(), dayOffset = 0) {
  const now = franceLocalParts(date);
  const todayNoon = localTimestamp({ ...now, hour: MATCH_DAY_START_HOUR, minute: 0 });
  const start = localTimestamp(now) < todayNoon
    ? addLocalDays(todayNoon, -1)
    : todayNoon;
  const shiftedStart = addLocalDays(start, dayOffset);
  return { start: shiftedStart, end: addLocalDays(shiftedStart, 1) };
}

function franceLocalParts(date) {
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("fr-FR", {
      timeZone: FR_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function parseFranceLocalKickoff(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T| )(\d{2}):(\d{2})/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
}

function hasExplicitTimezone(value) {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
}

function localTimestamp({ year, month, day, hour = 0, minute = 0 }) {
  return Date.UTC(year, month - 1, day, hour, minute);
}

function addLocalDays(timestamp, days) {
  const date = new Date(timestamp);
  date.setUTCDate(date.getUTCDate() + days);
  return date.getTime();
}

function stageLabel(stage) {
  return {
    group: "Groupe",
    round_of_32: "16e",
    round_of_16: "8e",
    quarter_final: "Quart",
    semi_final: "Demie",
    third_place: "Petite finale",
    final: "Finale",
  }[stage] || stage;
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
