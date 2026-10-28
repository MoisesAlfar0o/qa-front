# ROL
Actúa como Principal Software Engineer full-stack con experiencia en Node.js, React, Playwright y herramientas de orquestación de agentes de IA. Trabajas dentro del repo `lafiservicios-frontend-qa-automation`. Tu trabajo es terminar, probar y pulir la plataforma web local de orquestación E2E que vive en `/app`, hasta dejarla lista para uso profesional por personas técnicas y por QA/negocio.

# PASO 0: LEE ANTES DE TOCAR NADA
Lee completos: `CLAUDE.md` (o `AGENTS.md`), `README.md`, `docs/workflow.md`, `docs/getting-started.md`, todos los ADR de `docs/adr/` (0001 a 0004), `.claude/commands/new-test.md`, `.claude/agents/*.md`, `playwright.config.ts`, `steps/fixtures.ts`, `steps/common.steps.ts` y la carpeta `app/` entera.

# QUÉ ES LA PLATAFORMA (estado actual)
Una app local (React 18 + Vite 5 + Express 5, pnpm, Zero-DB) que es la cara gráfica del flujo `/new-test`. No reimplementa el agente: lanza uno externo (Claude Code o Cursor CLI) en modo no interactivo.

Flujo esperado por feature:
1. Borrador: formulario (área, dónde, qué haces, qué debe pasar) -> el agente escribe SOLO el `.feature` en `features/<área>/`.
2. Revisión: la persona edita el `.feature` en la app y pulsa Aprobar (se guarda el SHA-256 en `app/data/approvals.json`).
3. Generar steps: el agente implementa los step definitions en `steps/` usando el MCP de Playwright con la sesión ya iniciada.
4. Ejecutar: `pnpm bddgen` + Playwright (todo el feature o un escenario). Si pasa el feature completo, se guarda el hash de `.feature` + `steps/**` y queda VERIFIED. Si los steps cambian después, el estado pasa a IMPLEMENTATION_DRIFT.

Archivos: `app/server/{server.js,jobs.js,lib.js,agent-runner.js}`, `app/src/{App.jsx,main.jsx,styles.css}`, `app/data/{approvals.json,config.json,runs/}`.
Estados de feature: NOT_APPROVED, CHANGED, APPROVED, VERIFIED, IMPLEMENTATION_DRIFT. Estados de job: QUEUED, RUNNING, DONE, FAILED, CANCELLED, AUTH_REQUIRED.

# REGLAS INQUEBRANTABLES
1. ADR 0002: la app NUNCA inicia sesión, ni ejecuta `pnpm auth:manual`, ni escribe credenciales. Si la sesión falta o expiró, solo avisa a la persona (mensajes "No hay una sesión guardada" / "La sesión guardada expiró").
2. Solo `pnpm`. Zero-DB: todo estado en archivos locales.
3. Windows y macOS: nada específico de un SO sin alternativa. Playwright se lanza con `node node_modules/@playwright/test/cli.js` (ADR 0004), nunca `cmd /c` ni `npx`.
4. Sin shell para nada que contenga texto del usuario. El prompt del usuario va a un archivo; al agente solo se le pasa una instrucción fija.
5. Código de Playwright generado: aserciones web-first con `expect`; prohibido `waitForTimeout`, `networkidle` y XPath; selectores `getByRole > getByLabel > getByPlaceholder > getByText > getByTestId`.
6. Solo flujos de lectura (el usuario es personal, ver ADR 0002). Sin datos reales ni credenciales en ningún archivo.
7. No hagas commit ni push. No edites `.features-gen/`. No cambies `.claude/agents/` ni `.claude/commands/` salvo que lo pida una tarea de abajo (esos cambios van por PR).
8. No afirmes que algo funciona si no lo ejecutaste. Al final separa claramente "verificado ejecutándolo" de "no verificado".

# LO QUE NO ESTÁ VERIFICADO (compruébalo primero y corrígelo)
- Los flags del agente en `app/data/config.json`: `claude -p` y `cursor-agent -p`. Confirma contra la documentación oficial y contra la versión instalada. Averigua qué permisos/flags necesita cada herramienta para usar el MCP y editar archivos sin pedir confirmación, y déjalo configurable.
- Que el agente de Cursor realmente use `.cursor/mcp.json` con el servidor `playwright-test` (comando: `node node_modules/@playwright/test/cli.js run-test-mcp-server`). Crea ese archivo y `AGENTS.md` si faltan.
- Que `pnpm install` en `app/` funcione sin interferir con el `package.json` y el lockfile de la raíz (revisa si hay `pnpm-workspace.yaml`).
- El formato real de la salida de `pnpm bddgen` cuando faltan steps.
- Que la carpeta de salida del reporte HTML sea `playwright-report` y que el enlace "Reporte HTML" funcione (en dev vía el proxy de Vite y en producción).
- El quoting de argumentos en Windows (shell:true solo para `pnpm` y el agente).
- Que SSE funcione a través del proxy de Vite sin buffering.

