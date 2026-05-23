import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Match,
  SVGViewer,
  SingleEliminationBracket,
} from "@g-loot/react-tournament-brackets";
import "./styles.css";

const API_URL =
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:5050`;

function App() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [matches, setMatches] = useState([]);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [participantPredictions, setParticipantPredictions] = useState([]);
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const isTestPage = window.location.pathname === "/test";

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
    refresh().catch((error) => setMessage(error.message));
  }, []);

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
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/api/score-preview/${row.id}`);
      if (!response.ok) throw new Error("Impossible de charger les pronostics.");
      setParticipantPredictions(await response.json());
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
          <p>{isTestPage ? "Outils de simulation" : "Pronostics, résultats et classement"}</p>
          </div>
        </div>
        <nav className="nav">
          <a className={!isTestPage ? "active" : ""} href="/">
            Classement
          </a>
          <a className={isTestPage ? "active" : ""} href="/test">
            Test
          </a>
        </nav>
        <div className="stats">
          <Stat label="Participants" value={participants.length} />
          <Stat label="Matchs joués" value={`${completedMatches}/${matches.length}`} />
        </div>
      </header>

      {message && <p className="message">{message}</p>}

      {isTestPage ? (
        <TestPage busy={busy} runAction={runAction} />
      ) : (
        <HomePage
          busy={busy}
          leaderboard={leaderboard}
          matches={matches}
          name={name}
          setName={setName}
          setFile={setFile}
          importXlsx={importXlsx}
          openParticipant={openParticipant}
        />
      )}

      {selectedParticipant && (
        <ParticipantPanel
          participant={selectedParticipant}
          predictions={participantPredictions}
          onClose={() => setSelectedParticipant(null)}
          onSaved={() => openParticipant(selectedParticipant).then(refresh)}
        />
      )}
    </main>
  );
}

function HomePage({
  busy,
  leaderboard,
  matches,
  name,
  setName,
  setFile,
  importXlsx,
  openParticipant,
}) {
  return (
    <>
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

      <MatchesPanel matches={matches} />
    </>
  );
}

function TestPage({ busy, runAction }) {
  return (
    <section className="panel">
      <h2>Mode test</h2>
      <div className="actions">
        <button
          disabled={busy}
          onClick={() =>
            runAction(
              () =>
                fetch(`${API_URL}/api/demo/seed`, {
                  method: "POST",
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
              () => fetch(`${API_URL}/api/demo/simulate-group-next`, { method: "POST" }),
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
              () => fetch(`${API_URL}/api/demo/simulate-groups`, { method: "POST" }),
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
              () => fetch(`${API_URL}/api/demo/simulate-bracket-next`, { method: "POST" }),
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
              () => fetch(`${API_URL}/api/demo/simulate-bracket`, { method: "POST" }),
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
              () => fetch(`${API_URL}/api/demo/reset`, { method: "POST" }),
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
  const bracketMatches = matches
    .filter((match) => match.stage !== "third_place")
    .sort((a, b) => a.match_num - b.match_num);
  const thirdPlace = matches.find((match) => match.stage === "third_place");
  const libraryMatches = bracketMatches.map(toTournamentMatch);

  return (
    <div className="bracket-shell">
      <div className="bracket-viewer">
        <SingleEliminationBracket
          matches={libraryMatches}
          matchComponent={Match}
          svgWrapper={({ children, ...props }) => (
            <SVGViewer width={1120} height={760} {...props}>
              {children}
            </SVGViewer>
          )}
        />
      </div>
      {thirdPlace && (
        <section className="third-place">
          <h3>Petite finale</h3>
          <div className="third-place-card">
            <span>{thirdPlace.home_team}</span>
            <strong>
              {thirdPlace.result_home_goals === null
                ? "-"
                : `${thirdPlace.result_home_goals} - ${thirdPlace.result_away_goals}`}
            </strong>
            <span>{thirdPlace.away_team}</span>
          </div>
        </section>
      )}
    </div>
  );
}

function toTournamentMatch(match) {
  const hasResult = match.result_home_goals !== null;
  const homeWins = hasResult && match.result_home_goals > match.result_away_goals;
  const awayWins = hasResult && match.result_away_goals > match.result_home_goals;

  return {
    id: match.match_num,
    name: `Match ${match.match_num}`,
    nextMatchId: nextMatchId(match.match_num),
    tournamentRoundText: roundText(match.stage),
    startTime: match.kickoff || "",
    state: hasResult ? "SCORE_DONE" : "SCHEDULED",
    participants: [
      {
        id: `${match.match_num}-home`,
        name: match.home_team,
        resultText: hasResult ? String(match.result_home_goals) : null,
        isWinner: homeWins,
        status: hasResult ? "PLAYED" : null,
      },
      {
        id: `${match.match_num}-away`,
        name: match.away_team,
        resultText: hasResult ? String(match.result_away_goals) : null,
        isWinner: awayWins,
        status: hasResult ? "PLAYED" : null,
      },
    ],
  };
}

function nextMatchId(matchNum) {
  if (matchNum >= 73 && matchNum <= 88) return 89 + Math.floor((matchNum - 73) / 2);
  if (matchNum >= 89 && matchNum <= 96) return 97 + Math.floor((matchNum - 89) / 2);
  if (matchNum >= 97 && matchNum <= 100) return 101 + Math.floor((matchNum - 97) / 2);
  if (matchNum === 101 || matchNum === 102) return 104;
  return null;
}

function roundText(stage) {
  return {
    round_of_32: "Seizièmes",
    round_of_16: "Huitièmes",
    quarter_final: "Quarts",
    semi_final: "Demies",
    final: "Finale",
  }[stage];
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

function ParticipantPanel({ participant, predictions, onClose, onSaved }) {
  const total = predictions.reduce((sum, row) => sum + row.points, 0);
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
        headers: { "Content-Type": "application/json" },
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
            <p>{total} points sur les matchs joués</p>
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
              <th></th>
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
                  </td>
                  <td>
                    {row.result_home === null ? "Non joué" : `${row.result_home} - ${row.result_away}`}
                  </td>
                  <td>{row.points}</td>
                  <td>
                    <button
                      className="small"
                      disabled={!changed || savingMatch === row.match_num}
                      onClick={() => saveDraft(row.match_num)}
                    >
                      OK
                    </button>
                  </td>
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
