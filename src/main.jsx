import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const configuredApiUrl = import.meta.env.VITE_API_URL;
const API_URL =
  configuredApiUrl !== undefined && configuredApiUrl !== null
    ? configuredApiUrl.replace(/\/$/, "")
    : window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? `${window.location.protocol}//${window.location.hostname}:5050`
      : "";

function App() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [matches, setMatches] = useState([]);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [participantPredictions, setParticipantPredictions] = useState([]);
  const [participantScore, setParticipantScore] = useState({ total_points: 0, rows: [] });
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem("cdm_admin_token") || "");
  const [adminUser, setAdminUser] = useState(() => localStorage.getItem("cdm_admin_user") || "");
  const currentPath = window.location.pathname;
  const isAdminPage = currentPath === "/admin" || currentPath === "/test";

  async function refresh() {
    const [leaderboardRes, participantsRes, matchesRes] = await Promise.all([
      fetch(`${API_URL}/api/leaderboard`),
      fetch(`${API_URL}/api/participants`),
      fetch(`${API_URL}/api/matches`),
    ]);
    setLeaderboard(await leaderboardRes.json());
    setParticipants(await participantsRes.json());
    setMatches(await matchesRes.json());
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

  const completedMatches = useMemo(
    () => matches.filter((match) => match.result_home_goals !== null).length,
    [matches],
  );

  return (
    <main className="shell">
      <img className="rooster-bg" src="/assets/rooster-gold.svg" alt="" aria-hidden="true" />
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
          leaderboard={leaderboard}
          loginAdmin={loginAdmin}
          logoutAdmin={logoutAdmin}
          matches={matches}
          name={name}
          openParticipant={openParticipant}
          runAction={runAction}
          setFile={setFile}
          setName={setName}
          authHeaders={authHeaders}
        />
      ) : (
        <HomePage
          leaderboard={leaderboard}
          matches={matches}
          openParticipant={openParticipant}
        />
      )}

      {selectedParticipant && (
        <ParticipantPanel
          participant={selectedParticipant}
          predictions={participantPredictions}
          totalPoints={participantScore.total_points}
          editable={isAdminPage && Boolean(adminToken)}
          authHeaders={authHeaders}
          onClose={() => setSelectedParticipant(null)}
          onSaved={() => openParticipant(selectedParticipant).then(refresh)}
        />
      )}
    </main>
  );
}

function HomePage({ leaderboard, matches, openParticipant }) {
  return (
    <>
      <LeaderboardPanel leaderboard={leaderboard} openParticipant={openParticipant} />

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
  leaderboard,
  loginAdmin,
  logoutAdmin,
  matches,
  name,
  openParticipant,
  runAction,
  setFile,
  setName,
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

      <TestPage authHeaders={authHeaders} busy={busy} runAction={runAction} />
      <LeaderboardPanel leaderboard={leaderboard} openParticipant={openParticipant} />
      <MatchesPanel matches={matches} />
    </>
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

function LeaderboardPanel({ leaderboard, openParticipant }) {
  return (
    <section className="panel">
      <h2>Classement</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Participant</th>
            <th>Points</th>
            <th>Pronostics</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((row, index) => (
            <tr key={row.id} className="clickable" onClick={() => openParticipant(row)}>
              <td>{index + 1}</td>
              <td>{row.name}</td>
              <td>{row.points}</td>
              <td>{row.predictions}</td>
            </tr>
          ))}
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
      <h2>Mode test</h2>
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
              "Données de test réinitialisées.",
            )
          }
        >
          Réinitialiser
        </button>
      </div>
    </section>
  );
}