# TAREAS (en este orden; termina y verifica cada fase antes de pasar a la siguiente)

## Fase 1. Que arranque
`pnpm install` y `pnpm dev` dentro de `app/`; `pnpm build` y `pnpm start` (Express sirviendo `dist/`). Corrige lo que falle. Añade un script `check` que corra lint y tests, y un `README.md` en `app/` con requisitos, arranque, configuración del agente y solución de problemas.

## Fase 2. Adaptador del agente
Haz que el agente sea intercambiable y configurable en `app/data/config.json` (claude, cursor, y un agente `fake` para pruebas: un script Node que imprime líneas, crea un `.feature` de ejemplo, y puede simular fallo, sesión expirada y salida lenta). Valida la configuración al arrancar y muestra en la UI un error claro si el comando no existe. Permite definir un timeout por job.

## Fase 3. Funcionalidad que falta o es frágil
a. Al arrancar el servidor, marcar como FAILED los jobs que quedaron en RUNNING/QUEUED (la cola vive en memoria).
b. Guardrail de código generado (`guards`): tras un job `implement`, analiza los `steps/**/*.ts` cambiados y avisa en la UI si contienen `waitForTimeout`, `networkidle`, XPath (`//`, `xpath=`), credenciales, o `.nth()` sin justificación. No borres nada: marca el job con advertencias visibles.
c. Detección de pasos faltantes: antes de "Generar steps", ejecuta `pnpm bddgen` (según su formato real), muestra en la UI cuántas frases faltan y cuáles, y deshabilita el botón si no falta ninguna.
d. Vista de cambios (git): hoy `git diff` no muestra archivos nuevos sin seguimiento. Muestra también su contenido, con un tope de tamaño.
e. Cola: cancelación fiable en ambos SO (árbol de procesos), límite de líneas de log por job, rotación del historial.
f. Mensajes de error claros y accionables para: sesión ausente/expirada, agente no instalado, `bddgen` fallido, feature modificado, deriva de implementación.
g. Seguridad local: escucha solo en 127.0.0.1, validación de origen, además exige un encabezado personalizado en las peticiones que modifican estado. Revisa path traversal y que ningún texto de usuario llegue a un shell.

## Fase 4. Pruebas automatizadas (usa Node test runner o Vitest; sin dependencias innecesarias)
- Unitarias: hashing SHA-256 determinista (mismo resultado con CRLF/LF y con distinto orden de archivos), `statusOf` para todos los estados, validación de rutas y de áreas, parseo de escenarios y títulos.
- Integración del backend con el agente `fake`: crear job, streaming SSE con replay por `Last-Event-ID`, cancelación, cola de uno en uno, AUTH_REQUIRED, aprobación y transición a VERIFIED y a IMPLEMENTATION_DRIFT, arranque con jobs huérfanos.
- E2E de la propia UI con Playwright (web-first, sin `waitForTimeout`): flujo completo con el agente `fake`: crear borrador -> aparece y se abre -> editar y guardar -> aprobar -> generar steps -> ejecutar -> VERIFIED; área nueva; ejecutar un solo escenario; historial tras reiniciar el servidor; botón "Ir al final" del scroll-lock; throttle de la consola con 20.000 líneas sin congelar la UI.

## Fase 5. Diseño y UX (calidad profesional)
Mejora el diseño sin perder estas decisiones: pieza central = la línea de avance de 4 etapas del feature; panel inferior con Consola e Historial; barra lateral con features y su estado.
- Diseña con intención: paleta y tipografía propias de una herramienta de QA bancaria, evita el look genérico de plantilla (tarjetas idénticas, degradados, etiquetas en mayúsculas, acentos por defecto). Define tokens (color, tipo, espaciado) en CSS variables.
- Estados vacíos y de error que digan qué hacer. Textos en español, voz activa, el mismo nombre para la misma acción en todo el flujo.
- Accesibilidad: foco visible, navegación por teclado, contraste AA en claro y oscuro, `prefers-reduced-motion`, roles ARIA correctos en pestañas y consola.
- Responsive hasta móvil. Revisa tu propio trabajo con capturas de pantalla en claro y oscuro, y escritorio y móvil, antes de darlo por terminado.
- Editor del `.feature`: resaltado simple de palabras clave de Gherkin (`Característica`, `Escenario`, `Dado`, `Cuando`, `Entonces`, `Y`, etiquetas) y aviso si falta `# language: es`. Sin añadir librerías pesadas.

## Fase 6. Prueba de punta a punta con el agente REAL
Con una sesión válida (`pnpm auth:manual`, que la ejecuta la persona, no tú), ejecuta el flujo completo con una prueba de solo lectura en `services`: borrador -> aprobar -> generar steps -> ejecutar -> VERIFIED. Prueba también la ruta de sesión expirada (renombrando temporalmente `test-results/.auth/user.json`) y restáurala. Documenta cualquier ajuste necesario en los flags, permisos o prompts (`app/server/agent-runner.js`). Si hay que cambiar los agentes de `.claude/`, propónlo como diff sin aplicarlo.

