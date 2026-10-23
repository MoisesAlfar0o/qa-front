# Estado del proyecto

**Fecha de inspección:** 2026-10-23  
**Alcance:** inventario de frontend, backend y componentes relacionados con Ollama, Playwright MCP, Gherkin/Cucumber y persistencia local. Este documento describe el código encontrado; no representa una validación de ejecución.

> **Actualización:** la inspección inicial que sigue es una fotografía previa a la integración de la plataforma. El estado vigente y sus verificaciones se resumen a continuación; no uses el snapshot histórico como descripción del código actual.

## Estado vigente después de la integración

- `/planner` ahora monta `src/platform-app.jsx`, que conserva el dashboard y la app de laboratorio existentes y consume las rutas reales bajo `/api`.
- La interfaz cubre creación/selección de proyecto, exploración, plan libre o estructurado, revisión/validación/versionado del `.feature`, aprobación, ejecución, consola SSE, cancelación, artefactos e historial.
- El backend de `platform/` y `runner/` ejecuta Cucumber.js y Playwright; la nueva prueba `tests/integration/platform-e2e.spec.ts` explora `/lab`, genera con un proveedor controlado un plan para buscar y editar un producto, verifica el cambio, hace dry-run, aprueba, ejecuta el runner y comprueba SSE, estado persistido, historial, captura, traza y reportes reales.
- La suite completa pasó: 6 pruebas Playwright. También pasaron `npm run build`, `npm exec -- tsc --noEmit` y `git diff --check`. El build mantiene advertencias de comentarios `@__PURE__` procedentes de Zod, sin fallar.
- La prueba integrada no usa Ollama real y desactiva MCP; la disponibilidad de Ollama/modelo y del servidor Playwright MCP no se verificó en este entorno. La exploración de la prueba sí usa Playwright directo.
- La interfaz configura `storage-state`, pero no carga el archivo; si se usa ese modo, el archivo debe colocarse en `projects/<project-id>/auth/storage-state.json` bajo `QA_WORKSPACE`. La API local tampoco incorpora autenticación y el workspace no debe compartirse entre varias instancias servidor concurrentes.
- `README.md` y `docs/platform.md` describen el flujo y sus límites operativos vigentes.

## Inspección inicial (snapshot histórico)

Las secciones siguientes documentan la inspección previa a la integración. Sus observaciones sobre la UI, las pruebas y la documentación han quedado superadas por la actualización anterior.

### Resumen ejecutivo

El repositorio no está vacío y ya contiene una implementación backend considerable de la plataforma objetivo. Hay lógica real para:

- Interpretar instrucciones estructuradas o libres con Ollama, validarlas y resolverlas contra la exploración de una aplicación.
- Explorar aplicaciones con Playwright y, si está habilitado, con el servidor Playwright MCP.
- Generar y validar Gherkin mediante un catálogo fijo de acciones y expresiones.
- Versionar features y exigir aprobación antes de ejecutar.
- Ejecutar features con Cucumber.js y Playwright en un proceso aislado, registrar eventos y conservar artefactos localmente.

El principal faltante para el flujo solicitado es la integración con la interfaz. La pantalla actualmente seleccionada como planner sigue siendo la implementación anterior y llama rutas que ya no están expuestas por el servidor para generar y ejecutar planes. Los componentes que parecen destinados a la interfaz nueva existen como archivos vacíos y no están importados. Por eso, tener el backend implementado no equivale a tener el flujo de usuario completo conectado.

## Estructura y tecnologías

| Ubicación | Estado observado |
|---|---|
| `src/` | Frontend React con dashboard anterior, planner anterior y una aplicación de laboratorio usada como sitio de prueba. |
| `platform/` | Backend TypeScript organizado por responsabilidades: API, planner, exploración, inventario, navegación, Gherkin, escenarios, seguridad, almacenamiento y ejecuciones. |
| `runner/` | Runner Cucumber.js y Playwright, catálogo de steps, hooks y manejo de cancelación/errores. |
| `tests/` | Dos pruebas Playwright con contenido; las pruebas de integración, UI de plataforma y unitarias presentes en disco están vacías. |
| `scripts/` | Arranque local del frontend y API. |
| `docs/` | `platform.md` existe, pero tiene 0 bytes. |
| `workspace/` | No aparece como carpeta en la raíz inspeccionada; se crea al usar el almacenamiento y es la ubicación predeterminada configurada. |

El `package.json` declara React 19, Express 5, Vite 7, Playwright Test, Cucumber.js 13, el SDK de MCP, Zod y TypeScript. Los scripts ofrecen `dev`, `dev:web`, `dev:api`, `test`, `test:ui` y `build`; no hay un script dedicado para typecheck o para ejecutar las pruebas unitarias TypeScript. Coexisten `package-lock.json` y `pnpm-lock.yaml`; además existe `pnpm-workspace.yaml`.

