# Plataforma de automatización E2E

## Flujo de trabajo

La interfaz de la plataforma está en `/planner`; la aplicación local de prueba está en `/lab`. El flujo es:

1. Crear un proyecto indicando su URL inicial. Por defecto, solo se aceptan hosts loopback. Para autorizar un host de pruebas adicional, el operador inicia el servidor con `QA_ALLOWED_HOSTS=host1,host2`.
2. Explorar el proyecto. Playwright recorre la URL inicial y las rutas observables; si `QA_MCP_ENABLED` está activo y el servidor MCP está disponible, también intenta obtener evidencia por Playwright MCP. El inventario y el mapa de navegación se guardan en el workspace.
3. Describir el escenario en lenguaje libre o con los campos estructurados. Ollama propone un objeto JSON sujeto a JSON Schema. El servidor vuelve a validarlo, lo resuelve contra el catálogo y la evidencia observada y conserva el plan.
4. Revisar el `.feature` generado, validarlo o guardarlo como una nueva versión inmutable. El generador usa exclusivamente pasos del catálogo; no ejecuta texto ni código producido por el modelo.
5. Aprobar una versión concreta. La aprobación comprueba el hash, la validación actual, el riesgo y un dry-run real de Cucumber.js.
6. Ejecutar solo la versión aprobada. Cucumber.js carga las definiciones TypeScript y Playwright realiza las acciones en el navegador. Los eventos persistidos se envían por SSE a la consola; el resultado y sus evidencias quedan disponibles en el historial.

## Responsabilidades implementadas

- `src/platform-app.jsx` conserva la consola y el diseño existentes y consume la API de la plataforma.
- `platform/planner.ts`, `platform/resolver.ts` y `platform/plan.ts` separan la interpretación del proveedor, la validación estructural y la resolución determinista.
- `platform/catalog.ts` define las acciones, los localizadores admitidos y las expresiones de pasos.
- `platform/gherkin.ts` genera y valida Gherkin; `platform/scenarios.ts` gestiona versiones, hashes, dry-run y aprobación.
- `runner/` ejecuta Cucumber.js y Playwright en un proceso hijo controlado.
- `platform/runs.ts`, `platform/run-events.ts` y `platform/run-state.ts` registran y reducen los eventos que consume la consola.
- `platform/store.ts` persiste en archivos locales, sin base de datos.

## API principal

Las rutas están montadas bajo `/api`:

| Operación | Ruta |
| --- | --- |
| Estado del proveedor y MCP | `GET /planner/status` |
| Crear y listar proyectos | `POST /projects`, `GET /projects` |
| Explorar y consultar inventario | `POST /projects/:pid/explore`, `GET /projects/:pid/inventory` |
| Crear un plan | `POST /projects/:pid/plans` |
| Crear/editar y validar escenarios | `POST /projects/:pid/scenarios`, `POST /projects/:pid/scenarios/:sid/versions`, `POST /projects/:pid/validate` |
| Aprobar una versión | `POST /projects/:pid/scenarios/:sid/versions/:version/approve` |
| Iniciar y consultar ejecuciones | `POST /projects/:pid/runs`, `GET /projects/:pid/runs/:rid` |
| Eventos y artefactos | `GET /projects/:pid/runs/:rid/events`, `GET /projects/:pid/runs/:rid/artifacts/*file` |

La aprobación se liga al hash exacto de una versión. Editar un escenario crea una versión distinta y no cambia bytes previamente aprobados. Los identificadores `requestId` permiten hacer idempotente la solicitud de ejecución.

## Configuración y persistencia

