import { useEffect, useMemo, useState } from 'react'
import './App.css'

const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
]

const TABLE_ROWS = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
]

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
])

const NUMBER_COUNT = 37
const UNIFORM_PROBABILITY = 1 / NUMBER_COUNT
const FIXED_SPAN = 9
const FIXED_COVERAGE = FIXED_SPAN * 2 + 1
const BREAK_EVEN_PROBABILITY = FIXED_COVERAGE / 36
const WALK_FORWARD_WINDOW = 34
const STORAGE_KEY = 'mirofish-roulette-lab:v1'
const SAMPLE_SEED_TEXT =
  'vermelho 47 preto 13 verde 1 pares 47 impares 13 1-18 46 19-36 14 duzias 30 34 32 colunas 31 34 31 ultimos 31 3 34 10 11 33 29 17 3 25 23'

const AGENTS = [
  {
    id: 'hot',
    name: 'Quentes',
    signal: 'frequencia recente',
    predict: predictHot,
  },
  {
    id: 'cold',
    name: 'Atrasados',
    signal: 'lacuna desde a ultima saida',
    predict: predictCold,
  },
  {
    id: 'sector',
    name: 'Setor fisico',
    signal: 'concentracao no volante',
    predict: predictSector,
  },
  {
    id: 'markov',
    name: 'Markov',
    signal: 'transicoes apos o ultimo numero',
    predict: predictMarkov,
  },
  {
    id: 'rhythm',
    name: 'Ritmo',
    signal: 'saltos entre posicoes',
    predict: predictRhythm,
  },
  {
    id: 'neural',
    name: 'Tiny learner',
    signal: 'modelo online leve',
    predict: predictTinyLearner,
  },
  {
    id: 'bayes',
    name: 'Bayes wheel',
    signal: 'prior por setores e recencia',
    predict: predictBayesWheel,
  },
  {
    id: 'harmonic',
    name: 'Ressonancia',
    signal: 'harmonicos circulares do volante',
    predict: predictHarmonicResonance,
  },
  {
    id: 'mirror',
    name: 'Mirror scout',
    signal: 'padroes que repetem no espelho',
    predict: predictMirrorScout,
  },
  {
    id: 'landing',
    name: 'Zona de pouso',
    signal: 'previsao regional com vizinhos',
    predict: predictLandingZone,
  },
  {
    id: 'seed',
    name: 'Seed do print',
    signal: 'graficos iniciais da mesa',
    predict: predictSeed,
  },
  {
    id: 'skeptic',
    name: 'Cetico',
    signal: 'controle aleatorio',
    predict: predictSkeptic,
  },
]

const DEFAULT_STATE = {
  historyText: '',
  span: FIXED_SPAN,
  unit: 0.5,
  bankroll: 100,
  seedText: '',
  seedFields: {
    colors: ['', '', ''],
    parity: ['', ''],
    ranges: ['', ''],
    dozens: ['', '', ''],
    columns: ['', '', ''],
  },
  paperLog: [],
}

