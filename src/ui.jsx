import { useCallback, useEffect, useState } from 'react';

const formatDuration = (milliseconds) => {
  if (milliseconds < 1000) return `${milliseconds} ms`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
};

const formatDate = (value) =>
  new Intl.DateTimeFormat('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

function Dashboard() {
  const [runs, setRuns] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastOutput, setLastOutput] = useState('');

  const refreshRuns = useCallback(async () => {
    const response = await fetch('/api/runs');
    if (!response.ok) throw new Error('No se pudieron cargar las ejecuciones.');
    const data = await response.json();
    setRuns(data.runs);
    setIsRunning(data.isRunning);
  }, []);

  useEffect(() => {
    refreshRuns()
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [refreshRuns]);

  async function runTests() {
    setIsRunning(true);
    setError('');
    setLastOutput('');
    try {
      const response = await fetch('/api/runs', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo ejecutar la suite.');
      setLastOutput(result.output);
      await refreshRuns();
    } catch (requestError) {
      setError(requestError.message);
      try {
        await refreshRuns();
      } catch (refreshError) {
        setError(`${requestError.message} ${refreshError.message}`);
      }
    } finally {
      setIsRunning(false);
    }
  }

  const latest = runs[0];
  const totals = runs.reduce(
    (summary, run) => ({
      passed: summary.passed + run.passed,
      failed: summary.failed + run.failed,
      count: summary.count + run.tests.length,
    }),
    { passed: 0, failed: 0, count: 0 },
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Quality Desk inicio">
          <span className="brand-mark">Q</span>
          <span>quality<span className="brand-light">desk</span></span>
        </a>
        <div className="workspace-label">ESPACIO DE TRABAJO</div>
        <div className="workspace-picker"><span className="workspace-dot" /> Web Store <span className="chevron">⌄</span></div>
        <nav className="nav-links" aria-label="Navegación principal">
          <a className="nav-link active" href="/"><span>▦</span> Resumen</a>
          <a className="nav-link" href="/planner"><span>✧</span> Planner IA</a>
          <a className="nav-link" href="#runs"><span>◷</span> Ejecuciones</a>
          <a className="nav-link" href="/sample"><span>◇</span> App de ejemplo <span className="external">↗</span></a>
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><span className="help-icon">?</span><strong>¿Primera vez aquí?</strong><p>Ejecuta la suite de ejemplo y explora el reporte.</p><a href="./README.md">Ver guía rápida ↗</a></div>
          <div className="profile"><div className="avatar">QA</div><div><strong>Equipo QA</strong><span>Demo local</span></div><span className="profile-menu">···</span></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">Web Store <span>/</span> <strong>Resumen</strong></div>
          <div className="topbar-right"><span className="environment"><i /> Ambiente local</span><span className="top-avatar">QA</span></div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div><div className="eyebrow">CENTRO DE CALIDAD</div><h1>Resumen de pruebas</h1><p>Monitorea la salud de tus flujos y resultados automatizados.</p></div>
            <button className="primary-button" onClick={runTests} disabled={isRunning}>
              <span className={isRunning ? 'button-spinner' : 'play-icon'}>{isRunning ? '' : '▶'}</span>
              {isRunning ? 'Ejecutando pruebas…' : 'Ejecutar suite'}
            </button>
          </section>

          {error && <div className="error-banner" role="alert">{error}</div>}
          {isRunning && <div className="running-banner"><span className="button-spinner dark" /> Playwright está ejecutando los tests. Esto puede tomar unos segundos.</div>}

          <section className="stat-grid" aria-label="Resumen de resultados">
            <article className="stat-card"><div className="stat-top"><span>Total de tests</span><span className="stat-icon violet">▦</span></div><strong>{latest ? latest.tests.length : 3}</strong><small>{latest ? 'en la última ejecución' : 'en la suite de ejemplo'}</small></article>
            <article className="stat-card"><div className="stat-top"><span>Tests aprobados</span><span className="stat-icon green">✓</span></div><strong>{latest?.passed ?? '—'}</strong><small>{latest ? 'última ejecución' : 'aún sin ejecutar'}</small></article>
            <article className="stat-card"><div className="stat-top"><span>Tests fallidos</span><span className="stat-icon red">×</span></div><strong>{latest?.failed ?? '—'}</strong><small>{latest ? 'última ejecución' : 'aún sin ejecutar'}</small></article>
            <article className="stat-card"><div className="stat-top"><span>Tiempo última suite</span><span className="stat-icon blue">◷</span></div><strong className="duration-stat">{latest ? formatDuration(latest.duration) : '—'}</strong><small>{latest ? 'duración total' : 'aún sin ejecutar'}</small></article>
          </section>

          <section className="content-grid">
            <article className="panel latest-panel">
              <div className="panel-heading"><div><h2>Última ejecución</h2><p>Resultado más reciente de la suite automatizada</p></div>{latest && <StatusBadge status={latest.status} />}</div>
              {loading ? <div className="empty-state">Cargando resultados…</div> : latest ? (
                <>
                  <div className="run-summary"><div className="run-summary-mark">{latest.status === 'passed' ? '✓' : '!'}</div><div><strong>{latest.status === 'passed' ? 'Todas las pruebas pasaron' : 'Hay pruebas que necesitan atención'}</strong><span>{formatDate(latest.finishedAt)}</span></div><a className="text-link" href="/report" target="_blank" rel="noreferrer">Abrir reporte completo ↗</a></div>
                  <div className="result-breakdown"><span><i className="legend-dot passed" />{latest.passed} aprobadas</span><span><i className="legend-dot failed" />{latest.failed} fallidas</span><span><i className="legend-dot skipped" />{latest.skipped} omitidas</span></div>
                  <div className="test-list">
                    {latest.tests.map((item, index) => <div className="test-row" key={`${item.title}-${index}`}><span className={`test-status ${item.status === 'expected' || item.status === 'passed' ? 'ok' : item.status === 'skipped' ? 'skip' : 'bad'}`}>{item.status === 'expected' || item.status === 'passed' ? '✓' : item.status === 'skipped' ? '–' : '×'}</span><span className="test-title">{item.title}</span><span className="test-duration">{formatDuration(item.duration)}</span></div>)}
                  </div>
                </>
              ) : <div className="empty-state"><span className="empty-icon">◷</span><strong>Tu primer reporte te espera</strong><p>Ejecuta la suite para ver resultados, duración y detalles de cada test.</p><button className="secondary-button" onClick={runTests} disabled={isRunning}>Ejecutar primera suite</button></div>}
            </article>

            <article className="panel activity-panel">
              <div className="panel-heading"><div><h2>Actividad</h2><p>Resumen de tus ejecuciones guardadas</p></div><span className="activity-icon">⌁</span></div>
              <div className="activity-chart" aria-label="Resultados acumulados">
                <div className="chart-number"><strong>{totals.count}</strong><span>tests ejecutados</span></div>
                <div className="chart-bars"><div className="chart-row"><span>Aprobados</span><div className="bar-track"><i className="bar-green" style={{ width: `${totals.count ? (totals.passed / totals.count) * 100 : 0}%` }} /></div><b>{totals.passed}</b></div><div className="chart-row"><span>Fallidos</span><div className="bar-track"><i className="bar-red" style={{ width: `${totals.count ? (totals.failed / totals.count) * 100 : 0}%` }} /></div><b>{totals.failed}</b></div></div>
              </div>
              <div className="activity-note"><span>✦</span><p>Los resultados se guardan localmente en este proyecto.</p></div>
            </article>
          </section>

          <section className="panel history-panel" id="runs">
            <div className="panel-heading"><div><h2>Historial de ejecuciones</h2><p>Las últimas suites ejecutadas desde este panel</p></div><span className="history-count">{runs.length} {runs.length === 1 ? 'ejecución' : 'ejecuciones'}</span></div>
            {runs.length ? <div className="table-wrap"><table><thead><tr><th>ESTADO</th><th>FECHA Y HORA</th><th>RESULTADO</th><th>DURACIÓN</th><th>REPORTE</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td><StatusBadge status={run.status} /></td><td>{formatDate(run.finishedAt)}</td><td><span className="table-passed">{run.passed} aprobadas</span>{run.failed > 0 && <span className="table-failed"> · {run.failed} fallidas</span>}</td><td>{formatDuration(run.duration)}</td><td><a className="table-link" href="/report" target="_blank" rel="noreferrer">Ver reporte ↗</a></td></tr>)}</tbody></table></div> : <div className="history-empty">Las ejecuciones que realices aparecerán aquí.</div>}
          </section>
          {lastOutput && <details className="output-details"><summary>Ver salida de Playwright</summary><pre>{lastOutput}</pre></details>}
          <footer className="page-footer"><span>QUALITY DESK <b>·</b> DEMO LOCAL</span><span>Construido con Playwright</span></footer>
        </div>
      </main>
    </div>
  );
}

