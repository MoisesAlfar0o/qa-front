import { useCallback, useEffect, useMemo, useState } from 'react';
import { emptyRun, reduceRun } from '../platform/run-state.ts';
import { platformApi } from './planner/api.js';
import './planner.css';
import './planner-live.css';
import './platform-app.css';

const emptyInput = { mode: 'free', text: '' };
const terminal = new Set(['PASSED', 'FAILED', 'ERROR', 'CANCELLED', 'INTERRUPTED']);
const statusLabels = {
  PENDING: 'EN COLA',
  RUNNING: 'EN CURSO',
  PASSED: 'PASÓ',
  FAILED: 'FALLÓ',
  ERROR: 'ERROR',
  CANCELLED: 'CANCELADA',
  INTERRUPTED: 'INTERRUMPIDA',
};

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function formatDuration(value) {
  if (value == null) return '—';
  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;
}

function requestId() {
  return globalThis.crypto?.randomUUID?.() ?? `qa-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function PlatformApp() {
  const [status, setStatus] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [projectDetails, setProjectDetails] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [runs, setRuns] = useState([]);
  const [scenarioId, setScenarioId] = useState('');
  const [scenario, setScenario] = useState(null);
  const [version, setVersion] = useState(null);
  const [plan, setPlan] = useState(null);
  const [planId, setPlanId] = useState('');
  const [input, setInput] = useState(emptyInput);
  const [featureText, setFeatureText] = useState('');
  const [validation, setValidation] = useState(null);
  const [activeRun, setActiveRun] = useState(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: '', url: 'http://127.0.0.1:4173/lab', environment: 'test', authMode: 'none' });
  const [working, setWorking] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [authorizeRisk, setAuthorizeRisk] = useState(false);

  const selectedProject = useMemo(() => projects.find((item) => item.id === projectId) ?? null, [projects, projectId]);
  const currentRun = activeRun;
  const isRunning = currentRun && !terminal.has(currentRun.status);

  const loadProjectData = useCallback(async (id) => {
    if (!id) {
      setProjectDetails(null);
      setScenarios([]);
      setRuns([]);
      return;
    }
    const [details, scenarioResult, runResult] = await Promise.all([
      platformApi.project(id),
      platformApi.scenarios(id),
      platformApi.runs(id),
    ]);
    setProjectDetails(details);
    setScenarios(scenarioResult.scenarios);
    setRuns(runResult.runs);
  }, []);

  const loadScenarioVersion = useCallback(async (id, sid, versionNumber) => {
    const result = await platformApi.version(id, sid, versionNumber);
    setScenarioId(sid);
    setVersion(result);
    setFeatureText(result.text);
    setValidation(result.record.validation);
    setPlan(result.record.plan);
    setPlanId('');
    setAuthorizeRisk(Boolean(result.approval?.authorizedRisk));
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([platformApi.status(), platformApi.projects()])
      .then(([plannerStatus, projectResult]) => {
        if (cancelled) return;
        setStatus(plannerStatus);
        setProjects(projectResult.projects);
        if (projectResult.projects.length) setProjectId(projectResult.projects[0].id);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setScenario(null);
    setVersion(null);
    setPlan(null);
    setPlanId('');
    setFeatureText('');
    setValidation(null);
    setActiveRun(null);
    loadProjectData(projectId)
      .then(() => {
        if (!cancelled) setError('');
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message);
      });
    return () => { cancelled = true; };
  }, [projectId, loadProjectData]);

  useEffect(() => {
    if (!currentRun?.runId || !projectId || terminal.has(currentRun.status)) return undefined;
    const source = new EventSource(`/api/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(currentRun.runId)}/events`);
    source.addEventListener('run', (message) => {
      try {
        const event = JSON.parse(message.data);
        setActiveRun((current) => current?.runId === event.runId ? reduceRun(current, event) : current);
      } catch (eventError) {
        setError(`No se pudo interpretar un evento del runner: ${eventError.message}`);
      }
    });
    source.addEventListener('end', () => {
      source.close();
      platformApi.run(projectId, currentRun.runId)
        .then(({ run }) => setActiveRun(run))
        .then(() => loadProjectData(projectId))
        .catch((loadError) => setError(loadError.message));
    });
    source.onerror = () => {
      platformApi.run(projectId, currentRun.runId)
        .then(({ run }) => {
          setActiveRun((current) => current?.runId === run.runId && run.lastSeq >= current.lastSeq ? run : current);
          if (terminal.has(run.status)) source.close();
        })
        .catch((loadError) => setError(`No se pudo recuperar el estado de la ejecución: ${loadError.message}`));
    };
    return () => source.close();
  }, [currentRun?.runId, currentRun?.status, projectId, loadProjectData]);

  async function handleCreateProject(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { project } = await platformApi.createProject(projectForm);
      const result = await platformApi.projects();
      setProjects(result.projects);
      setProjectId(project.id);
      setCreatingProject(false);
      setProjectForm({ name: '', url: 'http://127.0.0.1:4173/lab', environment: 'test', authMode: 'none' });
      setNotice('Proyecto creado. Explora la aplicación para guardar su inventario.');
    } catch (createError) {
      setError(createError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleExplore() {
    if (!projectId || busy) return;
    setBusy(true);
    setWorking('explore');
    setError('');
    setNotice('Explorando la aplicación con Playwright; MCP se utiliza solo si está disponible.');
    try {
      const result = await platformApi.explore(projectId);
      setProjectDetails(result);
      setNotice(`Exploración guardada: ${result.inventory?.pages?.length ?? 0} páginas. MCP ${result.inventory?.mcp?.used ? 'utilizado' : 'no utilizado'}.`);
      if (result.inventory?.mcp?.reason && !result.inventory.mcp.used) setNotice((current) => `${current} ${result.inventory.mcp.reason}`);
    } catch (exploreError) {
      setError(exploreError.message);
    } finally {
      setWorking('');
      setBusy(false);
    }
  }

  async function handleGenerate(event) {
    event.preventDefault();
    if (!projectId || busy) return;
    setBusy(true);
    setWorking('plan');
    setError('');
    setNotice('');
    setPlan(null);
    setValidation(null);
    setScenario(null);
    setVersion(null);
    setFeatureText('');
    setPlanId('');
    try {
      const result = await platformApi.plan(projectId, input);
      setPlan(result.plan);
      setPlanId(result.planId);
      setNotice(result.plan.status === 'ready' ? `Plan interpretado por ${result.plan.provenance.provider}/${result.plan.provenance.model}.` : 'El plan requiere aclaraciones o contiene capacidades no soportadas; no se puede aprobar.');
    } catch (planError) {
      setError(planError.message);
    } finally {
      setWorking('');
      setBusy(false);
    }
  }

  async function handleCreateScenario() {
    if (!projectId || !planId || plan?.status !== 'ready' || busy) return;
    setBusy(true);
    setWorking('scenario');
    setError('');
    try {
      const result = await platformApi.createScenario(projectId, planId);
      setScenario(result.manifest);
      setScenarioId(result.manifest.id);
      setVersion({ record: result.version, text: result.text, approval: null });
      setFeatureText(result.text);
      setValidation(result.version.validation);
      await loadProjectData(projectId);
      setNotice(`Borrador creado como versión ${result.version.version}. Revisa y valida el .feature antes de aprobarlo.`);
    } catch (scenarioError) {
      setError(scenarioError.message);
    } finally {
      setWorking('');
      setBusy(false);
    }
  }

  async function handleSelectScenario(sid) {
    if (!sid || !projectId) return;
    setBusy(true);
    setError('');
    try {
      const result = await platformApi.scenario(projectId, sid);
      setScenario(result.manifest);
      await loadScenarioVersion(projectId, sid, result.manifest.latestVersion);
    } catch (scenarioError) {
      setError(scenarioError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectVersion(versionNumber) {
    if (!scenarioId || !projectId) return;
    setBusy(true);
    setError('');
    try {
      const manifest = (await platformApi.scenario(projectId, scenarioId)).manifest;
      setScenario(manifest);
      await loadScenarioVersion(projectId, scenarioId, Number(versionNumber));
    } catch (versionError) {
      setError(versionError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveDraft() {
    if (!scenario || !version || busy) return;
    setBusy(true);
    setError('');
    try {
      const saved = await platformApi.saveVersion(projectId, scenario.id, featureText, scenario.latestVersion);
      const refreshed = await platformApi.scenario(projectId, scenario.id);
      setScenario(refreshed.manifest);
      const current = await platformApi.version(projectId, scenario.id, saved.version.version);
      setVersion(current);
      setFeatureText(current.text);
      setValidation(current.record.validation);
      setNotice(`Guardado como borrador versión ${current.record.version}. La aprobación anterior no se transfiere.`);
      await loadProjectData(projectId);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleValidate() {
    if (!projectId || !featureText.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await platformApi.validate(projectId, featureText, planId || undefined);
      setValidation(result.validation);
      setNotice(result.validation.valid ? 'Gherkin y definiciones de pasos válidos. Esto no garantiza el resultado de la ejecución.' : 'La validación encontró errores; corrige el borrador antes de aprobar.');
    } catch (validationError) {
      setError(validationError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    if (!scenario || !version || !validation?.valid || featureText !== version.text || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await platformApi.approve(projectId, scenario.id, version.record.version, version.record.hash, authorizeRisk);
      const refreshed = await platformApi.version(projectId, scenario.id, version.record.version);
      const manifest = (await platformApi.scenario(projectId, scenario.id)).manifest;
      setVersion(refreshed);
      setScenario(manifest);
      setNotice(`Aprobada la versión ${result.approval.version} (${result.approval.hash.slice(0, 12)}).`);
      await loadProjectData(projectId);
    } catch (approvalError) {
      setError(approvalError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRun() {
    if (!scenario || !version?.approval || busy || isRunning) return;
    setBusy(true);
    setError('');
    try {
      const result = await platformApi.startRun(projectId, {
        scenarioId: scenario.id,
        version: version.record.version,
        requestId: requestId(),
      });
      setActiveRun(result.run);
      await loadProjectData(projectId);
      setNotice(`Ejecución ${result.run.runId} creada para versión ${result.run.version}.`);
    } catch (runError) {
      setError(runError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectRun(runId) {
    if (!runId || !projectId) return;
    setError('');
    try {
      const result = await platformApi.run(projectId, runId);
      setActiveRun(result.run);
      const manifest = await platformApi.scenario(projectId, result.run.scenarioId);
      setScenario(manifest.manifest);
      await loadScenarioVersion(projectId, result.run.scenarioId, result.run.version);
    } catch (runError) {
      setError(runError.message);
    }
  }

  async function handleCancel() {
    if (!currentRun || !isRunning || busy) return;
    setBusy(true);
    setError('');
    try {
      const { run } = await platformApi.cancelRun(projectId, currentRun.runId);
      setActiveRun(run);
      setNotice('Cancelación solicitada. El estado cambiará cuando el backend confirme la terminación.');
    } catch (cancelError) {
      setError(cancelError.message);
    } finally {
      setBusy(false);
    }
  }

  const inventory = projectDetails?.inventory;
  const navigation = projectDetails?.navigation;
  const latestRunCapture = currentRun?.artifacts?.findLast?.((artifact) => artifact.kind === 'screenshot');
  const featureIsDirty = Boolean(version && featureText !== version.text);
  const canApprove = Boolean(scenario && version && validation?.valid && !featureIsDirty && !version.approval);
  const canRun = Boolean(scenario && version?.approval && !featureIsDirty && !isRunning);

  return (
    <div className="planner-shell platform-shell">
      <aside className="planner-sidebar">
        <a className="planner-brand" href="/"><span className="planner-brand-mark">Q</span><span>quality<span>desk</span></span></a>
        <div className="planner-space-label">ESPACIO DE TRABAJO</div>
        <label className="platform-project-select-label" htmlFor="active-project">Proyecto activo</label>
        <select id="active-project" className="platform-project-select" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          <option value="">Selecciona proyecto</option>
          {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <button className="platform-new-project" onClick={() => setCreatingProject((value) => !value)}>＋ Nuevo proyecto</button>
        <nav className="planner-nav" aria-label="Navegación principal">
          <a href="/">▦ <span>Resumen</span></a>
          <a className="selected" href="/planner">✧ <span>Planner IA</span><b>BDD</b></a>
          <a href="#platform-history">◷ <span>Ejecuciones</span></a>
          <a href="/lab">◇ <span>App laboratorio</span><span className="planner-arrow">↗</span></a>
        </nav>
        <div className="planner-sidebar-note"><span>✦</span><strong>Plan controlado · Cucumber</strong><p>Ollama interpreta. El catálogo valida y Playwright ejecuta solo versiones aprobadas.</p></div>
        <div className="planner-profile"><span>QA</span><div><strong>Quality Desk</strong><small>Workspace local</small></div></div>
      </aside>

      <main className="planner-main">
        <header className="planner-topbar"><div>Quality Desk <span>/</span> <strong>Plataforma de pruebas</strong></div><div className="planner-online"><i className={status?.connected && status?.modelAvailable ? '' : 'offline'} />{status?.provider ?? 'Conectando'}</div></header>
        <div className="planner-content">
          <section className="planner-title-row">
            <div><div className="planner-eyebrow">DISEÑO Y EJECUCIÓN <span>OLLAMA · GHERKIN · PLAYWRIGHT</span></div><h1>De una intención a una prueba reproducible</h1><p>Configura la aplicación, genera y revisa el .feature, aprueba una versión y ejecuta Cucumber con Playwright.</p></div>
          </section>

          {error && <div className="platform-banner platform-error" role="alert">{error}</div>}
          {notice && <div className="platform-banner platform-notice" role="status">{notice}</div>}
          {status && (!status.connected || !status.modelAvailable) && <div className="platform-banner platform-warning" role="status">
            Ollama no está listo ({status.model}). {status.message ?? 'Verifica el servicio local y que el modelo esté instalado.'} La generación real de planes no estará disponible hasta resolverlo.
          </div>}

          {creatingProject && (
            <form className="planner-card platform-project-form" onSubmit={handleCreateProject}>
              <div className="planner-card-heading"><div className="step-number">00</div><div><h2>Configurar proyecto objetivo</h2><p>La URL se validará en el backend contra los hosts autorizados.</p></div></div>
              <div className="platform-form-grid">
                <label>Nombre del proyecto<input required maxLength={80} value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} placeholder="Proyecto de QA" /></label>
                <label>URL de inicio<input required type="url" maxLength={500} value={projectForm.url} onChange={(event) => setProjectForm({ ...projectForm, url: event.target.value })} /></label>
                <label>Ambiente<select value={projectForm.environment} onChange={(event) => setProjectForm({ ...projectForm, environment: event.target.value })}><option value="test">Pruebas</option><option value="staging">Staging</option><option value="production">Producción (bloqueado por defecto)</option></select></label>
                <label>Autenticación<select value={projectForm.authMode} onChange={(event) => setProjectForm({ ...projectForm, authMode: event.target.value })}><option value="none">Sin estado de sesión</option><option value="storage-state">Archivo storage-state existente</option></select></label>
              </div>
              {projectForm.authMode === 'storage-state' && <p className="platform-warning">El backend requiere `workspace/projects/&lt;id&gt;/auth/storage-state.json`; la UI no carga credenciales ni manipula perfiles personales.</p>}
              <div className="platform-actions"><button type="button" className="secondary-button" onClick={() => setCreatingProject(false)}>Cerrar</button><button className="planner-generate" disabled={busy}>{busy ? 'Guardando…' : 'Crear proyecto'}</button></div>
            </form>
          )}

          {!selectedProject ? (
            <section className="planner-card platform-empty">
              <div className="plan-empty"><span>◇</span><strong>Configura tu primer proyecto</strong><p>Agrega la URL de una aplicación de pruebas para explorarla y generar escenarios.</p><button className="planner-generate" onClick={() => setCreatingProject(true)}>＋ Crear proyecto</button></div>
            </section>
          ) : (
            <>
              <section className="planner-card platform-project-summary">
                <div className="planner-card-heading"><div className="step-number">01</div><div><h2>{selectedProject.name}</h2><p>{selectedProject.baseUrl}{selectedProject.startPath} · ambiente {selectedProject.environment} · autenticación {selectedProject.auth.mode}</p></div><button className="approve-button" onClick={handleExplore} disabled={busy || Boolean(isRunning)}>{working === 'explore' ? 'Explorando…' : inventory ? 'Actualizar exploración' : 'Explorar aplicación'}</button></div>
                {inventory && <div className="platform-inventory">
                  <span>{inventory.pages.length} páginas</span><span>{inventory.elementCount} controles</span><span>{inventory.tableCount} tablas</span>
                  <span className={inventory.mcp.used ? 'platform-good' : 'platform-muted'}>{inventory.mcp.used ? `MCP conectado${inventory.mcp.serverVersion ? ` · ${inventory.mcp.serverVersion}` : ''}` : `MCP no utilizado${inventory.mcp.reason ? `: ${inventory.mcp.reason}` : ''}`}</span>
                  <span>Explorado {formatDate(inventory.exploredAt)}</span>
                </div>}
                {inventory?.warnings?.length > 0 && <details className="platform-disclosure"><summary>Avisos de exploración ({inventory.warnings.length})</summary><ul>{inventory.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></details>}
                {navigation?.nodes?.length > 0 && <details className="platform-disclosure"><summary>Mapa de navegación ({navigation.nodes.length} nodos)</summary><ul>{navigation.nodes.map((node) => <li key={node.id}>{node.path.join(' › ')}{node.route ? ` — ${node.route}` : ''}</li>)}</ul></details>}
              </section>

              <div className="planner-workspace platform-workspace">
                <section className="planner-left-column">
                  <form className="planner-card story-card" onSubmit={handleGenerate}>
                    <div className="planner-card-heading"><div className="step-number">02</div><div><h2>Describe la prueba</h2><p>Usa lenguaje natural. El mismo campo admite instrucciones completas.</p></div></div>
                    <label className="story-label" htmlFor="platform-story">DÓNDE, QUÉ HACES Y QUÉ DEBE PASAR</label>
                    <textarea id="platform-story" maxLength={2000} value={input.text} onChange={(event) => setInput({ ...input, mode: 'free', text: event.target.value })} placeholder={'En Catálogos > Productos, busca el registro cuyo Nombre es "Moisés" y comprueba que aparezca.'} disabled={busy || Boolean(isRunning)} />
                    <div className="story-helper"><span>✧ Se requiere una verificación observable. El modelo no escribe código.</span><span>{input.text.length}/2000</span></div>
                    <div className="platform-actions"><button className="planner-generate" disabled={!input.text.trim() || busy || Boolean(isRunning)}><span>✧</span>{working === 'plan' ? 'Interpretando con Ollama…' : 'Generar plan'}</button><span className="demo-model">{status?.model ?? 'Ollama no disponible'}</span></div>
                  </form>

                  <article className="planner-card plan-card">
                    <div className="planner-card-heading"><div className="step-number">03</div><div><h2>Plan normalizado</h2><p>Acciones y resultados vinculados al inventario explorado.</p></div>{plan && <span className="step-count">{plan.actions.length + plan.assertions.length} acciones/verificaciones</span>}</div>
                    {!plan ? <div className="plan-empty"><span>☷</span><strong>El plan aparecerá aquí</strong><p>Escribe la intención y genera una interpretación real con Ollama.</p></div> : <div className="platform-plan">
                      <div className={`platform-plan-status status-${plan.status}`}>{plan.status === 'ready' ? 'LISTO PARA REVISIÓN' : plan.status === 'needs_clarification' ? 'REQUIERE ACLARACIÓN' : 'NO SOPORTADO'}</div>
                      <h3>{plan.title}</h3><p>{plan.objective}</p>
                      {plan.destination && <p><strong>Destino observado:</strong> {plan.destination.path.join(' › ')}{plan.destination.route ? ` (${plan.destination.route})` : ''}</p>}
                      {[['Acciones', plan.actions], ['Verificaciones', plan.assertions]].map(([label, steps]) => steps.length > 0 && <div className="platform-plan-group" key={label}><strong>{label}</strong><ol>{steps.map((step, index) => <li key={`${step.action}-${index}`}><span>{step.description}</span><small>{step.source} · riesgo {step.risk}</small></li>)}</ol></div>)}
                      {plan.preconditions?.filter((item) => !item.satisfied).map((item) => <div className="platform-warning" key={item.id}>{item.description} ({item.mechanism})</div>)}
                      {plan.questions?.length > 0 && <div className="platform-warning"><strong>Preguntas pendientes</strong><ul>{plan.questions.map((question, index) => <li key={`${index}-${question}`}>{question}</li>)}</ul></div>}
                      {plan.missingCapabilities?.length > 0 && <div className="platform-warning"><strong>Capacidades no soportadas</strong><ul>{plan.missingCapabilities.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}
                      {plan.warnings?.length > 0 && <details className="platform-disclosure"><summary>Advertencias ({plan.warnings.length})</summary><ul>{plan.warnings.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></details>}
                      <div className="platform-actions"><span className="approval-hint">Modelo: {plan.provenance.model} · {plan.provenance.attempts} intento(s)</span><button className="approve-button" onClick={handleCreateScenario} disabled={plan.status !== 'ready' || busy || !inventory}>{working === 'scenario' ? 'Creando…' : 'Generar .feature revisable'}</button></div>
                    </div>}
                  </article>
                </section>

                <section className="planner-right-column">
                  <article className="planner-card platform-feature-card">
                    <div className="planner-card-heading"><div className="step-number">04</div><div><h2>Feature versionado</h2><p>Edición y aprobación sobre una versión inmutable.</p></div></div>
                    <div className="platform-feature-toolbar">
                      <label>Escenario<select value={scenarioId} onChange={(event) => handleSelectScenario(event.target.value)} disabled={busy}><option value="">Selecciona escenario</option>{scenarios.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
                      {scenario && <label>Versión<select value={version?.record.version ?? ''} onChange={(event) => handleSelectVersion(event.target.value)} disabled={busy}>{scenario.versions.map((item) => <option key={item.version} value={item.version}>v{String(item.version).padStart(4, '0')} · {item.approved ? 'aprobada' : 'borrador'}</option>)}</select></label>}
                    </div>
                    {version ? <>
                      <div className="platform-feature-meta"><span>{scenario?.title ?? version.record.validation.featureName}</span><code>v{String(version.record.version).padStart(4, '0')} · SHA-256 {version.record.hash.slice(0, 12)}</code><span>{version.record.source}</span></div>
                      <label className="story-label" htmlFor="feature-editor">ARCHIVO .FEATURE</label>
                      <textarea id="feature-editor" className="platform-feature-editor" spellCheck="false" value={featureText} onChange={(event) => setFeatureText(event.target.value)} disabled={busy} />
                      {featureIsDirty && <p className="platform-warning">Cambios sin guardar. La aprobación se deshabilita hasta crear y validar una nueva versión.</p>}
                      {validation && <div className={`platform-validation ${validation.valid ? 'valid' : 'invalid'}`} role="status">
                        <strong>{validation.valid ? 'Validación válida' : 'Validación con errores'} · riesgo {validation.risk.level}</strong>
                        {validation.steps?.length > 0 && <span>{validation.steps.length} pasos · catálogo {validation.catalogVersion}</span>}
                        {validation.errors?.map((item, index) => <p key={`${index}-${item.code}`}>{item.line ? `Línea ${item.line}: ` : ''}{item.message}{item.suggestion ? ` Sugerencia: ${item.suggestion}` : ''}</p>)}
                        {validation.warnings?.map((item, index) => <p className="warning" key={`${index}-${item.code}`}>{item.message}</p>)}
                      </div>}
                      <div className="platform-actions platform-feature-actions">
                        <button className="secondary-button" onClick={handleValidate} disabled={busy || !featureText.trim()}>Validar</button>
                        <button className="secondary-button" onClick={handleSaveDraft} disabled={busy || !featureIsDirty || !featureText.trim()}>Guardar borrador</button>
                      </div>
                      {validation?.risk.level === 'destructive' && !version.approval && <label className="platform-risk-check"><input type="checkbox" checked={authorizeRisk} onChange={(event) => setAuthorizeRisk(event.target.checked)} /> Autorizo explícitamente esta acción destructiva en un ambiente permitido.</label>}
                      <div className="plan-footer">
                        {version.approval ? <span className="approved-label">✓ Aprobada {formatDate(version.approval.approvedAt)}</span> : <span className="approval-hint">Revisión humana requerida</span>}
                        {!version.approval && <button className="approve-button" onClick={handleApprove} disabled={!canApprove || busy || (validation?.risk.level === 'destructive' && !authorizeRisk)}>Aprobar versión</button>}
                      </div>
                    </> : <div className="plan-empty"><span>▤</span><strong>El archivo .feature se mostrará aquí</strong><p>Genera un plan listo y crea un borrador para revisar.</p></div>}
                  </article>

                  <article className="planner-card execution-card">
                    <div className="planner-card-heading execution-heading"><div><div className="step-number">05</div></div><div><h2>Consola de ejecución</h2><p>Eventos reales de Cucumber/Playwright y evidencias.</p></div><span className={`execution-status ${isRunning ? 'is-running' : currentRun?.status === 'PASSED' ? 'is-passed' : ['FAILED', 'ERROR'].includes(currentRun?.status) ? 'is-failed' : ''}`}><i />{statusLabels[currentRun?.status] ?? 'EN ESPERA'}</span></div>
                    {currentRun ? <>
                      <div className="platform-run-meta"><strong>{currentRun.title || currentRun.scenarioName || 'Escenario'}</strong><span>v{String(currentRun.version).padStart(4, '0')} · run {currentRun.runId}</span><span>{currentRun.reason ?? currentRun.error?.message ?? ''}</span></div>
                      <div className="platform-run-steps" role="list" aria-label="Pasos del escenario">{currentRun.steps.map((step) => <details className={`platform-run-step step-${step.status.toLowerCase()}`} key={step.index} open={step.status === 'FAILED' || step.status === 'ERROR'}>
                        <summary><span className="platform-step-status">{step.status}</span><span>{step.keyword} {step.text}</span><small>{formatDuration(step.durationMs)}</small></summary>
                        {(step.error || step.screenshot) && <div className="platform-step-detail">{step.error && <p>{step.error.category}: {step.error.message}</p>}{step.screenshot && <a href={platformApi.artifactUrl(projectId, currentRun.runId, step.screenshot)} target="_blank" rel="noreferrer">Abrir captura del paso</a>}</div>}
                      </details>)}</div>
                      {currentRun.error && <div className="platform-warning">{currentRun.error.category}: {currentRun.error.message}</div>}
                      {currentRun.artifacts.length > 0 && <div className="platform-artifacts">{currentRun.artifacts.map((artifact) => <a key={`${artifact.kind}-${artifact.file}`} href={platformApi.artifactUrl(projectId, currentRun.runId, artifact.file)} target="_blank" rel="noreferrer">{artifact.kind === 'trace' ? 'Abrir traza' : artifact.kind === 'report' ? 'Abrir reporte Cucumber' : artifact.kind === 'messages' ? 'Ver mensajes Cucumber' : 'Abrir captura'}</a>)}</div>}
                      {latestRunCapture && <div className="mock-browser"><div className="browser-bar"><span className="browser-controls"><i /><i /><i /></span><span className="browser-address">{selectedProject.baseUrl}</span></div><div className="browser-page"><img className="real-browser-frame" src={platformApi.artifactUrl(projectId, currentRun.runId, latestRunCapture.file)} alt="Captura real generada por Playwright" /></div></div>}
                      <div className="execution-actions"><span>{currentRun.status === 'RUNNING' ? 'El backend mantiene el estado oficial.' : currentRun.reason ?? `Terminado ${formatDate(currentRun.finishedAt)}`}</span>{isRunning && <button className="secondary-button" onClick={handleCancel} disabled={busy}>Solicitar cancelación</button>}</div>
                    </> : <div className="plan-empty"><span>⌘</span><strong>Sin ejecución seleccionada</strong><p>Aprueba una versión y ejecútala; sus eventos persistidos aparecerán aquí.</p></div>}
                    <div className="platform-actions platform-execute">
                      <button className="run-plan-button" onClick={handleRun} disabled={!canRun || busy}>{busy && working === 'run' ? 'Iniciando…' : '▶  Ejecutar versión aprobada'}</button>
                    </div>
                  </article>
                </section>
              </div>

              <section className="planner-card platform-history" id="platform-history">
                <div className="planner-card-heading"><div className="step-number">06</div><div><h2>Historial persistido</h2><p>Ejecuciones guardadas por el backend para este proyecto.</p></div><span className="step-count">{runs.length} ejecuciones</span></div>
                {runs.length ? <div className="platform-history-list">{runs.map((run) => <button className={`platform-history-row ${activeRun?.runId === run.runId ? 'selected' : ''}`} key={run.runId} onClick={() => handleSelectRun(run.runId)}>
                  <span className={`history-status status-${run.status.toLowerCase()}`}>{statusLabels[run.status] ?? run.status}</span><strong>{run.title || run.scenarioName || run.scenarioId}</strong><span>v{String(run.version).padStart(4, '0')}</span><span>{formatDate(run.finishedAt ?? run.createdAt)}</span><span>{run.steps.filter((step) => step.status === 'PASSED').length}/{run.steps.length} pasos</span>
                </button>)}</div> : <div className="empty-state">Aún no hay ejecuciones persistidas.</div>}
              </section>
            </>
          )}
          <footer className="planner-footer"><span>QUALITY DESK <b>·</b> PLATAFORMA BDD</span><span>La versión aprobada y el registro del backend son la fuente de verdad.</span></footer>
        </div>
      </main>
    </div>
  );
}

export { PlatformApp };
