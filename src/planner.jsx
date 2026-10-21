import { useEffect, useState } from 'react';
import './planner.css';
import './planner-live.css';

const initialStory = 'Como usuario, quiero agregar una tarea a mi lista y verla entre mis tareas pendientes.';
const initialUrl = 'http://127.0.0.1:4173/sample';
const actionNames = {
  navigate: 'Abrir la URL objetivo',
  fill: 'Escribir en un campo',
  click: 'Pulsar un elemento',
  'expect-visible': 'Verificar que el elemento aparece',
  'expect-text': 'Verificar texto visible',
};

function Planner() {
  const [story, setStory] = useState(initialStory);
  const [targetUrl, setTargetUrl] = useState(initialUrl);
  const [plan, setPlan] = useState([]);
  const [approved, setApproved] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState(false);
  const [activeStep, setActiveStep] = useState(-1);
  const [completed, setCompleted] = useState([]);
  const [logs, setLogs] = useState([]);
  const [ollamaStatus, setOllamaStatus] = useState(null);
  const [runId, setRunId] = useState('');
  const [screenshot, setScreenshot] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [runStatus, setRunStatus] = useState('idle');

  useEffect(() => {
    fetch('/api/planner/status')
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo consultar Ollama.');
        setOllamaStatus(await response.json());
      })
      .catch((error) => setOllamaStatus({ connected: false, message: error.message }));
  }, []);

  useEffect(() => {
    if (!runId) return undefined;
    let disposed = false;
    let interval;
    const poll = async () => {
      try {
        const response = await fetch(`/api/planner/runs/${runId}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'No se pudo leer el estado de la ejecución.');
        if (disposed) return;
        const run = data.run;
        setRunStatus(run.status);
        setRunning(run.status === 'running');
        setActiveStep(run.activeStep);
        setCompleted(run.steps.map((step, index) => step.status === 'passed' ? index : -1).filter((index) => index >= 0));
        setLogs(run.logs);
        setScreenshot(run.screenshot);
        setCurrentUrl(run.currentUrl);
        if (run.status !== 'running') window.clearInterval(interval);
      } catch (error) {
        if (!disposed) {
          window.clearInterval(interval);
          setLogs((current) => [...current, { type: 'error', text: error.message }]);
        }
      }
    };
    poll();
    interval = window.setInterval(poll, 500);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [runId]);

  async function generatePlan() {
    if (!story.trim() || !targetUrl.trim() || generating || running) return;
    setGenerating(true);
    setApproved(false);
    setPlan([]);
    setCompleted([]);
    setActiveStep(-1);
    setRunId('');
    setScreenshot('');
    setLogs([{ type: 'info', text: `Enviando historia a Ollama (${ollamaStatus?.model ?? 'qwen2.5:3b'})…` }]);
    try {
      const response = await fetch('/api/planner/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ story, targetUrl }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo generar el plan.');
      const navigationStep = {
        id: 0,
        action: actionNames.navigate,
        detail: `Abrir ${targetUrl}`,
        kind: 'navigate',
        locator: targetUrl,
      };
      setPlan([
        navigationStep,
        ...result.steps.map((step, index) => ({
          ...step,
          id: index + 1,
          kind: step.action,
          title: `${actionNames[step.action]}: ${step.locator}`,
          detail: step.action === 'fill' ? `Texto de prueba: ${step.value}` : `Localizador accesible: ${step.locatorType}`,
        })),
      ]);
      setLogs((current) => [...current, { type: 'success', text: `Plan generado con ${result.model}. Revísalo y apruébalo antes de ejecutar.` }]);
    } catch (error) {
      setLogs((current) => [...current, { type: 'error', text: error.message }]);
    } finally {
      setGenerating(false);
    }
  }

  function approvePlan() {
    if (!plan.length || running) return;
    setApproved(true);
    setLogs((current) => [...current, { type: 'success', text: 'Plan aprobado manualmente. Listo para ejecutar con Playwright.' }]);
  }

  async function runPlan() {
    if (!approved || running || !plan.length) return;
    setCompleted([]);
    setActiveStep(-1);
    setScreenshot('');
    setCurrentUrl('');
    setRunStatus('running');
    setLogs((current) => [...current, { type: 'info', text: 'Iniciando Chromium real para probar la URL local…' }]);
    setRunning(true);
    try {
      const response = await fetch('/api/planner/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetUrl, steps: plan.slice(1) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo iniciar Playwright.');
      setRunId(result.run.id);
    } catch (error) {
      setRunStatus('failed');
      setRunning(false);
      setLogs((current) => [...current, { type: 'error', text: error.message }]);
    }
  }

  async function resetRun() {
    if (runId && running) {
      try {
        const response = await fetch(`/api/planner/runs/${runId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('No se pudo cancelar la ejecución de Playwright.');
      } catch (error) {
        setLogs((current) => [...current, { type: 'error', text: error.message }]);
      }
    }
    setRunStatus('idle');
    setRunning(false);
    setActiveStep(-1);
    setCompleted([]);
    setScreenshot('');
    setCurrentUrl('');
    setRunId('');
    setLogs((current) => [...current, { type: 'info', text: 'Vista de ejecución reiniciada.' }]);
  }

  const doneCount = completed.length;
  const progress = plan.length ? (doneCount / plan.length) * 100 : 0;
  const modelReady = ollamaStatus?.connected && ollamaStatus.modelAvailable;
  const statusLabel = running ? 'EN CURSO' : runStatus === 'passed' ? 'PASÓ' : runStatus === 'failed' ? 'FALLÓ' : runStatus === 'cancelled' ? 'CANCELADA' : 'EN ESPERA';

  return (
    <div className="planner-shell">
      <aside className="planner-sidebar">
        <a className="planner-brand" href="/"><span className="planner-brand-mark">Q</span><span>quality<span>desk</span></span></a>
        <div className="planner-space-label">ESPACIO DE TRABAJO</div>
        <div className="planner-space"><i /> Web Store <span>⌄</span></div>
        <nav className="planner-nav" aria-label="Navegación principal">
          <a href="/">▦ <span>Resumen</span></a>
          <a className="selected" href="/planner">✧ <span>Planner IA</span><b>DEMO</b></a>
          <a href="/#runs">◷ <span>Ejecuciones</span></a>
          <a href="/sample">◇ <span>App de ejemplo</span><span className="planner-arrow">↗</span></a>
        </nav>
        <div className="planner-sidebar-note"><span>✦</span><strong>IA local · Ollama</strong><p>El plan se genera en tu equipo. Solo se permite navegar a localhost.</p></div>
        <div className="planner-profile"><span>QA</span><div><strong>Equipo QA</strong><small>Demo local</small></div></div>
      </aside>

      <main className="planner-main">
        <header className="planner-topbar"><div>Web Store <span>/</span> <strong>Planner de pruebas</strong></div><div className="planner-online"><i /> Ambiente local</div></header>
        <div className="planner-content">
          <section className="planner-title-row"><div><div className="planner-eyebrow">DISEÑO DE PRUEBAS <span>IA LOCAL + PLAYWRIGHT</span></div><h1>De historia a prueba</h1><p>Genera un plan con IA local y observa cómo Playwright prueba tu aplicación paso a paso.</p></div><a className="planner-app-link" href="/sample" target="_blank" rel="noreferrer">Abrir app de ejemplo ↗</a></section>

          <div className={`planner-notice ${modelReady ? 'ollama-ready' : 'ollama-offline'}`}><span>{modelReady ? '✓' : '!'}</span><p>{modelReady ? <><strong>Ollama conectado · {ollamaStatus.model}</strong> La historia se procesa localmente. La URL objetivo está limitada a localhost.</> : <><strong>Ollama no está listo.</strong> {ollamaStatus?.message ?? 'Comprueba que Ollama esté iniciado y que el modelo configurado esté descargado.'} Revisa la sección de instalación en el README.</>}</p></div>

          <div className="planner-workspace">
            <section className="planner-left-column">
              <article className="planner-card story-card">
                <div className="planner-card-heading"><div className="step-number">01</div><div><h2>Historia de usuario</h2><p>Describe qué quiere hacer el usuario y qué debería ocurrir.</p></div></div>
                <label className="story-label" htmlFor="user-story">HISTORIA</label>
                <textarea id="user-story" maxLength={500} value={story} onChange={(event) => { setStory(event.target.value); setApproved(false); }} placeholder="Como usuario, quiero… para…" disabled={running || generating} />
                <div className="story-helper"><span>✧ La IA local propondrá acciones Playwright revisables</span><span>{story.length}/500</span></div>
                <label className="story-label target-url-label" htmlFor="target-url">URL LOCAL AUTORIZADA</label>
                <input className="target-url-input" id="target-url" type="url" value={targetUrl} onChange={(event) => { setTargetUrl(event.target.value); setApproved(false); }} placeholder="http://127.0.0.1:4173/sample" disabled={running || generating} />
                <div className="url-helper">Solo localhost, 127.0.0.1 o [::1]. La navegación externa se bloquea.</div>
                <div className="story-actions"><button className="planner-generate" onClick={generatePlan} disabled={!story.trim() || !targetUrl.trim() || generating || running}><span>{generating ? '◌' : '✧'}</span>{generating ? 'Analizando con Ollama…' : 'Generar plan con IA'}</button><span className="demo-model">Modelo: {ollamaStatus?.model ?? 'qwen2.5:3b'}</span></div>
              </article>

              <article className="planner-card plan-card">
                <div className="planner-card-heading"><div className="step-number">02</div><div><h2>Plan de prueba</h2><p>Revisa la propuesta antes de iniciar una ejecución.</p></div>{plan.length > 0 && <span className="step-count">{plan.length} pasos</span>}</div>
                {!plan.length ? <div className="plan-empty"><span>☷</span><strong>Tu plan aparecerá aquí</strong><p>Escribe una historia y genera una propuesta para revisarla.</p></div> : <>
                  <div className="plan-meta"><span className="ai-chip">✧ PLAN PROPUESTO POR IA</span><span>Revisa los pasos antes de ejecutar</span></div>
                  <ol className="plan-steps">{plan.map((step, index) => {
                    const isDone = completed.includes(step.id);
                    const isActive = activeStep === index && running;
                    return <li className={`${isDone ? 'step-done' : ''} ${isActive ? 'step-active' : ''} ${step.kind === 'review' ? 'step-review' : ''}`} key={step.id}>
                      <span className="plan-step-marker">{isDone ? '✓' : String(index + 1).padStart(2, '0')}</span>
                      <div className="plan-step-copy"><strong>{step.title ?? step.action}</strong><span>{step.detail}</span></div>
                      <span className="plan-step-state">{isDone ? 'Pasó' : isActive ? 'En curso' : runStatus === 'failed' && activeStep === index ? 'Falló' : 'Pendiente'}</span>
                    </li>;
                  })}</ol>
                  <div className="plan-footer">{approved ? <span className="approved-label">✓ Plan aprobado</span> : <span className="approval-hint">Revisa el plan y apruébalo para continuar.</span>}{!approved && <button className="approve-button" onClick={approvePlan} disabled={running}>Aprobar plan</button>}</div>
                </>}
              </article>
            </section>

            <section className="planner-right-column">
              <article className="planner-card execution-card">
                <div className="planner-card-heading execution-heading"><div><div className="step-number">03</div></div><div><h2>Ejecución en vivo</h2><p>Capturas reales del navegador y consola por paso.</p></div><span className={`execution-status ${running ? 'is-running' : runStatus === 'passed' ? 'is-passed' : runStatus === 'failed' ? 'is-failed' : ''}`}><i />{statusLabel}</span></div>
                <div className="execution-toolbar"><span><i className={running ? 'recording' : ''} /> Chromium real · {currentUrl || 'esperando URL'}</span><div><button onClick={resetRun} disabled={!running && !completed.length} aria-label="Reiniciar ejecución" title="Reiniciar">↻</button><span>•••</span></div></div>
                <div className="mock-browser">
                  <div className="browser-bar"><span className="browser-controls"><i /><i /><i /></span><span className="browser-address"><b>⌑</b> localhost:4173/sample</span><span className="browser-refresh">↻</span></div>
                  <div className="browser-page">
                    {screenshot ? <img className="real-browser-frame" src={`data:image/jpeg;base64,${screenshot}`} alt={`Captura de Chromium en ${currentUrl}`} /> : <div className="browser-placeholder"><span>⌘</span><strong>Vista real de Chromium</strong><p>Al ejecutar el plan, aquí aparecerán capturas del navegador.</p></div>}
                  </div>
                </div>
                <div className="execution-progress"><div className="progress-label"><span>Progreso de ejecución</span><strong>{doneCount}/{plan.length || 0} pasos</strong></div><div className="progress-track"><i style={{ width: `${progress}%` }} /></div></div>
                <div className="execution-actions"><span>{approved ? 'Plan revisado; se probará únicamente la URL local.' : 'Aprueba el plan para iniciar Playwright.'}</span><button className="run-plan-button" onClick={runPlan} disabled={!approved || running}>{running ? <><i className="run-spinner" /> Ejecutando…</> : '▶  Ejecutar plan'}</button></div>
              </article>

              <article className="planner-card console-card"><div className="console-heading"><div><span className="console-prompt">&gt;_</span><strong>Consola de ejecución</strong></div><span>{ollamaStatus?.connected ? 'OLLAMA + LOCAL' : 'LOCAL'}</span></div><div className="console-body" role="log" aria-live="polite">{logs.length ? logs.map((log, index) => <div className={`console-line console-${log.type}`} key={`${index}-${log.text}`}><span>{log.type === 'success' ? '✓' : log.type === 'running' ? '›' : log.type === 'warning' || log.type === 'error' ? '!' : '$'}</span><code>{log.text}</code></div>) : <div className="console-placeholder">$ Esperando que generes un plan…</div>}</div></article>
            </section>
          </div>

          <footer className="planner-footer"><span>QUALITY DESK <b>·</b> IA LOCAL + PLAYWRIGHT</span><span>El plan se revisa antes de ejecutar acciones permitidas.</span></footer>
        </div>
      </main>
    </div>
  );
}

export { Planner };