| Variable | Valor predeterminado | Uso |
| --- | --- | --- |
| `QA_WORKSPACE` | `workspace/` | Raíz de datos locales persistentes. |
| `OLLAMA_URL` / `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Servicio Ollama local. |
| `OLLAMA_MODEL` | `qwen2.5:3b` | Modelo del planner. |
| `OLLAMA_TIMEOUT_MS` | `120000` | Límite de espera por respuesta. |
| `OLLAMA_MAX_ATTEMPTS` | `3` | Intentos acotados para obtener una respuesta válida. |
| `QA_MCP_ENABLED` | activado | Usa `0` para deshabilitar Playwright MCP. |
| `QA_ALLOWED_HOSTS` | vacío | Hosts adicionales autorizados por quien inicia el servidor. |
| `QA_ALLOW_PRODUCTION` | desactivado | Debe ser `1` para permitir crear proyectos marcados como producción; en producción solo se permiten escenarios de lectura. |
| `QA_RUN_TIMEOUT_MS` | `300000` | Tiempo máximo de una ejecución. |
| `QA_MAX_CONCURRENT_RUNS` | `2` | Máximo de ejecuciones concurrentes. |
| `QA_RUN_RETENTION` | `50` | Retención de evidencia completa. |

Los proyectos, inventarios, planes, escenarios, versiones, aprobaciones, eventos y resultados viven bajo el workspace. Los reportes, trazas, capturas y logs se guardan dentro de la ejecución correspondiente. El estado autenticado, si ya se dispone de él, se espera en `projects/<project-id>/auth/storage-state.json`.

## Límites conocidos

- Ollama y Playwright MCP dependen de servicios locales y su disponibilidad se refleja en el estado y en la evidencia de exploración. La exploración directa con Playwright no requiere MCP.
- La interfaz actual permite configurar el modo `storage-state`, pero no cargar desde ella un archivo de autenticación; debe colocarse en la ruta del workspace indicada arriba.
- El almacenamiento serializa escrituras dentro de un proceso. No se debe compartir un mismo workspace entre varias instancias servidor concurrentes.
- La API local no incorpora autenticación de usuarios. Mantén el servidor en una máquina confiable y limita explícitamente los hosts objetivo.
- `npm test -- tests/integration/platform-e2e.spec.ts` comprueba un flujo de edición de registro en `/lab`: exploración, resolución de elementos observados, generación del `.feature`, aprobación con dry-run de Cucumber, modificación verificada con Playwright y recuperación por SSE de estado, historial, captura, traza y reportes. El test usa un proveedor de plan controlado; no pretende verificar que Ollama esté instalado o disponible. La disponibilidad real de Ollama/MCP debe comprobarse en el entorno que vaya a usar la plataforma.



Actúa como un Principal Software Engineer y Arquitecto Full-Stack. Estoy en un repositorio de automatización E2E con Playwright y playwright-bdd. Actualmente tengo las carpetas `features/` (Gherkin en español) y `steps/` (TypeScript), pero NO tengo ninguna plataforma web construida todavía.

Tu objetivo es construir desde cero una plataforma web local de orquestación E2E bajo una nueva carpeta `/app`.

### 1. REGLAS ARQUITECTÓNICAS (Inquebrantables)
1. **Zero-DB:** Todo el historial, configuración y estados se guardan en archivos locales (ej. `app/data/`, `test-results/`).
2. **Gestor de paquetes:** Usa exclusivamente `pnpm`. La plataforma web debe tener su propio `package.json` dentro de `/app` (React 18, Vite 5, Express 5).
3. **Playwright Web-First:** El código de Playwright autogenerado debe usar aserciones web-first (`expect().toBeVisible()`). Prohibido usar `waitForTimeout` o selectores XPath.
4. **ADR 0002 (Seguridad):** El inicio de sesión en la app E2E es estrictamente manual (MFA). El estado de autenticación ya reside en `test-results/.auth/user.json`. La plataforma web NUNCA debe intentar iniciar sesión.

### 2. QUÉ DEBES CONSTRUIR EN `/app`

Diseña e implementa la arquitectura completa dividida en estos módulos:

#### A. Backend (Express 5 + Node.js nativo)
1. **API y Orquestador (`server.js` y `jobs.js`):** Crea un servidor Express que lea los archivos `.feature` del repositorio padre. Implementa una cola de trabajos que ejecute `pnpm bddgen` y `playwright test` mediante `child_process`.
2. **Persistencia y Control de Versiones:** Crea un sistema que encripte en un hash SHA-256 el contenido del `.feature` junto con todos los archivos de `steps/`. Esto validará si la implementación sufrió deriva (`IMPLEMENTATION_DRIFT`).
3. **Streaming SSE:** Envía los logs de ejecución en tiempo real al frontend mediante Server-Sent Events.

#### B. Frontend (React 18 + Vite)
1. **Interfaz (`App.jsx`):** Construye un panel donde pueda ver los features, aprobar sus versiones y ejecutarlos.
2. **Consola Fluida (Throttle):** La consola que reciba los eventos SSE debe usar un "throttle" (acumulación por lotes con `useRef`) para actualizar el DOM máximo cada 150ms. Esto evitará que React se congele con los logs de Playwright. Debe incluir scroll-lock matemático inteligente.

#### C. Agente Autónomo Generador (`agent-runner.js`)
1. Cuando un usuario intente ejecutar un feature que tiene pasos sin programar (Gherkin sin su step definition en TypeScript), el backend debe interceptarlo.
2. Crea un módulo que orqueste un LLM (mediante una API genérica u Ollama) para que asuma el rol de creador de pasos.
3. El agente debe abrir Chromium en segundo plano (`playwright-core` con `headless: false`), inyectar la sesión de `.auth/user.json` y navegar por el BackOffice para extraer los selectores web-first correctos.
4. Debe escribir el código en TypeScript (`Given/When/Then`) e insertarlo en `steps/common.steps.ts`.

### 3. INSTRUCCIONES DE EJECUCIÓN
Por favor, analiza este requerimiento y dame un plan paso a paso detallado de cómo vas a estructurar los archivos dentro de la nueva carpeta `/app`. Una vez me des la estructura, te pediré que generes el código de cada módulo uno por uno para asegurar la calidad.