function StatusBadge({ status }) {
  return <span className={`status-badge ${status === 'passed' ? 'status-passed' : 'status-failed'}`}><i />{status === 'passed' ? 'Aprobada' : 'Fallida'}</span>;
}

function SampleApp() {
  const [tasks, setTasks] = useState([]);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  function addTask(event) {
    event.preventDefault();
    const title = value.trim();
    if (!title) {
      setError('Escribe una tarea antes de agregarla.');
      return;
    }
    setTasks((current) => [...current, { id: Date.now(), title, complete: false }]);
    setValue('');
    setError('');
  }

  function toggleTask(id) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, complete: !task.complete } : task));
  }

  const pending = tasks.filter((task) => !task.complete).length;

  return <main className="sample-page"><a href="/" className="back-link">← Volver al panel QA</a><section className="sample-card"><div className="sample-logo">✓</div><span className="eyebrow">APLICACIÓN DE PRUEBA</span><h1>Mi lista de tareas</h1><p className="sample-subtitle">Una app pequeña para practicar pruebas end-to-end.</p><form className="task-form" onSubmit={addTask}><label htmlFor="new-task">Nueva tarea</label><div className="task-input-row"><input id="new-task" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Ej. Revisar el formulario" /><button className="primary-button" type="submit">Agregar tarea</button></div>{error && <p className="form-error" role="alert">{error}</p>}</form><div className="task-list-heading"><strong>Tus tareas</strong><span>{pending === 1 ? '1 tarea pendiente' : `${pending} tareas pendientes`}</span></div>{tasks.length ? <ul className="task-list">{tasks.map((task) => <li className={task.complete ? 'completed' : ''} key={task.id}><input type="checkbox" checked={task.complete} onChange={() => toggleTask(task.id)} aria-label={`Completar ${task.title}`} /><span>{task.title}</span></li>)}</ul> : <div className="task-empty">Todavía no hay tareas. ¡Agrega la primera!</div>}{tasks.length > 0 && pending === 0 && <p className="all-done">¡Todo listo!</p>}</section><p className="sample-footnote">Esta app de ejemplo se prueba con Playwright.</p></main>;
}

export function App() {
  return window.location.pathname === '/sample' ? <SampleApp /> : <Dashboard />;
}