function App() {
  const [savedState, setSavedState] = useLocalStorageState(STORAGE_KEY, DEFAULT_STATE)
  const [nextNumber, setNextNumber] = useState('')
  const [activeTab, setActiveTab] = useState('mesa')
  const seedFields = savedState.seedFields ?? DEFAULT_STATE.seedFields

  const history = useMemo(() => parseNumbers(savedState.historyText), [savedState.historyText])
  const seed = useMemo(
    () => mergeSeeds(parseSeedText(savedState.seedText), parseSeedFields(seedFields)),
    [savedState.seedText, seedFields],
  )
  const seedDistribution = useMemo(() => buildSeedDistribution(seed), [seed])
  const population = useMemo(
    () => buildPopulation(history, FIXED_SPAN, seedDistribution),
    [history, seedDistribution],
  )
  const backtest = useMemo(
    () => runBacktest(history, FIXED_SPAN, savedState.unit, seedDistribution),
    [history, savedState.unit, seedDistribution],
  )
  const wheelCells = useMemo(
    () => buildWheelCells(population.recommendation.covered),
    [population.recommendation.covered],
  )
  const lastTen = history.slice(-10).reverse()
  const paperSummary = summarizePaper(savedState.paperLog)
  const lastOutcome = savedState.paperLog[0] ?? null

  function updateState(patch) {
    setSavedState((current) => ({ ...current, ...patch }))
  }

  function updateSeedField(group, index, value) {
    const cleanedValue = value.replace(',', '.')
    setSavedState((current) => {
      const currentFields = current.seedFields ?? DEFAULT_STATE.seedFields
      const nextGroup = [...currentFields[group]]
      nextGroup[index] = cleanedValue
      return {
        ...current,
        seedFields: {
          ...currentFields,
          [group]: nextGroup,
        },
      }
    })
  }

  function appendNumber(value) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 36) {
      return
    }

    const paperEntry = settlePaperRound({
      recommendation: population.recommendation,
      actual: parsed,
      span: FIXED_SPAN,
      unit: savedState.unit,
      historyLength: history.length,
    })

    const separator = savedState.historyText.trim() ? ', ' : ''
    updateState({
      historyText: `${savedState.historyText.trim()}${separator}${parsed}`,
      paperLog: [paperEntry, ...savedState.paperLog].slice(0, 100),
    })
    setNextNumber('')
  }

  function loadDemo() {
    updateState({
      historyText:
        '15, 27, 25, 18, 28, 9, 6, 32, 36, 19, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21',
      paperLog: [],
    })
  }

  function resetAll() {
    setSavedState(DEFAULT_STATE)
    setNextNumber('')
  }

  const recommendationTone =
    population.recommendation.mode === 'bet' ? 'signal-card--go' : 'signal-card--hold'

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span>MiroFish</span>
          <strong>Roulette Lab</strong>
        </div>
        <nav className="tabs" aria-label="Visualizacao">
          {[
            ['mesa', 'Mesa'],
            ['seed', 'Seed'],
            ['agentes', 'Agentes'],
            ['teste', 'Teste'],
          ].map(([id, label]) => (
            <button
              className={activeTab === id ? 'is-active' : ''}
              key={id}
              onClick={() => setActiveTab(id)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <section className="hero-grid">
        <aside className={`signal-card ${recommendationTone}`}>
          <div className={`decision-pill decision-pill--${population.recommendation.decisionTone}`}>
            {population.recommendation.decisionLabel}
          </div>
          <p className="eyebrow">Proxima jogada</p>
          <div className="signal-card__number">{population.recommendation.center}</div>
          <div className="signal-card__meta">
            <span>{population.recommendation.covered.length} numeros cobertos</span>
            <span>{formatPercent(population.recommendation.mass)} massa</span>
          </div>
          <p>{population.recommendation.message}</p>
        </aside>

        <section className="control-panel">
          {lastOutcome && <OutcomeBanner entry={lastOutcome} />}

          <div className="field-row">
            <div className="locked-field">
              <span>Vizinhos fixos</span>
              <strong>+{FIXED_SPAN}</strong>
              <small>{FIXED_COVERAGE} numeros cobertos por entrada</small>
            </div>
            <label>
              Ficha
              <input
                min="0.1"
                onChange={(event) => updateState({ unit: Number(event.target.value) || 0 })}
                step="0.1"
                type="number"
                value={savedState.unit}
              />
            </label>
            <label>
              Banca paper
              <input
                min="0"
                onChange={(event) => updateState({ bankroll: Number(event.target.value) || 0 })}
                step="1"
                type="number"
                value={savedState.bankroll}
              />
            </label>
          </div>

          <div className="quick-entry">
            <input
              inputMode="numeric"
              max="36"
              min="0"
              onChange={(event) => setNextNumber(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  appendNumber(nextNumber)
                }
              }}
              placeholder="Numero que saiu"
              type="number"
              value={nextNumber}
            />
            <button onClick={() => appendNumber(nextNumber)} type="button">
              Lancar rodada
            </button>
          </div>

          <div className="metric-strip">
            <Metric label="Historico" value={history.length} />
            <Metric label="Paper 10" value={`${Math.min(savedState.paperLog.length, 10)}/10`} />
            <Metric label="Juiz" value={formatPercent(population.recommendation.judge.score)} />
            <Metric label="Backtest" value={formatMoney(backtest.net)} />
          </div>
        </section>
      </section>

      {activeTab === 'mesa' && (
        <section className="workspace workspace--table">
          <div className="wheel-panel">
            <div className="wheel-track" aria-label="Volante europeu">
              {wheelCells.map((cell) => (
                <div
                  className={`wheel-cell ${cell.color} ${cell.isCovered ? 'is-covered' : ''} ${
                    cell.number === population.recommendation.center ? 'is-center' : ''
                  }`}
                  key={cell.number}
                  style={{ '--angle': `${cell.angle}deg` }}
                  title={`Numero ${cell.number}`}
                >
                  <span>{cell.number}</span>
                </div>
              ))}
              <div className="wheel-core">
                <span>{population.recommendation.center}</span>
                <small>centro</small>
              </div>
            </div>
          </div>

          <div className="table-panel">
            <div className="roulette-table">
              <button
                className={`zero ${population.recommendation.covered.includes(0) ? 'is-covered' : ''}`}
                type="button"
              >
                0
              </button>
              <div className="number-grid">
                {TABLE_ROWS.flatMap((row) =>
                  row.map((number) => (
                    <button
                      className={`${getNumberColor(number)} ${
                        population.recommendation.covered.includes(number) ? 'is-covered' : ''
                      } ${population.recommendation.center === number ? 'is-center' : ''}`}
                      key={number}
                      type="button"
                    >
                      {number}
                    </button>
                  )),
                )}
              </div>
            </div>

            <div className="history-editor">
              <div className="smart-card">
                <div>
                  <span>Zona de pouso</span>
                  <strong>
                    {population.recommendation.landingSpan} vizinhos / centro{' '}
                    {population.recommendation.landingCenter}
                  </strong>
                </div>
                <p>
                  Região {population.recommendation.landingNumbers.join(', ')}. Consenso{' '}
                  {formatPercent(population.recommendation.consensus)}. Lift regional{' '}
                  {formatSignedPercent(population.recommendation.landingLift)}. Nucleo{' '}
                  {formatSignedPercent(population.recommendation.landingCoreLift)}. Memoria{' '}
                  {formatSignedPercent(population.recommendation.landingMemoryLift)}. Confiança{' '}
                  {formatPercent(population.recommendation.confidence)}. +{FIXED_SPAN} fixo.
                </p>
              </div>

              <div className="smart-card smart-card--judge">
                <div>
                  <span>Juiz MiroFish</span>
                  <strong>
                    {population.recommendation.judge.label} / Campeao{' '}
                    {population.recommendation.judge.championName}
                  </strong>
                </div>
                <p>
                  Walk-forward {formatPercent(population.recommendation.judge.hitRate)}. Calibrado{' '}
                  {formatPercent(population.recommendation.judge.calibratedProbability)}. Breakeven{' '}
                  {formatPercent(population.recommendation.judge.breakEven)}. Mesa{' '}
                  {formatPercent(population.recommendation.judge.stability)}.{' '}
                  {population.recommendation.judge.reason}
                </p>
              </div>

              <div className="section-title">
                <span>Historico</span>
                <div>
                  <button onClick={loadDemo} type="button">
                    Exemplo
                  </button>
                  <button onClick={resetAll} type="button">
                    Limpar
                  </button>
                </div>
              </div>
              <textarea
                onChange={(event) => updateState({ historyText: event.target.value })}
                placeholder="Cole ou digite os numeros: 15, 27, 25..."
                value={savedState.historyText}
              />
              <div className="last-results">
                {lastTen.length ? (
                  lastTen.map((number, index) => (
                    <span className={getNumberColor(number)} key={`${number}-${index}`}>
                      {number}
                    </span>
                  ))
                ) : (
                  <small>Nenhum giro carregado</small>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'seed' && (
        <section className="workspace workspace--seed">
          <article className="seed-card">
            <div className="section-title">
              <span>Seed do grafico</span>
              <div>
                <button
                  onClick={() =>
                    updateState({
                      seedText: SAMPLE_SEED_TEXT,
                      seedFields: seedToFields(parseSeedText(SAMPLE_SEED_TEXT)),
                    })
                  }
                  type="button"
                >
                  Print exemplo
                </button>
                <button
                  onClick={() =>
                    updateState({
                      seedText: '',
                      seedFields: DEFAULT_STATE.seedFields,
                    })
                  }
                  type="button"
                >
                  Limpar
                </button>
              </div>
            </div>
            <div className="seed-form">
              <SeedNumberGroup
                group="colors"
                labels={['Vermelho', 'Preto', 'Verde']}
                onChange={updateSeedField}
                values={seedFields.colors}
              />
              <SeedNumberGroup
                group="parity"
                labels={['Pares', 'Impares']}
                onChange={updateSeedField}
                values={seedFields.parity}
              />
              <SeedNumberGroup
                group="ranges"
                labels={['1-18', '19-36']}
                onChange={updateSeedField}
                values={seedFields.ranges}
              />
              <SeedNumberGroup
                group="dozens"
                labels={['Duzia 1', 'Duzia 2', 'Duzia 3']}
                onChange={updateSeedField}
                values={seedFields.dozens}
              />
              <SeedNumberGroup
                group="columns"
                labels={['Coluna 1', 'Coluna 2', 'Coluna 3']}
                onChange={updateSeedField}
                values={seedFields.columns}
              />
            </div>
            <textarea
              onChange={(event) => updateState({ seedText: event.target.value })}
              placeholder="Opcional: cole os ultimos numeros ou um texto do print. Ex: ultimos 31 3 34 10 11 33 29 17 3 25 23"
              value={savedState.seedText}
            />
            <div className="seed-actions">
              <button
                onClick={() => {
                  if (!seed.lastNumbers.length) {
                    return
                  }
                  const separator = savedState.historyText.trim() ? ', ' : ''
                  updateState({
                    historyText: `${savedState.historyText.trim()}${separator}${seed.lastNumbers.join(', ')}`,
                  })
                }}
                type="button"
              >
                Adicionar ultimos ao historico
              </button>
              <button
                onClick={() => {
                  updateState({
                    seedText: SAMPLE_SEED_TEXT,
                    seedFields: seedToFields(parseSeedText(SAMPLE_SEED_TEXT)),
                    historyText: parseSeedText(SAMPLE_SEED_TEXT).lastNumbers.join(', '),
                    paperLog: [],
                  })
                }}
                type="button"
              >
                Iniciar com o print
              </button>
            </div>
            <p className="risk-note">
              Esse seed da peso inicial aos agentes. Depois de cada rodada real, o historico passa a
              mandar mais que o print.
            </p>
          </article>

          <article className="seed-card">
            <div className="section-title">
              <span>Dados lidos</span>
            </div>
            <div className="seed-grid">
              <Metric label="Ultimos" value={seed.lastNumbers.length} />
              <Metric label="Cores" value={seed.colors ? 'ok' : 'vazio'} />
              <Metric label="Duzias" value={seed.dozens ? 'ok' : 'vazio'} />
              <Metric label="Colunas" value={seed.columns ? 'ok' : 'vazio'} />
            </div>
            <div className="audit-list">
              <SeedLine label="Cores" values={seed.colors} names={['Vermelho', 'Preto', 'Verde']} />
              <SeedLine label="Paridade" values={seed.parity} names={['Pares', 'Impares']} />
              <SeedLine label="Faixas" values={seed.ranges} names={['1-18', '19-36']} />
              <SeedLine label="Duzias" values={seed.dozens} names={['1.A', '2.A', '3.A']} />
              <SeedLine label="Colunas" values={seed.columns} names={['1.A', '2.A', '3.A']} />
              <div>
                <span>Ultimos numeros</span>
                <strong>{seed.lastNumbers.length ? seed.lastNumbers.join(', ') : 'nenhum'}</strong>
              </div>
            </div>
          </article>
        </section>
      )}

      {activeTab === 'agentes' && (
        <section className="workspace">
          <div className="agent-grid">
            {population.agents.map((agent) => (
              <article className="agent-card" key={agent.id}>
                <div>
                  <span className="agent-card__rank">#{agent.rank}</span>
                  <h2>{agent.name}</h2>
                  <p>{agent.signal}</p>
                </div>
                <strong>{formatPercent(agent.weight)}</strong>
                <div className="agent-card__bar">
                  <span style={{ width: `${Math.max(agent.weight * 100, 3)}%` }} />
                </div>
                <dl>
                  <div>
                    <dt>Palpite</dt>
                    <dd>{agent.center}</dd>
                  </div>
                  <div>
                    <dt>Score</dt>
                    <dd>{agent.score.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt>Massa</dt>
                    <dd>{formatPercent(agent.mass)}</dd>
                  </div>
                  <div>
                    <dt>ROI</dt>
                    <dd>{formatSignedPercent(agent.roiEstimate)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'teste' && (
        <section className="workspace workspace--test">
          <article className="paper-card">
            <div className="section-title">
              <span>Paper test</span>
              <button onClick={() => updateState({ paperLog: [] })} type="button">
                Zerar
              </button>
            </div>
            <div className="paper-score">
              <Metric label="Rodadas" value={savedState.paperLog.length} />
              <Metric label="Acertos" value={paperSummary.wins} />
              <Metric label="Resultado" value={formatMoney(paperSummary.net)} />
              <Metric label="Banca" value={formatMoney(savedState.bankroll + paperSummary.net)} />
            </div>
            <div className="progress-rail">
              <span style={{ width: `${Math.min(savedState.paperLog.length, 10) * 10}%` }} />
            </div>
            <p className="risk-note">
              Use as primeiras 10 rodadas como ensaio de fluxo. So conte como entrada quando o
              painel disser jogar; o restante fica registrado como nao jogo.
            </p>
            <div className="audit-list">
              <div>
                <span>Entradas reais</span>
                <strong>{paperSummary.bets}</strong>
              </div>
              <div>
                <span>Evitou perdas</span>
                <strong>{paperSummary.avoidedLosses}</strong>
              </div>
              <div>
                <span>Perdeu chances</span>
                <strong>{paperSummary.missedChances}</strong>
              </div>
            </div>
            <div className="paper-log">
              {savedState.paperLog.length ? (
                savedState.paperLog.slice(0, 10).map((entry) => (
                  <div className="paper-row" key={entry.id}>
                    <span
                      className={
                        entry.action === 'bet'
                          ? entry.hit
                            ? 'hit'
                            : 'miss'
                          : (entry.wouldNet ?? 0) <= 0
                            ? 'hit'
                            : 'miss'
                      }
                    >
                      {entry.action === 'bet'
                        ? entry.hit
                          ? 'Ganhou'
                          : 'Perdeu'
                        : (entry.wouldNet ?? 0) <= 0
                          ? 'Evitou perda'
                          : 'Perdeu chance'}
                    </span>
                    <strong>
                      {entry.center} +{entry.span ?? Math.max((entry.covered.length - 1) / 2, 0)} / saiu{' '}
                      {entry.actual}
                    </strong>
                    <em>{formatMoney(entry.action === 'bet' ? entry.net : (entry.wouldNet ?? entry.net))}</em>
                  </div>
                ))
              ) : (
                <small>As rodadas lancadas aparecem aqui.</small>
              )}
            </div>
          </article>

          <article className="paper-card">
            <div className="section-title">
              <span>Backtest do historico</span>
            </div>
            <div className="paper-score">
              <Metric label="Apostas" value={backtest.bets} />
              <Metric label="Acertos" value={backtest.wins} />
              <Metric label="Nao jogos" value={backtest.skips} />
              <Metric label="ROI" value={formatSignedPercent(backtest.roi)} />
            </div>
            <div className="audit-list">
              <div>
                <span>Cobertura media</span>
                <strong>{backtest.averageCoverage.toFixed(1)} numeros</strong>
              </div>
              <div>
                <span>Melhor controle</span>
                <strong>{formatMoney(backtest.randomControl)}</strong>
              </div>
              <div>
                <span>Maior queda</span>
                <strong>{formatMoney(backtest.drawdown)}</strong>
              </div>
            </div>
          </article>
        </section>
      )}
    </main>
  )
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function OutcomeBanner({ entry }) {
  const headline =
    entry.action === 'bet'
      ? entry.hit
        ? 'Ganhou essa'
        : 'Perdeu essa'
      : (entry.wouldNet ?? 0) <= 0
        ? 'Nao jogou: evitou perda'
        : 'Nao jogou: perdeu chance'
  const tone =
    entry.action === 'bet'
      ? entry.hit
        ? 'outcome-banner--hit'
        : 'outcome-banner--miss'
      : (entry.wouldNet ?? 0) <= 0
        ? 'outcome-banner--hit'
        : 'outcome-banner--miss'
  const value = entry.action === 'bet' ? entry.net : (entry.wouldNet ?? entry.net)
  const span = entry.span ?? Math.max((entry.covered.length - 1) / 2, 0)

  return (
    <div className={`outcome-banner ${tone}`}>
      <div>
        <span>Ultima rodada</span>
        <strong>{headline}</strong>
      </div>
      <p>
        Escolha {entry.center} +{span} cobria {entry.covered.length} numeros. Saiu{' '}
        <b>{entry.actual}</b>. {entry.action === 'bet' ? 'Resultado' : 'Nao jogo simulado'}:{' '}
        <b>{formatMoney(value)}</b>.
      </p>
    </div>
  )
}

function SeedLine({ label, values, names }) {
  const text = values
    ? names.map((name, index) => `${name}: ${values[index] ?? 0}%`).join(' | ')
    : 'nenhum dado'

  return (
    <div>
      <span>{label}</span>
      <strong>{text}</strong>
    </div>
  )
}

function SeedNumberGroup({ group, labels, onChange, values }) {
  return (
    <fieldset className="seed-section">
      <legend>{groupLabel(group)}</legend>
      <div>
        {labels.map((label, index) => (
          <label key={label}>
            {label}
            <input
              inputMode="decimal"
              max="100"
              min="0"
              onChange={(event) => onChange(group, index, event.target.value)}
              placeholder="%"
              step="0.1"
              type="number"
              value={values[index]}
            />
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function groupLabel(group) {
  const labels = {
    colors: 'Cores',
    parity: 'Paridade',
    ranges: 'Faixas',
    dozens: 'Duzias',
    columns: 'Colunas',
  }
  return labels[group]
}

function useLocalStorageState(key, fallback) {
  const [state, setState] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key)
      return stored ? { ...fallback, ...JSON.parse(stored) } : fallback
    } catch {
      return fallback
    }
  })

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(state))
  }, [key, state])

  return [state, setState]
}

function parseNumbers(text) {
  return text
    .split(/[^0-9]+/u)
    .filter(Boolean)
    .map(Number)
    .filter((number) => Number.isInteger(number) && number >= 0 && number <= 36)
}

function parseSeedText(text) {
  const normalized = stripAccents(text.toLowerCase())
  const tokens = normalized.match(/1-18|19-36|[a-z]+|[0-9]+(?:[.,][0-9]+)?/gu) ?? []
  const seed = {
    colors: null,
    parity: null,
    ranges: null,
    dozens: null,
    columns: null,
    lastNumbers: [],
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const next = () => readPercent(tokens[index + 1])

    if (token.startsWith('vermel')) {
      seed.colors = seed.colors ?? [0, 0, 0]
      seed.colors[0] = next()
    }
    if (token === 'preto' || token === 'pretos') {
      seed.colors = seed.colors ?? [0, 0, 0]
      seed.colors[1] = next()
    }
    if (token === 'verde' || token === 'zero') {
      seed.colors = seed.colors ?? [0, 0, 0]
      seed.colors[2] = next()
    }
    if (token === 'pares' || token === 'par') {
      seed.parity = seed.parity ?? [0, 0]
      seed.parity[0] = next()
    }
    if (token === 'impares' || token === 'impar') {
      seed.parity = seed.parity ?? [0, 0]
      seed.parity[1] = next()
    }
    if (token === '1-18') {
      seed.ranges = seed.ranges ?? [0, 0]
      seed.ranges[0] = next()
    }
    if (token === '19-36') {
      seed.ranges = seed.ranges ?? [0, 0]
      seed.ranges[1] = next()
    }
    if (token.startsWith('duzia')) {
      seed.dozens = readFollowingPercents(tokens, index + 1, 3)
    }
    if (token.startsWith('coluna')) {
      seed.columns = readFollowingPercents(tokens, index + 1, 3)
    }
    if (token.startsWith('ultimo')) {
      seed.lastNumbers = readFollowingNumbers(tokens, index + 1)
    }
  }

  return seed
}

function parseSeedFields(fields) {
  return {
    colors: parseFieldGroup(fields.colors, 3),
    parity: parseFieldGroup(fields.parity, 2),
    ranges: parseFieldGroup(fields.ranges, 2),
    dozens: parseFieldGroup(fields.dozens, 3),
    columns: parseFieldGroup(fields.columns, 3),
    lastNumbers: [],
  }
}

function mergeSeeds(textSeed, fieldSeed) {
  return {
    colors: fieldSeed.colors ?? textSeed.colors,
    parity: fieldSeed.parity ?? textSeed.parity,
    ranges: fieldSeed.ranges ?? textSeed.ranges,
    dozens: fieldSeed.dozens ?? textSeed.dozens,
    columns: fieldSeed.columns ?? textSeed.columns,
    lastNumbers: textSeed.lastNumbers,
  }
}

function seedToFields(seed) {
  return {
    colors: valuesToFieldGroup(seed.colors, 3),
    parity: valuesToFieldGroup(seed.parity, 2),
    ranges: valuesToFieldGroup(seed.ranges, 2),
    dozens: valuesToFieldGroup(seed.dozens, 3),
    columns: valuesToFieldGroup(seed.columns, 3),
  }
}

function buildSeedDistribution(seed) {
  const hasSeed =
    seed.colors || seed.parity || seed.ranges || seed.dozens || seed.columns || seed.lastNumbers.length

  if (!hasSeed) {
    return null
  }

  const scores = Array(NUMBER_COUNT).fill(0.8)

  for (let number = 0; number < NUMBER_COUNT; number += 1) {
    if (seed.colors) {
      const colorIndex = number === 0 ? 2 : RED_NUMBERS.has(number) ? 0 : 1
      scores[number] += (seed.colors[colorIndex] ?? 0) / 18
    }
    if (seed.parity && number !== 0) {
      scores[number] += (seed.parity[number % 2 === 0 ? 0 : 1] ?? 0) / 24
    }
    if (seed.ranges && number !== 0) {
      scores[number] += (seed.ranges[number <= 18 ? 0 : 1] ?? 0) / 24
    }
    if (seed.dozens && number !== 0) {
      scores[number] += (seed.dozens[Math.floor((number - 1) / 12)] ?? 0) / 16
    }
    if (seed.columns && number !== 0) {
      const columnIndex = (number - 1) % 3
      scores[number] += (seed.columns[columnIndex] ?? 0) / 16
    }
  }

  seed.lastNumbers.forEach((number, index) => {
    const recency = seed.lastNumbers.length - index
    scores[number] += 1.2 + recency / 8
    getCoveredNumbers(number, 1).forEach((near) => {
      scores[near] += 0.35
    })
  })

  return smoothOnWheel(scores, 0.35)
}

function buildPopulation(history, span = FIXED_SPAN, seedDistribution = null, options = {}) {
  const withJudge = options.withJudge ?? true
  const scores = Object.fromEntries(AGENTS.map((agent) => [agent.id, 0]))
  const context = { seedDistribution }

  for (let index = 1; index < history.length; index += 1) {
    const prefix = history.slice(0, index)
    const actual = history[index]

    AGENTS.forEach((agent) => {
      const probability = agent.predict(prefix, context)[actual] ?? UNIFORM_PROBABILITY
      const relativeScore = Math.log(Math.max(probability, 0.000001) / UNIFORM_PROBABILITY)
      scores[agent.id] = scores[agent.id] * 0.985 + clamp(relativeScore, -1.5, 1.5)
    })
  }

  const agentRows = AGENTS.map((agent) => {
    const probabilities = agent.predict(history, context)
    const center = findBestCenter(probabilities, span)
    const covered = getCoveredNumbers(center, span)
    const mass = covered.reduce((sum, number) => sum + probabilities[number], 0)
    return {
      ...agent,
      probabilities,
      center,
      covered,
      mass,
      roiEstimate: estimateRoi(mass, covered.length),
      score: scores[agent.id],
    }
  })

  const weights = softmax(agentRows.map((agent) => agent.score), 0.7)
  const combined = normalize(
    agentRows.reduce(
      (total, agent, index) =>
        total.map((value, number) => value + agent.probabilities[number] * weights[index]),
      Array(NUMBER_COUNT).fill(0),
    ),
  )
  const stabilized = normalize(combined.map((value) => value * 0.94 + UNIFORM_PROBABILITY * 0.06))
  const activeSpan = span
  const landingCoverage = findLandingCoverage(stabilized, history, activeSpan)
  const center = landingCoverage.center
  const covered = landingCoverage.covered
  const mass = covered.reduce((sum, number) => sum + stabilized[number], 0)
  const baseline = covered.length / NUMBER_COUNT
  const breakEven = covered.length / 36
  const edge = mass - baseline
  const roiEstimate = estimateRoi(mass, covered.length)
  const entropyScore = 1 - entropy(stabilized) / Math.log(NUMBER_COUNT)
  const consensus = calculateConsensus(agentRows, weights, covered)
  const regionalQuality = clamp(
    Math.max(landingCoverage.lift, 0) * 0.45 +
      Math.max(landingCoverage.contrast, 0) * NUMBER_COUNT * 0.7 +
      landingCoverage.fieldAgreement * 0.22 +
      Math.max(landingCoverage.coreLift, 0) * 0.24 +
      Math.max(landingCoverage.memoryLift, 0) * 0.2,
    0,
    1,
  )
  const confidence = clamp(
    entropyScore * 1.05 + Math.max(edge, 0) * 2.05 + consensus * 0.32 + regionalQuality * 0.28,
    0,
    1,
  )
  const smartCoverage = findSmartCoverage(stabilized)
  const leader = agentRows[weights.indexOf(Math.max(...weights))]
  const playScore =
    roiEstimate * 0.5 +
    confidence * 0.3 +
    Math.max(landingCoverage.lift, 0) * 0.14 +
    landingCoverage.fieldAgreement * 0.08 +
    Math.max(landingCoverage.memoryLift, 0) * 0.09
  const preliminaryAllow =
    history.length >= 10 && roiEstimate >= 0.018 && confidence >= 0.36 && playScore >= 0.16
  const judge = withJudge
    ? buildJudge({
        confidence,
        covered,
        history,
        landingCoverage,
        mass,
        playScore,
        preliminaryAllow,
        roiEstimate,
        seedDistribution,
        span: activeSpan,
      })
    : buildShadowJudge({
        confidence,
        history,
        mass,
        playScore,
        preliminaryAllow,
        roiEstimate,
      })
  const mode = judge.allow ? 'bet' : 'hold'
  const decision =
    mode === 'bet'
      ? {
          label: `JOGUE AGORA: ${center} +${activeSpan}`,
          tone: 'play',
        }
      : {
          label: 'NAO JOGUE AGORA',
          tone: 'skip',
        }

  const message =
    mode === 'bet'
      ? `Populacao inclinada para ${leader.name}. ${judge.reason}`
      : history.length < 10
        ? 'Carregue pelo menos 10 giros para liberar decisao de jogo.'
        : judge.reason

  return {
    probabilities: stabilized,
    recommendation: {
      center,
      covered,
      edge,
      roiEstimate,
      breakEven,
      confidence,
      consensus,
      decisionLabel: decision.label,
      decisionTone: decision.tone,
      smartCenter: smartCoverage.center,
      smartSpan: smartCoverage.span,
      smartMass: smartCoverage.mass,
      smartRoi: smartCoverage.roiEstimate,
      landingCenter: landingCoverage.center,
      landingSpan: landingCoverage.span,
      landingMass: landingCoverage.mass,
      landingNumbers: landingCoverage.covered,
      landingLift: landingCoverage.lift,
      landingContrast: landingCoverage.contrast,
      landingFieldAgreement: landingCoverage.fieldAgreement,
      landingCoreLift: landingCoverage.coreLift,
      landingMemoryLift: landingCoverage.memoryLift,
      landingRimGap: landingCoverage.rimGap,
      activeSpan,
      fixedSpan: true,
      judge,
      mass,
      mode,
      message,
      preliminaryAllow,
      playScore,
    },
    agents: agentRows
      .map((agent, index) => ({ ...agent, weight: weights[index] }))
      .sort((left, right) => right.weight - left.weight)
      .map((agent, index) => ({ ...agent, rank: index + 1 })),
  }
}

function buildJudge({
  confidence,
  covered,
  history,
  landingCoverage,
  mass,
  playScore,
  preliminaryAllow,
  roiEstimate,
  seedDistribution,
  span,
}) {
  if (history.length < 12) {
    return buildShadowJudge({
      confidence,
      history,
      mass,
      playScore,
      preliminaryAllow: false,
      reason: 'Juiz aguardando pelo menos 12 giros para medir o comportamento da mesa.',
      roiEstimate,
    })
  }

  const records = collectWalkForwardRecords(history, span, seedDistribution)
  const sampleSize = records.length
  const hits = records.filter((record) => record.hit).length
  const hitRate = sampleSize ? hits / sampleSize : 0
  const predictedMean = average(records.map((record) => record.mass), BREAK_EVEN_PROBABILITY)
  const empiricalRate =
    sampleSize > 0
      ? (hits + BREAK_EVEN_PROBABILITY * 10) / (sampleSize + 10)
      : BREAK_EVEN_PROBABILITY
  const calibrationError = Math.abs(predictedMean - empiricalRate)
  const calibratedProbability = clamp(
    mass * 0.5 +
      empiricalRate * 0.28 +
      (landingCoverage.memoryRate ?? BREAK_EVEN_PROBABILITY) * 0.18 +
      landingCoverage.fieldAgreement * 0.025 -
      calibrationError * 0.34,
    0,
    1,
  )
  const modelNet = records.reduce((sum, record) => sum + record.net, 0)
  const modelWager = records.reduce((sum, record) => sum + record.wager, 0)
  const modelRoi = modelWager ? modelNet / modelWager : 0
  const stability = calculateRegimeStability(history)
  const champion = rankChampion(history, span, seedDistribution)
  const championGap = modelRoi - champion.roi
  const margin = calibratedProbability - BREAK_EVEN_PROBABILITY
  const judgeScore = clamp(
    margin * 7.2 +
      hitRate * 0.24 +
      Math.max(modelRoi, -0.4) * 0.16 +
      stability * 0.18 +
      (championGap >= -0.12 ? 0.12 : -0.1) +
      (preliminaryAllow ? 0.14 : -0.06),
    0,
    1,
  )
  const allow =
    preliminaryAllow &&
    sampleSize >= 8 &&
    calibratedProbability >= BREAK_EVEN_PROBABILITY + 0.006 &&
    stability >= 0.34 &&
    championGap >= -0.18 &&
    judgeScore >= 0.52
  const reason = explainJudge({
    allow,
    calibratedProbability,
    champion,
    championGap,
    judgeScore,
    preliminaryAllow,
    stability,
  })

  return {
    allow,
    breakEven: BREAK_EVEN_PROBABILITY,
    calibratedProbability,
    championName: champion.name,
    championRoi: champion.roi,
    confidence,
    hitRate,
    label: allow ? 'APROVADO' : 'BLOQUEADO',
    modelRoi,
    predictedMean,
    reason,
    sampleSize,
    score: judgeScore,
    stability,
    wageredNumbers: covered.length,
  }
}

function buildShadowJudge({
  confidence,
  history,
  mass,
  playScore,
  preliminaryAllow,
  reason = '',
  roiEstimate,
}) {
  const score = clamp(
    (mass - BREAK_EVEN_PROBABILITY) * 6 + confidence * 0.26 + playScore * 0.3 + (preliminaryAllow ? 0.16 : 0),
    0,
    1,
  )

  return {
    allow: preliminaryAllow,
    breakEven: BREAK_EVEN_PROBABILITY,
    calibratedProbability: mass,
    championName: 'MiroFish',
    championRoi: roiEstimate,
    confidence,
    hitRate: history.length ? mass : 0,
    label: preliminaryAllow ? 'PRE-APROVADO' : 'BLOQUEADO',
    modelRoi: roiEstimate,
    predictedMean: mass,
    reason: reason || (preliminaryAllow ? 'Pre-filtro matematico positivo.' : 'Pre-filtro matematico abaixo do corte.'),
    sampleSize: 0,
    score,
    stability: history.length >= 12 ? calculateRegimeStability(history) : 0,
    wageredNumbers: FIXED_COVERAGE,
  }
}

function collectWalkForwardRecords(history, span, seedDistribution) {
  const start = Math.max(10, history.length - WALK_FORWARD_WINDOW)
  const records = []

  for (let index = start; index < history.length; index += 1) {
    const prefix = history.slice(0, index)
    const actual = history[index]
    const recommendation = buildPopulation(prefix, span, seedDistribution, { withJudge: false }).recommendation
    records.push({
      hit: recommendation.covered.includes(actual),
      mass: recommendation.mass,
      net: settleRoulette(recommendation.covered, actual, 1),
      preliminaryAllow: recommendation.preliminaryAllow,
      wager: recommendation.covered.length,
    })
  }

  return records
}

function rankChampion(history, span, seedDistribution) {
  if (history.length < 12) {
    return { hitRate: 0, name: 'MiroFish', roi: 0, score: 0 }
  }

  const context = { seedDistribution }
  const start = Math.max(10, history.length - Math.min(WALK_FORWARD_WINDOW, 28))
  const candidates = AGENTS.filter((agent) => agent.id !== 'skeptic').map((agent) => {
    let hits = 0
    let net = 0
    let wagered = 0
    let predicted = 0
    let total = 0

    for (let index = start; index < history.length; index += 1) {
      const prefix = history.slice(0, index)
      const actual = history[index]
      const probabilities = agent.predict(prefix, context)
      const coverage = findLandingCoverage(probabilities, prefix, span)
      const hit = coverage.covered.includes(actual)
      hits += hit ? 1 : 0
      net += settleRoulette(coverage.covered, actual, 1)
      wagered += coverage.covered.length
      predicted += coverage.mass
      total += 1
    }

    const hitRate = total ? hits / total : 0
    const roi = wagered ? net / wagered : 0
    const predictedMean = total ? predicted / total : BREAK_EVEN_PROBABILITY
    const score = hitRate * 0.48 + clamp(roi, -1, 1) * 0.3 + predictedMean * 0.22

    return {
      hitRate,
      name: agent.name,
      roi,
      score,
    }
  })

  return candidates.sort((left, right) => right.score - left.score)[0] ?? {
    hitRate: 0,
    name: 'MiroFish',
    roi: 0,
    score: 0,
  }
}

function explainJudge({
  allow,
  calibratedProbability,
  champion,
  championGap,
  judgeScore,
  preliminaryAllow,
  stability,
}) {
  if (allow) {
    return `Juiz aprovou: probabilidade calibrada acima do breakeven e mesa estavel.`
  }
  if (!preliminaryAllow) {
    return 'Juiz bloqueou: os sinais brutos ainda nao passaram o pre-filtro.'
  }
  if (calibratedProbability < BREAK_EVEN_PROBABILITY + 0.006) {
    return `Juiz bloqueou: calibrado ${formatPercent(calibratedProbability)} fica perto do breakeven.`
  }
  if (stability < 0.34) {
    return 'Juiz bloqueou: mudanca recente na mesa reduziu confianca.'
  }
  if (championGap < -0.18) {
    return `Juiz bloqueou: ${champion.name} esta performando melhor no walk-forward.`
  }
  if (judgeScore < 0.52) {
    return 'Juiz bloqueou: placar combinado ainda nao compensa o risco do +9.'
  }
  return 'Juiz bloqueou: evidencia insuficiente para entrada.'
}

function calculateRegimeStability(history) {
  if (history.length < 32) {
    return 0.55
  }

  const recent = history.slice(-18)
  const previous = history.slice(-54, -18)
  const recentProfile = buildWheelProfile(recent)
  const previousProfile = buildWheelProfile(previous)
  const totalVariation =
    recentProfile.reduce((sum, value, index) => sum + Math.abs(value - previousProfile[index]), 0) / 2

  return clamp(1 - totalVariation * 1.35, 0, 1)
}

function buildWheelProfile(numbers) {
  const scores = Array(NUMBER_COUNT).fill(0.02)

  numbers.forEach((number, index) => {
    const position = WHEEL_ORDER.indexOf(number)
    const weight = 0.6 + (index + 1) / Math.max(numbers.length, 1)
    addWheelKernel(scores, position, weight, 2.1)
  })

  return normalize(scores)
}

function quickBacktestGate(recommendation, history) {
  return (
    recommendation.preliminaryAllow &&
    recommendation.mass >= BREAK_EVEN_PROBABILITY + 0.004 &&
    recommendation.confidence >= 0.35 &&
    calculateRegimeStability(history) >= 0.3
  )
}

function runBacktest(history, span, unit, seedDistribution = null) {
  if (history.length < 12) {
    return {
      bets: 0,
      wins: 0,
      skips: 0,
      net: 0,
      roi: 0,
      averageCoverage: 0,
      randomControl: 0,
      drawdown: 0,
    }
  }

  let bets = 0
  let wins = 0
  let skips = 0
  let net = 0
  let wagered = 0
  let peak = 0
  let drawdown = 0
  let coverageTotal = 0
  let randomControl = 0

  for (let index = 10; index < history.length; index += 1) {
    const prefix = history.slice(0, index)
    const actual = history[index]
    const recommendation = buildPopulation(prefix, span, seedDistribution, { withJudge: false }).recommendation
    const shouldBet = quickBacktestGate(recommendation, prefix)
    const covered = recommendation.covered
    const randomCenter = WHEEL_ORDER[index % WHEEL_ORDER.length]
    const randomCovered = getCoveredNumbers(randomCenter, span)

    if (!shouldBet) {
      skips += 1
    } else {
      bets += 1
      coverageTotal += covered.length
      wagered += covered.length * unit
      const roundNet = settleRoulette(covered, actual, unit)
      net += roundNet
      wins += roundNet > 0 ? 1 : 0
      peak = Math.max(peak, net)
      drawdown = Math.min(drawdown, net - peak)
    }

    randomControl += settleRoulette(randomCovered, actual, unit)
  }

  return {
    bets,
    wins,
    skips,
    net,
    roi: wagered ? net / wagered : 0,
    averageCoverage: bets ? coverageTotal / bets : 0,
    randomControl,
    drawdown,
  }
}

function settlePaperRound({ recommendation, actual, span, unit, historyLength }) {
  const action = historyLength >= 10 && recommendation.mode === 'bet' ? 'bet' : 'skip'
  const covered = recommendation.covered
  const activeSpan = recommendation.activeSpan ?? span
  const wouldNet = settleRoulette(covered, actual, unit)
  const net = action === 'bet' ? wouldNet : 0

  return {
    id: `${Date.now()}-${actual}-${Math.random().toString(16).slice(2)}`,
    action,
    actual,
    center: recommendation.center,
    span: activeSpan,
    covered,
    hit: covered.includes(actual),
    net,
    wouldNet,
    confidence: recommendation.confidence,
    roiEstimate: recommendation.roiEstimate,
  }
}

function settleRoulette(covered, actual, unit) {
  const totalStake = covered.length * unit
  return covered.includes(actual) ? 36 * unit - totalStake : -totalStake
}

function summarizePaper(log) {
  return log.reduce(
    (summary, entry) => {
      const isBet = entry.action === 'bet'
      const avoidedLoss = !isBet && (entry.wouldNet ?? 0) <= 0
      const missedChance = !isBet && (entry.wouldNet ?? 0) > 0

      return {
        avoidedLosses: summary.avoidedLosses + (avoidedLoss ? 1 : 0),
        bets: summary.bets + (isBet ? 1 : 0),
        missedChances: summary.missedChances + (missedChance ? 1 : 0),
        net: summary.net + entry.net,
        skips: summary.skips + (!isBet ? 1 : 0),
        wins: summary.wins + (entry.net > 0 ? 1 : 0),
      }
    },
    { avoidedLosses: 0, bets: 0, missedChances: 0, net: 0, skips: 0, wins: 0 },
  )
}

function predictHot(history) {
  const scores = Array(NUMBER_COUNT).fill(0.35)
  history.forEach((number, index) => {
    const age = history.length - index
    scores[number] += Math.exp(-age / 18)
  })
  return normalize(scores)
}

function predictCold(history) {
  const scores = Array(NUMBER_COUNT).fill(0.4)
  for (let number = 0; number < NUMBER_COUNT; number += 1) {
    const lastIndex = history.lastIndexOf(number)
    scores[number] += lastIndex === -1 ? 4 : Math.sqrt(history.length - lastIndex)
  }
  return normalize(scores)
}

function predictSector(history) {
  const scores = Array(NUMBER_COUNT).fill(0.1)
  history.forEach((number, index) => {
    const position = WHEEL_ORDER.indexOf(number)
    const ageWeight = Math.exp(-(history.length - index) / 24)
    WHEEL_ORDER.forEach((wheelNumber, wheelIndex) => {
      const distance = circularDistance(position, wheelIndex, WHEEL_ORDER.length)
      scores[wheelNumber] += ageWeight * Math.exp(-(distance * distance) / 8)
    })
  })
  return normalize(scores)
}

function predictMarkov(history) {
  if (history.length < 2) {
    return predictHot(history)
  }

  const last = history.at(-1)
  const scores = Array(NUMBER_COUNT).fill(0.3)
  for (let index = 0; index < history.length - 1; index += 1) {
    if (history[index] === last) {
      scores[history[index + 1]] += 3
    }
  }

  return normalize(scores)
}

function predictRhythm(history) {
  if (history.length < 3) {
    return predictSector(history)
  }

  const scores = Array(NUMBER_COUNT).fill(0.2)
  const lastPosition = WHEEL_ORDER.indexOf(history.at(-1))
  const jumps = []

  for (let index = 1; index < history.length; index += 1) {
    const previous = WHEEL_ORDER.indexOf(history[index - 1])
    const current = WHEEL_ORDER.indexOf(history[index])
    jumps.push(mod(current - previous, WHEEL_ORDER.length))
  }

  jumps.slice(-18).forEach((jump, index) => {
    const target = WHEEL_ORDER[mod(lastPosition + jump, WHEEL_ORDER.length)]
    scores[target] += 1 + index / 18
  })

  return smoothOnWheel(scores, 1)
}

function predictTinyLearner(history) {
  const scores = Array(NUMBER_COUNT).fill(0.28)
  if (!history.length) {
    return normalize(scores)
  }

  const transition = Array.from({ length: NUMBER_COUNT }, () => Array(NUMBER_COUNT).fill(0.02))

  for (let index = 1; index < history.length; index += 1) {
    const previous = history[index - 1]
    const actual = history[index]
    const age = Math.exp(-(history.length - index) / 32)
    transition[previous][actual] += 1.6 * age
    getCoveredNumbers(previous, 1).forEach((near) => {
      transition[near][actual] += 0.25 * age
    })
  }

  const last = history.at(-1)
  const previous = history.at(-2) ?? last
  const blended = transition[last].map((value, number) => value * 0.7 + transition[previous][number] * 0.3)
  return smoothOnWheel(blended, 0.55)
}

function predictBayesWheel(history) {
  const scores = Array(NUMBER_COUNT).fill(1)
  if (!history.length) {
    return normalize(scores)
  }

  const recent = history.slice(-54)
  const sectorHits = Array(WHEEL_ORDER.length).fill(0.2)
  recent.forEach((number, index) => {
    const position = WHEEL_ORDER.indexOf(number)
    const ageBoost = 0.35 + (index + 1) / recent.length
    for (let offset = -3; offset <= 3; offset += 1) {
      const target = mod(position + offset, WHEEL_ORDER.length)
      sectorHits[target] += ageBoost / (Math.abs(offset) + 1)
    }
  })

  WHEEL_ORDER.forEach((number, position) => {
    const direct = sectorHits[position]
    const left = sectorHits[mod(position - 1, WHEEL_ORDER.length)]
    const right = sectorHits[mod(position + 1, WHEEL_ORDER.length)]
    scores[number] += direct * 1.4 + (left + right) * 0.35
  })

  return normalize(scores)
}

function predictHarmonicResonance(history) {
  const scores = Array(NUMBER_COUNT).fill(0.22)
  if (!history.length) {
    return normalize(scores)
  }

  const recent = history.slice(-96)

  recent.forEach((number, index) => {
    const position = WHEEL_ORDER.indexOf(number)
    const recency = 0.25 + (index + 1) / recent.length
    addWheelKernel(scores, position, recency * 0.22, 2.6)
  })

  for (let harmonic = 1; harmonic <= 4; harmonic += 1) {
    const wave = circularHarmonic(recent, harmonic)
    const harmonicWeight = harmonic === 1 ? 2.15 : 1.35 / Math.sqrt(harmonic)

    WHEEL_ORDER.forEach((number, position) => {
      const angle = (position / WHEEL_ORDER.length) * Math.PI * 2
      const resonance = (Math.cos(harmonic * angle - wave.phase) + 1) / 2
      scores[number] += resonance * wave.amplitude * harmonicWeight
    })
  }

  return normalize(scores)
}

function predictMirrorScout(history) {
  const scores = Array(NUMBER_COUNT).fill(0.25)
  if (history.length < 4) {
    return predictSector(history)
  }

  const last = history.at(-1)
  const lastPosition = WHEEL_ORDER.indexOf(last)
  const opposite = mod(lastPosition + Math.floor(WHEEL_ORDER.length / 2), WHEEL_ORDER.length)
  const recent = history.slice(-24)

  recent.forEach((number, index) => {
    const position = WHEEL_ORDER.indexOf(number)
    const mirrorPosition = mod(opposite + (position - lastPosition), WHEEL_ORDER.length)
    const reflectedPosition = mod(opposite - (position - lastPosition), WHEEL_ORDER.length)
    const weight = 0.5 + index / Math.max(recent.length, 1)
    scores[WHEEL_ORDER[mirrorPosition]] += weight
    scores[WHEEL_ORDER[reflectedPosition]] += weight * 0.75
  })

  return smoothOnWheel(scores, 0.7)
}

function predictLandingZone(history) {
  const scores = Array(NUMBER_COUNT).fill(0.18)
  if (history.length < 3) {
    return predictSector(history)
  }

  const positions = history.map((number) => WHEEL_ORDER.indexOf(number))
  const lastPosition = positions.at(-1)
  const recentWindow = history.slice(-72)

  recentWindow.forEach((number, index) => {
    const recency = 0.45 + (index + 1) / recentWindow.length
    addWheelKernel(scores, WHEEL_ORDER.indexOf(number), recency * 0.55, 2.4)
  })

  const jumps = []
  for (let index = 1; index < positions.length; index += 1) {
    jumps.push(mod(positions[index] - positions[index - 1], WHEEL_ORDER.length))
  }

  const currentSignature = jumps.slice(-3)
  for (let index = 3; index < jumps.length; index += 1) {
    const pastSignature = jumps.slice(index - 3, index)
    const similarity = signatureSimilarity(currentSignature, pastSignature)
    if (similarity <= 0) {
      continue
    }

    const projectedPosition = mod(lastPosition + jumps[index], WHEEL_ORDER.length)
    addWheelKernel(scores, projectedPosition, similarity * 2.2, 2.2)
  }

  jumps.slice(-18).forEach((jump, index) => {
    const projectedPosition = mod(lastPosition + jump, WHEEL_ORDER.length)
    addWheelKernel(scores, projectedPosition, (0.5 + index / 18) * 0.9, 2.8)
  })

  for (let index = 0; index < history.length - 1; index += 1) {
    const distance = circularDistance(positions[index], lastPosition, WHEEL_ORDER.length)
    if (distance <= 5) {
      const nextPosition = positions[index + 1]
      addWheelKernel(scores, nextPosition, (6 - distance) * 0.48, 2.1)
    }
  }

  const regionalField = buildRegionalField(history)
  regionalField.probabilities.forEach((probability, number) => {
    scores[number] += probability * (2.8 + regionalField.concentration * 3.2)
  })

  return normalize(scores)
}

function addWheelKernel(scores, position, weight, radius) {
  WHEEL_ORDER.forEach((number, wheelIndex) => {
    const distance = circularDistance(position, wheelIndex, WHEEL_ORDER.length)
    const curve = Math.exp(-(distance * distance) / (2 * radius * radius))
    scores[number] += weight * curve
  })
}

function signatureSimilarity(currentSignature, pastSignature) {
  if (!currentSignature.length || currentSignature.length !== pastSignature.length) {
    return 0
  }

  const distance = currentSignature.reduce((sum, jump, index) => {
    const rawDistance = Math.abs(jump - pastSignature[index])
    return sum + Math.min(rawDistance, WHEEL_ORDER.length - rawDistance)
  }, 0)

  return Math.exp(-distance / (currentSignature.length * 4.5))
}

function buildRegionalField(history) {
  const scores = Array(NUMBER_COUNT).fill(0.16)
  if (history.length < 4) {
    return {
      probabilities: normalize(scores),
      concentration: 0,
      projectedNumber: history.at(-1) ?? 0,
    }
  }

  const positions = history.map((number) => WHEEL_ORDER.indexOf(number))
  const lastPosition = positions.at(-1)
  const recentPositions = positions.slice(-64)
  const recentWeights = recentPositions.map((_, index) => 0.35 + (index + 1) / recentPositions.length)
  const sectorMean = circularMean(recentPositions, recentWeights, WHEEL_ORDER.length)

  const jumps = []
  for (let index = 1; index < positions.length; index += 1) {
    jumps.push(mod(positions[index] - positions[index - 1], WHEEL_ORDER.length))
  }
  const recentJumps = jumps.slice(-42)
  const jumpWeights = recentJumps.map((_, index) => 0.4 + (index + 1) / recentJumps.length)
  const jumpMean = circularMean(recentJumps, jumpWeights, WHEEL_ORDER.length)

  const accelerations = []
  for (let index = 1; index < jumps.length; index += 1) {
    accelerations.push(mod(jumps[index] - jumps[index - 1], WHEEL_ORDER.length))
  }
  const recentAccelerations = accelerations.slice(-30)
  const accelerationWeights = recentAccelerations.map(
    (_, index) => 0.35 + (index + 1) / Math.max(recentAccelerations.length, 1),
  )
  const accelerationMean = circularMean(
    recentAccelerations.length ? recentAccelerations : [0],
    recentAccelerations.length ? accelerationWeights : [1],
    WHEEL_ORDER.length,
  )

  const drift = signedCircularOffset(accelerationMean.coordinate, WHEEL_ORDER.length)
  const projectedOffset =
    signedCircularOffset(jumpMean.coordinate, WHEEL_ORDER.length) +
    drift * clamp(accelerationMean.concentration, 0, 0.65) * 0.55
  const projectedPosition = mod(Math.round(lastPosition + projectedOffset), WHEEL_ORDER.length)
  const concentration = clamp(
    jumpMean.concentration * 0.52 + sectorMean.concentration * 0.32 + accelerationMean.concentration * 0.16,
    0,
    1,
  )
  const projectedRadius = clamp(4.8 - concentration * 2.8, 1.45, 4.8)

  addWheelKernel(scores, projectedPosition, 2.9 + concentration * 3.4, projectedRadius)
  addWheelKernel(scores, sectorMean.position, 1.25 + sectorMean.concentration * 3.1, 3.4)

  recentPositions.slice(-18).forEach((position, index) => {
    addWheelKernel(scores, position, (0.24 + index / 36) * (1 + sectorMean.concentration), 2.2)
  })

  return {
    probabilities: normalize(scores),
    concentration,
    projectedNumber: WHEEL_ORDER[projectedPosition],
  }
}

function circularHarmonic(numbers, harmonic) {
  let real = 0
  let imaginary = 0
  let totalWeight = 0

  numbers.forEach((number, index) => {
    const position = WHEEL_ORDER.indexOf(number)
    const angle = harmonic * (position / WHEEL_ORDER.length) * Math.PI * 2
    const weight = 0.3 + (index + 1) / numbers.length
    real += Math.cos(angle) * weight
    imaginary += Math.sin(angle) * weight
    totalWeight += weight
  })

  return {
    amplitude: totalWeight ? Math.sqrt(real * real + imaginary * imaginary) / totalWeight : 0,
    phase: Math.atan2(imaginary, real),
  }
}

function circularMean(values, weights, length) {
  let real = 0
  let imaginary = 0
  let totalWeight = 0

  values.forEach((value, index) => {
    const weight = weights[index] ?? 1
    const angle = (value / length) * Math.PI * 2
    real += Math.cos(angle) * weight
    imaginary += Math.sin(angle) * weight
    totalWeight += weight
  })

  if (!totalWeight) {
    return { position: 0, coordinate: 0, concentration: 0 }
  }

  const angle = Math.atan2(imaginary, real)
  const coordinate = mod((angle / (Math.PI * 2)) * length, length)
  return {
    position: mod(Math.round(coordinate), length),
    coordinate,
    concentration: Math.sqrt(real * real + imaginary * imaginary) / totalWeight,
  }
}

function signedCircularOffset(value, length) {
  const wrapped = mod(value, length)
  return wrapped > length / 2 ? wrapped - length : wrapped
}

function predictSeed(_history, context = {}) {
  return context.seedDistribution ?? predictSkeptic()
}

function predictSkeptic() {
  return Array(NUMBER_COUNT).fill(UNIFORM_PROBABILITY)
}

function findBestCenter(probabilities, span) {
  let bestCenter = 0
  let bestMass = -Infinity

  WHEEL_ORDER.forEach((center) => {
    const mass = getCoveredNumbers(center, span).reduce((sum, number) => sum + probabilities[number], 0)
    if (mass > bestMass) {
      bestMass = mass
      bestCenter = center
    }
  })

  return bestCenter
}

function findSmartCoverage(probabilities) {
  let best = {
    center: 0,
    span: 0,
    mass: probabilities[0],
    roiEstimate: estimateRoi(probabilities[0], 1),
    score: -Infinity,
  }

  for (let span = 0; span <= 9; span += 1) {
    const center = findBestCenter(probabilities, span)
    const covered = getCoveredNumbers(center, span)
    const mass = covered.reduce((sum, number) => sum + probabilities[number], 0)
    const roiEstimate = estimateRoi(mass, covered.length)
    const baselineEdge = mass - covered.length / NUMBER_COUNT
    const score = roiEstimate * 0.72 + baselineEdge * 2.1 - covered.length * 0.003

    if (score > best.score) {
      best = { center, span, mass, roiEstimate, score }
    }
  }

  return best
}

function findLandingCoverage(probabilities, history, fixedSpan = FIXED_SPAN) {
  const evidenceFactor = clamp(history.length / 80, 0.35, 1)
  const regionalField = buildRegionalField(history)
  let best = null

  WHEEL_ORDER.forEach((center) => {
    const covered = getCoveredNumbers(center, fixedSpan)
    const coreSpan = Math.max(2, Math.floor(fixedSpan / 2))
    const core = getCoveredNumbers(center, coreSpan)
    const outerRing = getOuterRingNumbers(center, fixedSpan, Math.min(fixedSpan + 4, 18))
    const mass = covered.reduce((sum, number) => sum + probabilities[number], 0)
    const coreMass = core.reduce((sum, number) => sum + probabilities[number], 0)
    const outerMass = outerRing.reduce((sum, number) => sum + probabilities[number], 0)
    const fieldMass = covered.reduce((sum, number) => sum + regionalField.probabilities[number], 0)
    const memory = measureFixedSectorMemory(history, center, fixedSpan)
    const roiEstimate = estimateRoi(mass, covered.length)
    const baseline = covered.length / NUMBER_COUNT
    const coreBaseline = core.length / NUMBER_COUNT
    const baselineGap = mass - baseline
    const breakEvenGap = mass - covered.length / 36
    const insideAverage = mass / covered.length
    const outsideAverage = outerRing.length ? outerMass / outerRing.length : UNIFORM_PROBABILITY
    const contrast = insideAverage - outsideAverage
    const lift = mass / baseline - 1
    const coreLift = coreMass / coreBaseline - 1
    const fieldAgreement = fieldMass / Math.max(baseline, 0.0001)
    const rimGap = coreMass / core.length - (mass - coreMass) / Math.max(covered.length - core.length, 1)
    const pressure =
      Math.max(lift, 0) * 0.14 +
      Math.max(coreLift, 0) * 0.17 +
      Math.max(memory.lift, 0) * 0.18 +
      Math.max(memory.shortLift, 0) * 0.1 +
      Math.max(contrast, 0) * NUMBER_COUNT * 0.22 +
      Math.max(rimGap, 0) * NUMBER_COUNT * 0.08 +
      fieldAgreement * 0.08 +
      regionalField.concentration * 0.08
    const score =
      (roiEstimate * 0.42 + baselineGap * 0.9 + breakEvenGap * 1.55 + pressure) * evidenceFactor

    if (!best || score > best.score) {
      best = {
        center,
        span: fixedSpan,
        covered,
        mass,
        roiEstimate,
        contrast,
        lift,
        coreLift,
        memoryLift: memory.lift,
        memoryRate: memory.posteriorRate,
        fieldAgreement: clamp(fieldAgreement, 0, 1.8),
        projectedNumber: regionalField.projectedNumber,
        rimGap,
        score,
      }
    }
  })

  return (
    best ?? {
      center: 0,
      span: fixedSpan,
      covered: getCoveredNumbers(0, fixedSpan),
      mass: getCoveredNumbers(0, fixedSpan).reduce((sum, number) => sum + probabilities[number], 0),
      roiEstimate: 0,
      contrast: 0,
      lift: 0,
      coreLift: 0,
      memoryLift: 0,
      memoryRate: 0,
      fieldAgreement: 0,
      projectedNumber: regionalField.projectedNumber,
      rimGap: 0,
      score: 0,
    }
  )
}

function measureFixedSectorMemory(history, center, span) {
  const covered = new Set(getCoveredNumbers(center, span))
  const baseline = covered.size / NUMBER_COUNT
  const priorWeight = 18
  let weightedHits = 0
  let totalWeight = 0
  let shortHits = 0
  let shortTotal = 0

  history.forEach((number, index) => {
    const age = history.length - index - 1
    const weight = Math.exp(-age / 30)
    const isHit = covered.has(number) ? 1 : 0
    weightedHits += isHit * weight
    totalWeight += weight

    if (age < 14) {
      const shortWeight = Math.exp(-age / 7)
      shortHits += isHit * shortWeight
      shortTotal += shortWeight
    }
  })

  const posteriorRate = (baseline * priorWeight + weightedHits) / (priorWeight + totalWeight)
  const shortRate = shortTotal ? shortHits / shortTotal : baseline

  return {
    posteriorRate,
    lift: posteriorRate / baseline - 1,
    shortLift: shortRate / baseline - 1,
  }
}

function calculateConsensus(agentRows, weights, covered) {
  return agentRows.reduce((sum, agent, index) => {
    const agrees = covered.some((number) => agent.covered.includes(number))
    return sum + (agrees ? weights[index] : 0)
  }, 0)
}

function estimateRoi(mass, coveredCount) {
  if (!coveredCount) {
    return 0
  }
  return (36 * mass - coveredCount) / coveredCount
}

function entropy(probabilities) {
  return probabilities.reduce(
    (sum, probability) => sum - (probability > 0 ? probability * Math.log(probability) : 0),
    0,
  )
}

function getCoveredNumbers(center, span) {
  const centerIndex = WHEEL_ORDER.indexOf(center)
  if (centerIndex < 0) {
    return []
  }

  const covered = []
  for (let offset = -span; offset <= span; offset += 1) {
    covered.push(WHEEL_ORDER[mod(centerIndex + offset, WHEEL_ORDER.length)])
  }
  return covered
}

function getOuterRingNumbers(center, innerSpan, outerSpan) {
  const centerIndex = WHEEL_ORDER.indexOf(center)
  if (centerIndex < 0) {
    return []
  }

  const ring = []
  for (let offset = -outerSpan; offset <= outerSpan; offset += 1) {
    if (Math.abs(offset) > innerSpan) {
      ring.push(WHEEL_ORDER[mod(centerIndex + offset, WHEEL_ORDER.length)])
    }
  }
  return ring
}

function smoothOnWheel(scores, strength) {
  const smoothed = Array(NUMBER_COUNT).fill(0)
  WHEEL_ORDER.forEach((number, position) => {
    let value = scores[number]
    for (let offset = 1; offset <= 2; offset += 1) {
      const weight = strength / (offset + 1)
      value += scores[WHEEL_ORDER[mod(position - offset, WHEEL_ORDER.length)]] * weight
      value += scores[WHEEL_ORDER[mod(position + offset, WHEEL_ORDER.length)]] * weight
    }
    smoothed[number] = value
  })
  return normalize(smoothed)
}

function normalize(values) {
  const sum = values.reduce((total, value) => total + Math.max(value, 0), 0)
  if (!sum) {
    return Array(NUMBER_COUNT).fill(UNIFORM_PROBABILITY)
  }
  return values.map((value) => Math.max(value, 0) / sum)
}

function softmax(values, temperature) {
  const max = Math.max(...values)
  const exps = values.map((value) => Math.exp((value - max) * temperature))
  const total = exps.reduce((sum, value) => sum + value, 0)
  return exps.map((value) => value / total)
}

function buildWheelCells(covered) {
  return WHEEL_ORDER.map((number, index) => ({
    number,
    angle: (index / WHEEL_ORDER.length) * 360,
    color: getNumberColor(number),
    isCovered: covered.includes(number),
  }))
}

function getNumberColor(number) {
  if (number === 0) {
    return 'green'
  }
  return RED_NUMBERS.has(number) ? 'red' : 'black'
}

function circularDistance(left, right, length) {
  const direct = Math.abs(left - right)
  return Math.min(direct, length - direct)
}

function mod(value, length) {
  return ((value % length) + length) % length
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function average(values, fallback = 0) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback
}

function stripAccents(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '')
}

function readPercent(value) {
  const number = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(number) ? number : 0
}

function readFollowingPercents(tokens, start, total) {
  const values = []
  for (let index = start; index < tokens.length && values.length < total; index += 1) {
    const value = readPercent(tokens[index])
    if (value > 0 || tokens[index] === '0') {
      values.push(value)
    }
  }
  return values.length ? values : null
}

function readFollowingNumbers(tokens, start) {
  const values = []
  for (let index = start; index < tokens.length; index += 1) {
    const value = Number(tokens[index])
    if (Number.isInteger(value) && value >= 0 && value <= 36) {
      values.push(value)
    }
  }
  return values
}

function parseFieldGroup(values, expectedLength) {
  const numbers = Array.from({ length: expectedLength }, (_, index) => {
    const value = Number(String(values?.[index] ?? '').replace(',', '.'))
    return Number.isFinite(value) ? value : null
  })

  return numbers.some((value) => value !== null)
    ? numbers.map((value) => clamp(value ?? 0, 0, 100))
    : null
}

function valuesToFieldGroup(values, expectedLength) {
  return Array.from({ length: expectedLength }, (_, index) =>
    values?.[index] || values?.[index] === 0 ? String(values[index]) : '',
  )
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`
}

function formatSignedPercent(value) {
  const percent = value * 100
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', {
    currency: 'BRL',
    style: 'currency',
  }).format(value)
}

export default App
