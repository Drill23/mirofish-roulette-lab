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
    id: 'mirror',
    name: 'Mirror scout',
    signal: 'padroes que repetem no espelho',
    predict: predictMirrorScout,
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
  span: 2,
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
    () => buildPopulation(history, savedState.span, seedDistribution),
    [history, savedState.span, seedDistribution],
  )
  const backtest = useMemo(
    () => runBacktest(history, savedState.span, savedState.unit, seedDistribution),
    [history, savedState.span, savedState.unit, seedDistribution],
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
      span: savedState.span,
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
    population.recommendation.mode === 'bet'
      ? 'signal-card--go'
      : population.recommendation.mode === 'paper'
        ? 'signal-card--paper'
        : 'signal-card--hold'

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
            <label>
              Vizinhos
              <input
                max="9"
                min="0"
                onChange={(event) => updateState({ span: Number(event.target.value) })}
                type="range"
                value={savedState.span}
              />
              <span>{savedState.span} para cada lado</span>
            </label>
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
            <Metric label="ROI est." value={formatSignedPercent(population.recommendation.roiEstimate)} />
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
                  <span>Modo inteligente</span>
                  <strong>
                    {population.recommendation.smartSpan} vizinhos / centro{' '}
                    {population.recommendation.smartCenter}
                  </strong>
                </div>
                <p>
                  Consenso {formatPercent(population.recommendation.consensus)}. Quebra-even{' '}
                  {formatPercent(population.recommendation.breakEven)}. Confiança{' '}
                  {formatPercent(population.recommendation.confidence)}.
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
              Use as primeiras 10 rodadas como ensaio de fluxo. Vantagem real pede amostra maior e
              resultado melhor que o controle aleatorio.
            </p>
            <div className="paper-log">
              {savedState.paperLog.length ? (
                savedState.paperLog.slice(0, 10).map((entry) => (
                  <div className="paper-row" key={entry.id}>
                    <span className={entry.hit ? 'hit' : 'miss'}>
                      {entry.action === 'bet'
                        ? entry.hit
                          ? 'Ganhou'
                          : 'Perdeu'
                        : entry.hit
                          ? 'Teria ganho'
                          : 'Teria perdido'}
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
              <Metric label="Skips" value={backtest.skips} />
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
      : entry.hit
        ? 'Teria ganho'
        : 'Teria perdido'
  const tone = entry.hit ? 'outcome-banner--hit' : 'outcome-banner--miss'
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
        <b>{entry.actual}</b>. {entry.action === 'bet' ? 'Resultado' : 'Simulado'}:{' '}
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

function buildPopulation(history, span, seedDistribution = null) {
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
  const center = findBestCenter(stabilized, span)
  const covered = getCoveredNumbers(center, span)
  const mass = covered.reduce((sum, number) => sum + stabilized[number], 0)
  const baseline = covered.length / NUMBER_COUNT
  const breakEven = covered.length / 36
  const edge = mass - baseline
  const roiEstimate = estimateRoi(mass, covered.length)
  const entropyScore = 1 - entropy(stabilized) / Math.log(NUMBER_COUNT)
  const consensus = calculateConsensus(agentRows, weights, covered)
  const confidence = clamp(entropyScore * 1.25 + Math.max(edge, 0) * 2.2 + consensus * 0.35, 0, 1)
  const smartCoverage = findSmartCoverage(stabilized)
  const leader = agentRows[weights.indexOf(Math.max(...weights))]
  const mode =
    history.length < 10 || roiEstimate < 0.015 || confidence < 0.28
      ? 'hold'
      : roiEstimate < 0.08 || confidence < 0.52
        ? 'paper'
        : 'bet'

  const message =
    mode === 'bet'
      ? `Populacao inclinada para ${leader.name}. Sinal acima do ponto de equilibrio.`
      : mode === 'paper'
        ? `Sinal existe, mas ainda e paper. Lider: ${leader.name}; confirme no teste.`
        : history.length < 10
          ? 'Carregue pelo menos 10 giros para os agentes acordarem.'
          : 'Sem vantagem clara contra equilibrio e aleatorio. Melhor observar.'

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
      smartCenter: smartCoverage.center,
      smartSpan: smartCoverage.span,
      smartMass: smartCoverage.mass,
      smartRoi: smartCoverage.roiEstimate,
      mass,
      mode,
      message,
    },
    agents: agentRows
      .map((agent, index) => ({ ...agent, weight: weights[index] }))
      .sort((left, right) => right.weight - left.weight)
      .map((agent, index) => ({ ...agent, rank: index + 1 })),
  }
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
    const recommendation = buildPopulation(prefix, span, seedDistribution).recommendation
    const shouldBet = recommendation.mode !== 'hold'
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
  const action = historyLength >= 10 && recommendation.mode !== 'hold' ? 'bet' : 'observe'
  const covered = action === 'bet' ? recommendation.covered : getCoveredNumbers(recommendation.center, span)
  const wouldNet = settleRoulette(covered, actual, unit)
  const net = action === 'bet' ? wouldNet : 0

  return {
    id: `${Date.now()}-${actual}-${Math.random().toString(16).slice(2)}`,
    action,
    actual,
    center: recommendation.center,
    span,
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
    (summary, entry) => ({
      wins: summary.wins + (entry.net > 0 ? 1 : 0),
      net: summary.net + entry.net,
    }),
    { wins: 0, net: 0 },
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