## Frontend existente

### Pantallas accesibles

- `src/main.jsx` enruta `/planner` a `src/planner.jsx`, las rutas `/lab...` a `src/lab-app.jsx` y el resto (incluida `/`) a `src/ui.jsx`.
- `src/ui.jsx` es el dashboard de reportes. Consulta `/api/runs`, ejecuta la suite fija mediante `POST /api/runs` y luego actualiza el historial.
- `src/planner.jsx` contiene el planner visual anterior: historia, URL, propuesta de pasos, aprobación, ejecución, capturas y consola con polling.
- `src/lab-app.jsx` es una aplicación de demostración con páginas y formularios para productos, categorías, clientes, monedas y reportes. Es el sitio de prueba local, no la interfaz de administración de la plataforma.
- `src/styles.css`, `src/planner.css`, `src/planner-live.css` y `src/lab.css` contienen estilos existentes.

### Integración de la interfaz con el backend actual

La API activa se monta desde `server.js` con `createApiRouter(platform)`. Tiene rutas para proyectos, exploración, planes, validación, escenarios, versiones, aprobaciones, ejecuciones, cancelación, artefactos y eventos SSE.

Sin embargo, el planner mostrado en `/planner` continúa solicitando:

- `GET /api/planner/status`
- `POST /api/planner/plan`
- `POST /api/planner/runs`
- `GET` y `DELETE /api/planner/runs/:id`

En el router actual solo existe `/api/planner/status`; las rutas restantes pertenecían al flujo anterior y no están definidas. La generación y ejecución del planner visual no quedan conectadas al backend nuevo. El dashboard raíz tampoco consume el historial de proyectos/escenarios/ejecuciones de la plataforma; sigue usando la API de la suite fija.

Hay archivos preparados aparentemente para dividir la nueva interfaz —`src/planner/api.js`, `StoryPanel.jsx`, `FeatureEditor.jsx`, `ExecutionPanel.jsx`, `HistoryPanel.jsx`, `PlanPanel.jsx`, `ProjectPanel.jsx` y `platform.css`—, pero todos tienen **0 bytes**. No se encontraron referencias que los importen desde `src/`.

## Estado por tecnología y responsabilidad

| Área | Código encontrado | Estado actual |
|---|---|---|
| **Ollama** | `platform/planner.ts` implementa proveedor HTTP, consulta de estado/modelo, salida estructurada con JSON Schema, timeout y errores explícitos. `platform/plan.ts` define y valida contratos con Zod. | Implementación real en backend. Usa configuración local; no se pudo comprobar durante esta inspección que Ollama esté iniciado ni que el modelo configurado esté instalado. |
| **Normalización y planificación** | `platform/resolver.ts`, `platform/planner.ts` y `platform/plan.ts` normalizan entradas libres/estructuradas y resuelven el resultado del modelo contra inventario y mapa de navegación. Hay estados de aclaración y capacidades no soportadas. | Lógica implementada; no está conectada a la pantalla actual. |
| **Exploración** | `platform/explorer.ts` explora el DOM con Playwright; `platform/mcp-explorer.ts` implementa cliente MCP por stdio y llama al CLI MCP de Playwright. Hay extracción de snapshots ARIA e inventario. | Implementación real con fallback a exploración directa cuando MCP no se usa o no está disponible. MCP está habilitado por defecto según la configuración, pero su disponibilidad efectiva no se verificó. |
| **Mapa y resolución de elementos** | `platform/navigation.ts`, `inventory.ts`, `aria-snapshot.ts`, `locators.ts` y `resolver.ts`. La exploración guarda rutas, elementos, tablas y evidencia. | Implementación real en backend. |
| **Gherkin** | `platform/gherkin.ts` valida sintaxis, pasos y riesgos; genera el feature determinísticamente a partir del plan y el catálogo. `platform/catalog.ts` contiene acciones, parámetros, expresiones y niveles de riesgo. | Hay soporte real de Gherkin y catálogo controlado; no depende de código de steps arbitrario generado por el modelo. No se encontró una carpeta de `.feature` fuente versionada en la raíz. |
| **Cucumber.js** | `platform/cucumber-check.ts` realiza dry-run real para comprobar que los steps se enlazan; `runner/run-scenario.ts` carga Cucumber y ejecuta el feature; `runner/support/steps.ts` registra las expresiones del catálogo. | Implementación real para escenarios almacenados por proyecto. |
| **Playwright** | `runner/support/hooks.ts` crea navegador/contexto, aplica restricciones de origen y genera capturas/trazas; `runner/actions.ts` ejecuta las acciones controladas. `server.js` también conserva una ruta heredada para ejecutar la suite Playwright fija. | Hay dos flujos: runner de escenarios Cucumber nuevo y suite Playwright anterior. No se verificaron ejecuciones en esta tarea. |
| **Aprobación/versionado** | `platform/scenarios.ts` guarda versiones inmutables, hash, validación, aprobación explícita y resultado del dry-run. El runner vuelve a validar el hash antes de ejecutar. | Implementación real en backend; editor/aprobación de la plataforma no están expuestos en la UI actual. |
| **Eventos/consola** | `platform/run-events.ts` adapta envelopes de Cucumber a eventos tipados. `platform/runs.ts` persiste eventos; `platform/api.ts` reproduce eventos anteriores y transmite los nuevos por SSE. | El backend tiene un flujo real de eventos. La consola visible de `src/planner.jsx` usa el polling del runner anterior; no consume el stream SSE nuevo. |
| **Persistencia** | `platform/store.ts` escribe JSON y artefactos en archivos locales, con reemplazo atómico, archivos exclusivos para datos inmutables y colas por archivo dentro de un proceso. Configuración predeterminada: carpeta `workspace` en la raíz. | Implementación real, sin base de datos. El propio store indica que no soporta varios procesos de servidor compartiendo el mismo workspace. |
| **Historial/reportes** | El runner nuevo guarda ejecuciones y artefactos por proyecto, con `messages.ndjson`, reporte HTML, screenshots y trace. El flujo anterior conserva historial en `test-results/runs.json` y reporte Playwright. | Hay persistencia de ambos flujos, pero son superficies separadas. |
| **Seguridad** | `platform/security.ts` valida hosts autorizados, rutas dentro del workspace, IDs y redacción de secretos. El runner bloquea solicitudes fuera de los orígenes permitidos; la aprobación aplica controles de riesgo. | Protecciones implementadas en backend; la autenticación y controles de acceso del panel no aparecen implementados. |