function MatchesPanel({ matches }) {
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
      <section className="panel">
        <h2>Groupes</h2>
        <div className="group-grid">
          {orderedGroups.map((groupCode) => (
            <GroupCard key={groupCode} groupCode={groupCode} matches={groups[groupCode]} />
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Bracket</h2>
        {bracketMatches.length === 0 ? (
          <p className="empty">Aucun match de phase finale chargé.</p>
        ) : (
          <Bracket matches={bracketMatches} />
        )}
      </section>
    </>
  );
}

function Bracket({ matches }) {
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
    roundMatches.slice().sort((a, b) => a.match_num - b.match_num),
  ]);
  const layout = buildBracketLayout(rounds);

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
                  match={match}
                  top={layout.rounds[roundIndex].items[matchIndex].top}
                />
              ))}
            </section>
          ))}

          {thirdPlace && (
            <section className="third-place" style={{ left: layout.thirdPlace.x, top: layout.thirdPlace.top }}>
              <h3>Petite finale</h3>
              <BracketCard match={thirdPlace} top={34} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function BracketCard({ match, top }) {
  const hasResult = match.result_home_goals !== null;
  const homeWins = hasResult && match.result_home_goals > match.result_away_goals;
  const awayWins = hasResult && match.result_away_goals > match.result_home_goals;

  return (
    <article className="bracket-card" style={{ top }}>
      <div className={`bracket-side ${homeWins ? "winner" : ""}`}>
        <span>{match.home_team}</span>
        <strong>{hasResult ? match.result_home_goals : ""}</strong>
      </div>
      <div className={`bracket-side ${awayWins ? "winner" : ""}`}>
        <span>{match.away_team}</span>
        <strong>{hasResult ? match.result_away_goals : ""}</strong>
      </div>
    </article>
  );
}

function buildBracketLayout(rounds) {
  const cardWidth = 188;
  const cardHeight = 68;
  const roundGap = 44;
  const firstGap = 16;
  const headerHeight = 34;
  const xStep = cardWidth + roundGap;
  const roundsLayout = rounds.map(([label, matches], roundIndex) => {
    const step = (cardHeight + firstGap) * 2 ** roundIndex;
    const firstTop = headerHeight + ((cardHeight + firstGap) * (2 ** roundIndex - 1)) / 2;
    return {
      label,
      x: roundIndex * xStep,
      items: matches.map((match, index) => ({
        match,
        top: firstTop + index * step,
        center: firstTop + index * step + cardHeight / 2,
      })),
    };
  });
  const height = headerHeight + 16 * (cardHeight + firstGap) - firstGap;
  const width = rounds.length * cardWidth + (rounds.length - 1) * roundGap;
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

function GroupCard({ groupCode, matches }) {
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
            <MatchRow key={match.match_num} match={match} />
          ))}
      </div>
    </article>
  );
}

function MatchRow({ match }) {
  return (
    <div className="match-row">
      <span className="team">{match.home_team}</span>
      <strong>
        {match.result_home_goals === null
          ? "-"
          : `${match.result_home_goals} - ${match.result_away_goals}`}
      </strong>
      <span className="team away">{match.away_team}</span>
    </div>
  );
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

function ParticipantPanel({ authHeaders, editable, participant, predictions, totalPoints, onClose, onSaved }) {
  const [drafts, setDrafts] = useState({});
  const [savingMatch, setSavingMatch] = useState(null);

  useEffect(() => {
    const nextDrafts = {};
    for (const row of predictions) {
      nextDrafts[row.match_num] = {
        home: row.predicted_home,
        away: row.predicted_away,
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
    setSavingMatch(matchNum);
    try {
      const response = await fetch(`${API_URL}/api/predictions/${participant.id}/${matchNum}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          home_goals: Number(draft.home),
          away_goals: Number(draft.away),
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

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Match</th>
              <th>Prono</th>
              <th>Résultat</th>
              <th>Pts</th>
              {editable && <th></th>}
            </tr>
          </thead>
          <tbody>
            {predictions.map((row) => {
              const draft = drafts[row.match_num] || {
                home: row.predicted_home,
                away: row.predicted_away,
              };
              const changed =
                Number(draft.home) !== row.predicted_home || Number(draft.away) !== row.predicted_away;

              return (
                <tr key={row.match_num}>
                  <td>{row.match_num}</td>
                  <td>
                    {row.home_team} - {row.away_team}
                  </td>
                  <td>
                    {editable ? (
                      <div className="score-edit">
                        <input
                          type="number"
                          min="0"
                          value={draft.home}
                          onChange={(event) => updateDraft(row.match_num, "home", event.target.value)}
                        />
                        <span>-</span>
                        <input
                          type="number"
                          min="0"
                          value={draft.away}
                          onChange={(event) => updateDraft(row.match_num, "away", event.target.value)}
                        />
                      </div>
                    ) : (
                      `${row.predicted_home} - ${row.predicted_away}`
                    )}
                  </td>
                  <td>
                    {row.result_home === null ? "Non joué" : `${row.result_home} - ${row.result_away}`}
                  </td>
                  <td>{row.points}</td>
                  {editable && (
                    <td>
                      <button
                        className="small"
                        disabled={!changed || savingMatch === row.match_num}
                        onClick={() => saveDraft(row.match_num)}
                      >
                        OK
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </aside>
    </div>
  );
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