## Fase 7. Documentación
`app/README.md` completo y un ADR `docs/adr/0005-e2e-orchestrator-app.md` (estado: propuesta) con contexto, decisión (app local + agente externo, Zero-DB, hash de deriva), consecuencias y alternativas descartadas (navegador embebido). Actualiza el índice de `docs/adr/README.md`.

# CRITERIOS DE ACEPTACIÓN
- `pnpm install && pnpm dev` funciona en Windows y macOS (indica en cuál lo probaste de verdad).
- Todas las pruebas de la Fase 4 pasan y se ejecutan con un solo comando.
- El flujo completo de la Fase 6 funciona con el agente real, o queda documentado exactamente qué falla y por qué.
- Ninguna ruta de código intenta iniciar sesión ni escribir credenciales.
- Sin `waitForTimeout`, `networkidle` ni XPath en ningún código nuevo, ni en el de la app ni en el generado.

# FORMATO DE ENTREGA
1. Resumen de lo hecho por fase.
2. Lista "verificado ejecutándolo" vs "no verificado".
3. Cambios que requieren decisión humana o un PR aparte (por ejemplo, cambios en `.claude/`).
4. Problemas encontrados que no resolviste, con su causa probable.
No hagas commit ni push.



## Fase 8 (OPCIONAL: solo si la persona lo pide explícitamente). Navegador visible dentro del front

Objetivo: mientras corre un job que usa navegador (ejecución de Playwright y, si es viable, generación de steps con el MCP), la UI muestra en vivo lo que ocurre en Chromium, en un panel dentro de la página. Hoy la ventana de Chromium solo se ve en la máquina local.

### Reglas específicas
1. ADR 0002: el visor es SOLO LECTURA. No reenvíes clics, teclado ni foco desde la página al navegador. Así nadie puede escribir credenciales a través de la app, y la app sigue sin iniciar sesión jamás.
2. El puerto de depuración (CDP) se abre solo mientras corre un job, en 127.0.0.1, con puerto aleatorio libre. Nunca se expone a la red ni se deja abierto al terminar.
3. No toques `playwright.config.ts` sin avisar. Si hace falta un cambio mínimo (por ejemplo, pasar `--remote-debugging-port` leyendo una variable de entorno solo cuando esté definida), entrégalo como diff propuesto para un PR y haz que la app funcione sin él (el visor se desactiva con un aviso claro).
4. El visor no puede bloquear ni ralentizar la cola ni la ejecución. Si falla, el job continúa y la UI muestra "Vista en vivo no disponible: <motivo>".

### Diseño sugerido (verifica contra la documentación oficial antes de implementar)
- Backend: un módulo `app/server/screencast.js` que, cuando el job de ejecución arranque Chromium con el puerto CDP, se conecte por CDP (por ejemplo con `Page.startScreencast`, o con `chromium.connectOverCDP` de playwright-core) y reenvíe frames JPEG a la UI por SSE o WebSocket.
- Limita a unos 8-10 fps, calidad JPEG moderada y tamaño máximo; descarta frames si el cliente va lento (backpressure). Un solo visor activo por job.
- Frontend: un componente `LiveBrowser` en el panel inferior (nueva pestaña "Navegador") que dibuja los frames en un `<canvas>` o `<img>`, con estado (conectando, en vivo, finalizado, no disponible) y un botón para pausar. Cuida accesibilidad (texto alternativo, no depende solo del color) y que se vea bien en claro y oscuro.
- Al terminar el job, conserva el último frame y ofrece el reporte HTML o la traza como alternativa para revisar después.

### Qué averiguar primero (no lo des por hecho)
- Si el MCP de Playwright que usa el agente permite exponer su navegador por CDP. Si no es viable, limita el visor a las ejecuciones de Playwright y documéntalo.
- Si el modo headless de Chromium también permite screencast por CDP (debería), de modo que el visor funcione aunque `PLAYWRIGHT_HEADLESS=true`.
- Alternativas para comparar y descartar con argumentos: modo UI de Playwright incrustado, video/traza solo post-ejecución, o un visor remoto tipo VNC. Documéntalas en el ADR.

### Pruebas
- Unitarias y de integración con un origen de frames falso (sin Chromium real): arranque y parada, descarte de frames bajo carga, desconexión del cliente, cierre del puerto al terminar el job.
- E2E de la UI con el origen falso: el panel pasa de "conectando" a "en vivo" y a "finalizado", y muestra el mensaje de no disponible cuando falla.
- Prueba manual con Chromium real durante una ejecución, en Windows y macOS (indica en cuál lo probaste).

### Criterios de aceptación de esta fase
- Durante una ejecución real se ven frames en la pestaña "Navegador" con latencia razonable.
- Ninguna interacción de la página llega al navegador (verifícalo con una prueba).
- El puerto CDP queda cerrado al terminar o cancelar el job, y solo escuchó en 127.0.0.1.
- Si algo falla, la ejecución sigue y la UI lo explica.
- Actualiza el ADR 0005 y `app/README.md` con esta decisión.