## Persistencia y artefactos

El backend de plataforma organiza la información en archivos bajo `QA_WORKSPACE` o `workspace/` por defecto. Por proyecto mantiene configuración, inventario, navegación, planes, escenarios/versiones, aprobaciones, ejecuciones y evidencia. Las features se guardan como versiones en el workspace, no como una suite de archivos bajo un directorio `features/` del código fuente.

`test-results/` y `playwright-report/` son artefactos del flujo heredado y están excluidos por `.gitignore`. En el árbol inspeccionado también hay artefactos ignorados de pruebas/probes previos; su presencia no demuestra por sí sola que el flujo haya sido validado en esta sesión.

## Pruebas y documentación observadas

- Las únicas pruebas con contenido son `tests/planner.spec.js` y `tests/sample-app.spec.js` (cinco casos Playwright en total según sus definiciones).
- `tests/platform-ui.spec.js`, `tests/integration/helpers.ts`, `tests/integration/platform.test.ts` y los archivos bajo `tests/unit/` tienen 0 bytes. Por tanto, hay nombres/ubicaciones reservados para pruebas de plataforma, pero no pruebas implementadas en esos archivos.
- `npm test` ejecuta Playwright Test según `package.json`; no hay un comando declarado para ejecutar directamente los tests unitarios TypeScript.
- No ejecuté tests, builds, instalaciones ni llamadas a servicios durante esta inspección; el estado de funcionamiento del backend nuevo queda sin verificación de runtime.
- `README.md` empieza describiendo la demo anterior y contiene además un bloque extenso del prompt maestro. No representa una guía breve y actualizada del flujo de plataforma.
- `docs/platform.md` está vacío.

## Conclusión frente al objetivo

La base backend cubre una parte amplia del diseño solicitado: planificación local con Ollama, exploración, catálogo determinista de acciones, generación/validación de Gherkin, aprobación versionada, ejecución Cucumber + Playwright, eventos y almacenamiento en archivos.

El trabajo pendiente prioritario es conectar una interfaz funcional a la API de plataforma: seleccionar/crear proyectos, configurar URL y acceso, explorar, enviar la historia, revisar y editar el feature, aprobar una versión, lanzar la ejecución y mostrar eventos/artefactos e historial reales. También hacen falta pruebas con contenido para la plataforma y documentación operativa coherente con el backend actual.

**Resultado de la inspección original:** se creó el inventario sin modificar código ni instalar dependencias. La implementación y validación posteriores están resumidas en “Estado vigente después de la integración”.
