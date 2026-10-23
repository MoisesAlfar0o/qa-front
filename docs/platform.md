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