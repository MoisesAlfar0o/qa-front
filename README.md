# Quality Desk: demo de QA automation con Playwright

Este proyecto es un ejemplo local de una herramienta de QA. Incluye un panel de reportes, un planner que usa Ollama localmente para proponer un plan de pruebas estructurado y un ejecutor que lo corre con Playwright en Chromium. También incluye una aplicación de tareas para probar el flujo de punta a punta.

## Requisitos

- Node.js 20 o superior
- npm
- [Ollama](https://ollama.com/download) instalado y activo

## Instalar y ejecutar

Desde esta carpeta:

```powershell
npm install
npx playwright install chromium
ollama pull qwen2.5:3b
npm run dev
```

Abre [http://127.0.0.1:4173](http://127.0.0.1:4173) para el panel de reportes. Abre [http://127.0.0.1:4173/planner](http://127.0.0.1:4173/planner) para crear un proyecto, explorar la aplicación, generar y revisar un escenario, aprobar una versión y ejecutarla. El laboratorio local para probar el flujo está en [http://127.0.0.1:4173/lab](http://127.0.0.1:4173/lab).

Ollama se ejecuta en tu propio equipo; no se necesita una clave de API ni se envía la historia a un proveedor externo. La primera vez, `ollama pull qwen2.5:3b` descarga el modelo gratuito, que ocupa varios GB y puede tardar según la conexión. En Windows, Ollama suele quedarse activo en segundo plano después de instalarlo. El status del planner indica si el servicio y el modelo están disponibles.

La URL objetivo puede cambiarse desde el planner, pero por seguridad esta demo acepta únicamente `localhost`, `127.0.0.1` y `[::1]`. Inicia primero la aplicación que quieras probar en una de esas direcciones. La navegación del navegador también bloquea solicitudes a destinos externos.

Para cambiar modelo o dirección local de Ollama en PowerShell, antes de `npm run dev`:

```powershell
$env:OLLAMA_MODEL = "qwen2.5:3b"
$env:OLLAMA_URL = "http://127.0.0.1:11434"
npm run dev
```

## Qué ocurre al ejecutar

1. En `/planner`, crea un proyecto con la URL autorizada y explóralo. Playwright guarda el inventario observado y el mapa de navegación; Playwright MCP se usa cuando está habilitado y disponible.
2. El planner envía la petición y el contexto observado a Ollama mediante `POST /api/projects/:pid/plans`. La respuesta JSON se valida y se resuelve contra el catálogo de acciones, elementos y módulos observados.
3. El backend genera Gherkin determinista, valida el `.feature` y comprueba las definiciones con el dry-run de Cucumber.js. La interfaz permite revisar y guardar versiones inmutables.
4. Aprobar una versión comprueba su hash y validación. Solo una versión aprobada puede ejecutarse.
5. `POST /api/projects/:pid/runs` ejecuta el escenario aprobado con Cucumber.js y Playwright. Los eventos SSE alimentan la consola; el historial, los reportes, las capturas y las trazas se guardan localmente.

La plataforma persiste proyectos, inventarios, planes, escenarios/versiones, aprobaciones, eventos y evidencias en `workspace/` por defecto. Puedes cambiarlo con `QA_WORKSPACE`. Los endpoints y detalles de seguridad están en [docs/platform.md](./docs/platform.md). El panel de reportes de `/` conserva además su flujo de suite fija independiente.

## Comandos

| Comando | Para qué sirve |
| --- | --- |
| `npm run dev` | Inicia el frontend y la API local |
| `npm test` | Ejecuta las pruebas desde la terminal |
| `npm run test:ui` | Abre el modo interactivo de Playwright |
| `npm run build` | Construye el frontend para producción |

## Ideas para ampliarlo

- Guardar ejecuciones en una base de datos compartida.
- Integrar la ejecución con GitHub Actions o el CI de la empresa.
- Añadir filtros por navegador, ambiente, rama o suite.
- Proteger el panel con autenticación antes de publicarlo en una red.
- Asociar capturas y trazas a cada caso fallido.

Esta demo no está diseñada para exponerse a Internet: no incorpora autenticación y su API puede iniciar Chromium y ejecutar acciones limitadas en una URL local indicada por el usuario.

La IA ofrece una propuesta, no una garantía. No se ejecuta código generado por el modelo: el backend valida el JSON, resuelve las referencias observadas y genera Gherkin con pasos del catálogo. Una persona revisa y aprueba cada versión antes de ejecutarla. Esta aplicación local no incorpora autenticación de usuarios; no la expongas a una red no confiable.

Despues de cada fase:
## Actualización obligatoria del estado del proyecto

Al finalizar esta fase, actualiza `estado_proyecto.md` conservando su contenido anterior y el historial de progreso.

Añade:
- Fase completada y fecha.
- Resumen de los cambios realizados.
- Archivos creados o modificados.
- Pruebas y verificaciones realmente ejecutadas y sus resultados.
- Funcionalidades implementadas, parciales y pendientes.
- Bloqueos o dependencias externas.
- Siguiente fase recomendada.

No elimines el diagnóstico inicial ni sobrescribas los informes de las fases anteriores. Distingue claramente entre código implementado y comportamiento verificado. Si la fase no pudo completarse, documenta el estado real y no la marques como terminada.

HASTA ABAJO PROMPT MAESTRO CREAR .MD

# FASE 1 — AUDITORÍA DEL ESTADO ACTUAL DEL PROYECTO

Actúa como arquitecto de software sénior y auditor técnico especializado en TypeScript, Ollama, Playwright, MCP, Gherkin y Cucumber.js.

Lee primero `PROMPT_MAESTRO.md`, que contiene los requisitos funcionales y arquitectónicos del proyecto.

Tu tarea es determinar exactamente qué dejó implementado el desarrollador anterior, qué funciona según la evidencia disponible y qué queda pendiente.

## Restricciones

- No escribas ni modifiques código fuente.
- No modifiques archivos existentes, excepto `estado_proyecto.md` si necesitas crearlo o actualizarlo.
- No instales dependencias.
- No ejecutes scripts, pruebas ni procesos del proyecto.
- No inicies Ollama, navegadores, servidores ni integraciones MCP.
- No elimines, reorganices ni reformatees archivos.
- No muestres secretos, tokens, contraseñas ni claves API.
- No inventes resultados de ejecuciones.

Utiliza únicamente inspección estática y comandos de lectura.

## Inspección

Revisa la estructura del repositorio, `package.json`, dependencias, scripts, configuración, puntos de entrada, rutas, servicios, componentes, pruebas y documentación.

Identifica el estado de:

1. Frontend y consola de ejecución existentes.
2. Backend y comunicación entre frontend y backend.
3. Ollama y el planner.
4. Contrato JSON y validación de planes.
5. Normalización del lenguaje natural.
6. Playwright MCP y exploración de aplicaciones.
7. Inventario y mapa de navegación.
8. Resolución de elementos y catálogo de acciones.
9. Generación de Gherkin y step definitions.
10. Editor, validación y aprobación.
11. Versionado y hashes.
12. Persistencia local.
13. Runner de Cucumber.js y Playwright.
14. Estados, eventos, reportes y evidencias.
15. Historial, seguridad y concurrencia.
16. Pruebas automatizadas.

Reconstruye el flujo que realmente existe:

Entrada del usuario → planner → validación → Gherkin → aprobación → runner → navegador → eventos → consola → persistencia e historial.

Para cada conexión, indica los archivos y símbolos relevantes. No declares una integración funcional basándote únicamente en que exista una dependencia o un componente visual.

Clasifica cada funcionalidad como implementada estáticamente, verificada previamente con evidencia, parcial, solo visual, simulada, ausente o pendiente de verificación.

## Entregable

Crea `estado_proyecto.md` en la raíz del repositorio con:

- Resumen del estado actual.
- Stack y estructura detectados.
- Componentes que conviene reutilizar.
- Tabla de requisitos y su estado.
- Descripción del flujo real y de sus desconexiones.
- Archivos importantes y sus responsabilidades.
- Errores, duplicaciones y riesgos identificados.
- Pruebas existentes y qué evidencia puede confirmarse estáticamente.
- Orden recomendado de implementación, priorizando el flujo P0 del PROMPT MAESTRO.

Distingue los hechos observados de las inferencias. Si no se puede confirmar algo sin ejecutar código, indícalo expresamente.

Al terminar, informa brevemente qué encontraste y confirma qué archivo creaste. No inicies la implementación.

Esta fase es exclusivamente de auditoría.

# FASE 2 — CONTRATOS, VALIDACIÓN Y CATÁLOGO CANÓNICO DE ACCIONES

Lee `PROMPT_MAESTRO.md` y `estado_proyecto.md`. Comprueba en el código las conclusiones de la auditoría que afecten a esta fase.

Actúa como ingeniero sénior y trabaja exclusivamente en los contratos y validadores necesarios para establecer una base fiable para el flujo P0.

## Objetivo

Definir o corregir el contrato del plan interno y el catálogo de acciones ejecutables, adaptándolos a la arquitectura existente.

Antes de crear una abstracción, busca si ya existe una implementación reutilizable. No dupliques tipos, servicios ni validadores.

## Requisitos

1. El plan debe distinguir, como mínimo, los estados `ready`, `needs_clarification` y `unsupported`.
2. Debe contener la intención del usuario, el objetivo del escenario, las acciones ordenadas, los parámetros tipados, los objetivos o elementos referenciados, las aserciones, las precondiciones y las aclaraciones pendientes que sean necesarias.
3. Debe distinguir las acciones de las aserciones.
4. Debe poder representar advertencias, capacidades faltantes, evidencia disponible y riesgos relevantes.
5. Las acciones deben pertenecer a un catálogo conocido y tener parámetros validados.
6. Deben existir validaciones separadas para sintaxis JSON, estructura del contrato y significado ejecutable.
7. Un plan con acciones desconocidas, parámetros inválidos o ambigüedades esenciales no puede considerarse listo.
8. El catálogo debe identificar cuáles acciones están realmente implementadas y cuáles no están disponibles.
9. No codifiques valores de ejemplo como Moisés, Rolando, USD, Catálogos o Productos como reglas fijas del producto.
10. Evita sobrearquitectura: crea únicamente las interfaces, módulos y servicios que resuelvan necesidades concretas del repositorio.

Utiliza el mecanismo de validación ya instalado, si resulta apropiado. Incorpora una dependencia nueva solo si es necesaria y está técnicamente justificada.

## Pruebas

Añade o adapta pruebas para validar contratos correctos, parámetros inválidos, acciones desconocidas, planes incompletos y situaciones ambiguas.

Las pruebas deben verificar los resultados reales de los validadores. No sustituyas la lógica de producción por datos simulados.

## Límites

No intentes implementar todavía toda la integración con Ollama, la exploración MCP ni el runner completo.

No reconstruyas el frontend.

## Finalización

Ejecuta las comprobaciones pertinentes que existan en el repositorio. Informa cuáles ejecutaste y sus resultados reales.

Actualiza `estado_proyecto.md` agregando una sección de progreso de esta fase, archivos modificados, pruebas realizadas y pendientes.

No hagas commits ni pushes. No inicies la siguiente fase automáticamente.

# FASE 3 — PLANNER CON OLLAMA Y NORMALIZACIÓN SEMÁNTICA

Lee `PROMPT_MAESTRO.md`, `estado_proyecto.md` y los contratos implementados en la fase anterior.

Inspecciona la integración actual antes de modificarla. Reutiliza lo que sea correcto y reconstruye solamente las partes defectuosas o ausentes.

## Objetivo

Implementar un planner que reciba instrucciones en lenguaje natural, genere un plan estructurado y lo valide con los contratos reales del proyecto.

## Integración con Ollama

- Utiliza una integración real con Ollama.
- Configura la URL, el modelo, los timeouts y los límites mediante variables de entorno apropiadas.
- No expongas configuración sensible en el frontend.
- Utiliza salida estructurada mediante JSON Schema cuando sea compatible con el modelo y la versión instalada.
- Valida siempre la respuesta recibida antes de utilizarla.
- Maneja conexión fallida, modelo inexistente, respuesta truncada, JSON inválido y timeout.
- Limita los reintentos y devuelve errores controlados si la generación sigue fallando.
- No presentes respuestas de ejemplo o mocks como resultados de Ollama.

Si Ollama no está disponible en el entorno actual, permite verificar los contratos mediante pruebas controladas, pero informa que la integración real queda pendiente de comprobar. No simules una conexión exitosa.

## Interpretación y normalización

Reconoce distintas formulaciones que expresen la misma acción cuando el contexto y la evidencia disponibles lo permitan.

Por ejemplo, varias expresiones equivalentes para rellenar un campo deben producir el mismo tipo de acción canónica, con parámetros y objetivo compatibles.

Distingue entre solicitudes equivalentes, acciones compuestas, información faltante, contradicciones, ambigüedad esencial y capacidades no implementadas.

No dependas exclusivamente de expresiones regulares ni de diccionarios de sinónimos. Utiliza Ollama para interpretar la intención y los validadores deterministas para comprobar el resultado.

La generación del plan no debe producir código ejecutable ni inventar steps de Cucumber.

Si aún no existe evidencia suficiente para resolver el módulo o un elemento, el plan debe reflejar la incertidumbre o pedir una aclaración; no debe inventar rutas ni selectores.

## Pruebas

Comprueba la validación de las respuestas, la equivalencia semántica, las ambigüedades, las acciones no soportadas y los errores del proveedor.

Distingue las pruebas con respuestas controladas de las pruebas que verifican una conexión real con Ollama.

## Finalización

Actualiza `estado_proyecto.md` con lo implementado, las pruebas que ejecutaste, las comprobaciones pendientes y los bloqueos reales.

No rehagas los contratos de la fase anterior sin una razón técnica documentada. No continúes todavía con la siguiente fase.

# FASE 4 — GENERACIÓN DETERMINISTA DE GHERKIN, EDITOR Y APROBACIÓN

Lee `PROMPT_MAESTRO.md`, `estado_proyecto.md` y la implementación del planner y el catálogo de acciones.

## Objetivo

Conectar el plan validado con un generador determinista de Gherkin y completar el flujo de revisión, edición, validación y aprobación.

## Generación

1. Las acciones canónicas validadas deben convertirse en pasos Gherkin mediante plantillas conocidas.
2. Cada paso generado debe corresponder a una step definition real y compatible.
3. No permitas que Ollama invente frases Gherkin arbitrarias y después intentes encontrar una definición que coincida.
4. Valida la sintaxis del `.feature`, los parámetros, las acciones, los steps requeridos y las aserciones.
5. No conviertas acciones no soportadas en pasos ficticios.
6. No generes un escenario ejecutable cuando existan ambigüedades esenciales o precondiciones incumplidas.
7. Conserva el plan y el texto original asociados al escenario.

La generación debe ser determinista respecto del plan normalizado y las plantillas utilizadas.

## Interfaz

Inspecciona el frontend existente y reutiliza el editor o los componentes de escenario si ya existen.

El usuario debe poder visualizar el archivo real, editarlo, guardar un borrador, validarlo y consultar los errores relevantes.

No crees una segunda interfaz si la actual puede adaptarse.

## Aprobación y versiones

Implementa o completa un mecanismo que vincule la aprobación con una versión específica del contenido.

- Guarda una versión identificable del escenario y de su archivo `.feature`.
- Calcula un hash criptográfico del contenido que se aprobará.
- Conserva las versiones anteriores sin sobrescribirlas.
- Registra cuándo y qué versión se aprobó.
- Si cambia el contenido, crea una nueva versión borrador y exige validarla y aprobarla de nuevo.
- Impide aprobar escenarios inválidos o con pasos sin implementación.
- No permitas ejecutar una versión distinta de la aprobada.

Utiliza la persistencia existente o una adaptación mínima de archivos locales. No emplees arrays en memoria como almacenamiento permanente ni añadas una base de datos.

## Pruebas

Comprueba que las acciones conocidas se traduzcan correctamente, que los steps se reconozcan y que una versión modificada o no aprobada no pueda tratarse como aprobada.

## Finalización

Actualiza `estado_proyecto.md` con lo implementado, las verificaciones reales, los archivos afectados y las limitaciones restantes.

No reconstruyas la interfaz ni avances todavía con funcionalidades de exploración avanzada.

# FASE 5 — RUNNER REAL CON CUCUMBER.JS Y PLAYWRIGHT

Lee `PROMPT_MAESTRO.md`, `estado_proyecto.md` y el código existente de escenarios, aprobaciones, steps y ejecución.

## Objetivo

Implementar o completar la ejecución real de escenarios aprobados utilizando Cucumber.js y Playwright.

## Requisitos

1. Comprueba la versión instalada de Cucumber.js y utiliza las APIs y formatos compatibles con ella.
2. Ejecuta exclusivamente la versión aprobada del escenario seleccionado.
3. Verifica su aprobación, su hash, su contenido y la compatibilidad de los steps antes de comenzar.
4. Rechaza contenido modificado, no aprobado, inválido o incompatible.
5. Utiliza código controlado en las step definitions. No ejecutes código generado libremente por IA.
6. Utiliza un `World` tipado y los hooks apropiados de Cucumber.js para administrar el contexto del escenario.
7. Gestiona el navegador, el contexto, las páginas y sus recursos de forma aislada.
8. Utiliza Playwright para realizar interacciones y aserciones reales.
9. No confundas un clic exitoso con una operación de negocio exitosa.
10. Distingue fallos de aserción, errores del navegador, fallos de preparación y errores internos del runner.
11. Genera capturas, trazas y reportes cuando estén configurados y realmente disponibles.
12. Vincula la ejecución con la versión exacta del escenario.

El runner debe producir resultados estructurados, incluidos los pasos ejecutados, sus estados, errores y el resultado final.

Define o adapta un contrato tipado de eventos para representar el ciclo de vida del runner. Cada evento debe quedar asociado a la ejecución correspondiente.

Utiliza el mecanismo más simple compatible con el proyecto para recibir los resultados reales. No dependas únicamente de interpretar texto arbitrario de `stdout` como fuente de verdad sobre los pasos.

## Seguridad

No ejecutes pruebas que modifiquen sistemas de producción o realicen acciones destructivas sin autorización. Utiliza entornos de prueba controlados.

No construyas comandos de sistema a partir del texto del usuario ni finalices procesos ajenos a la ejecución.

## Pruebas

Verifica la ejecución de un escenario aprobado contra un entorno controlado. Comprueba al menos un resultado satisfactorio y un fallo intencional cuando el entorno permita hacerlo de forma segura.

No declares que una ejecución es real si solamente se utilizó un mock.

## Finalización

Registra en `estado_proyecto.md` el estado del runner, los resultados de las verificaciones y cualquier dependencia externa pendiente.

No marques como terminada una integración que no hayas podido probar.

# FASE 6 — PERSISTENCIA LOCAL, EVENTOS REALES Y CONSOLA EXISTENTE

Lee `PROMPT_MAESTRO.md`, `estado_proyecto.md` y la implementación real del runner.

## Objetivo

Completar la persistencia de escenarios, aprobaciones, ejecuciones, eventos, resultados, evidencias e historial, y conectar la consola existente a los acontecimientos reales del runner.

## Persistencia

Utiliza el sistema de archivos local. No instales ni configures una base de datos.

Inspecciona si existe ya un servicio de persistencia y reutilízalo cuando sea viable.

La persistencia debe cubrir, según las necesidades reales del proyecto:

- Proyectos y sus configuraciones.
- Inventarios y mapas disponibles.
- Escenarios, versiones y aprobaciones.
- Registros de ejecuciones.
- Eventos ordenados por ejecución.
- Resultados, errores y artefactos generados.
- Historial de ejecución.

Utiliza identificadores únicos, rutas validadas y escrituras atómicas donde correspondan. Evita que una ejecución sobrescriba los datos de otra o que las versiones aprobadas se modifiquen accidentalmente.

El historial debe sobrevivir al reinicio de la aplicación. No uses arrays en memoria como sustituto del almacenamiento persistente.

Protege tokens, credenciales y cookies. No los escribas en planes, Gherkin, logs ni reportes.

## Consola existente

Localiza el componente actual que muestra la ejecución y modifica lo mínimo necesario para conectarlo a los eventos reales.

No crees una segunda consola.

La interfaz debe distinguir los estados reales de la ejecución y de cada paso. Debe reflejar inicios, avances, errores, resultados y artefactos disponibles sin inventar mensajes ni simular progreso.

El backend debe mantener el estado oficial. El frontend debe representar los eventos recibidos y poder recuperar el estado persistido cuando se desconecte o se vuelva a abrir la aplicación.

Reutiliza el transporte existente. Si no existe, selecciona una solución sencilla y adecuada, como SSE o polling, sin implementar varios mecanismos innecesarios.

Contempla desconexiones, recuperación del estado y separación de los eventos pertenecientes a ejecuciones diferentes.

## Reportes e historial

Permite consultar la ejecución, el resultado real, la versión y hash utilizados, los pasos ejecutados, los errores y las evidencias que realmente existan.

No inventes reportes, capturas ni trazas para completar la interfaz.

## Pruebas

Verifica que el resultado persistido coincida con el runner, que el historial sobreviva al reinicio y que los eventos de ejecuciones distintas no se mezclen.

Cuando sea viable, prueba la recuperación del estado después de interrumpir el canal de eventos.

## Finalización

Actualiza `estado_proyecto.md` con las partes implementadas, los resultados reales de las pruebas y los requisitos que sigan pendientes.

Conserva el diseño existente y no cambies tecnologías sin justificación.

# FASE 7 — EXPLORACIÓN, INVENTARIO, MAPA DE NAVEGACIÓN Y RESOLUCIÓN DE ELEMENTOS

Lee `PROMPT_MAESTRO.md`, `estado_proyecto.md`, el planner, el catálogo de acciones y la implementación existente de Playwright.

## Objetivo

Completar las capacidades de exploración y resolución de elementos para que el sistema pueda interpretar una solicitud y relacionarla con la estructura real de la aplicación objetivo.

## Playwright MCP

Inspecciona la configuración y determina qué herramientas, transportes e integraciones existen realmente.

Distingue entre el MCP disponible en el entorno de desarrollo y una integración que el backend del producto pueda invocar.

Si MCP no está disponible, documenta la limitación. Puedes utilizar la exploración directa con Playwright si corresponde a la arquitectura y está autorizada. No simules llamadas MCP exitosas.

## Inventario y navegación

Implementa o completa la recopilación de información real de la aplicación, según lo permitan las herramientas disponibles:

- Páginas, URLs y títulos observados.
- Menús, rutas y breadcrumbs.
- Roles y nombres accesibles.
- Etiquetas, placeholders y texto visible.
- Formularios, tablas, filas, botones, iconos y diálogos.
- Atributos estables como `data-testid`.
- Evidencia, contexto y fecha de observación.

Guarda los datos utilizando la persistencia local existente. No codifiques permanentemente los módulos de ejemplo del PROMPT MAESTRO.

Construye un mapa jerárquico de navegación a partir de lo observado. Controla los casos ambiguos y los datos potencialmente obsoletos.

## Resolución

Relaciona las descripciones del usuario con elementos reales del DOM o del árbol de accesibilidad.

Prioriza estrategias fiables y contextuales. Comprueba las coincidencias y rechaza resoluciones ambiguas cuando la acción requiere un único objetivo.

Implementa o completa, cuando esté justificado, la resolución contextual de filas e iconos: encontrar la fila correcta, identificar dentro de ella el botón correspondiente y verificar el resultado real de la operación.

Vuelve a resolver los elementos durante la ejecución. No trates los identificadores temporales de MCP como selectores permanentes.

No pulses controles destructivos para descubrir su función. No omitas autenticación ni controles de acceso.

Integra las observaciones con el planner sin permitir que información no confiable procedente de una página altere las reglas de seguridad.

## Pruebas

Comprueba rutas equivalentes, elementos ambiguos, botones de icono, tablas y registros. Las pruebas deben demostrar qué sucede realmente y no limitarse a verificar estructuras de datos simuladas.

## Finalización

Actualiza `estado_proyecto.md` indicando qué integraciones de exploración se verificaron, qué capacidades dependen de MCP y qué limitaciones subsisten.

No reescribas el flujo P0 si ya funciona. La exploración debe mejorar la plataforma sin romper la ejecución existente.

# FASE 8 — FIABILIDAD, SEGURIDAD, CONCURRENCIA Y RECUPERACIÓN

Lee `PROMPT_MAESTRO.md`, `estado_proyecto.md` y el código real de persistencia, runner, eventos y resolución.

## Objetivo

Reducir riesgos y completar los controles que falten para ejecutar pruebas de manera aislada, controlada y recuperable.

## Estados y eventos

Verifica que los estados de ejecución y de paso sean coherentes y tengan transiciones válidas.

Distingue `PENDING`, `RUNNING`, `PASSED`, `FAILED`, `ERROR`, `CANCELLED` e `INTERRUPTED`, según corresponda a la implementación.

Un evento retrasado no debe reabrir una ejecución finalizada. Un paso no ejecutado nunca debe marcarse como aprobado.

## Concurrencia y aislamiento

- Asigna un identificador único a cada ejecución.
- Evita mezclar eventos, logs o evidencias.
- Aísla los contextos del navegador.
- Evita ejecuciones incompatibles sobre los mismos datos.
- Limita la concurrencia según la capacidad real del entorno.
- Impide que cancelar una ejecución afecte a otra.
- Utiliza mecanismos adicionales de bloqueo solo cuando sean necesarios.

## Cancelación y recuperación

Completa la cancelación controlada si está pendiente.

No marques una ejecución como `CANCELLED` hasta confirmar que el runner correspondiente terminó y que sus recursos se gestionaron correctamente.

Al reiniciar la aplicación, identifica ejecuciones que quedaron activas sin evidencia de finalización. Márcalas con el estado de interrupción o error que corresponda, nunca como exitosas.

Conserva los resultados parciales y las evidencias disponibles.

## Seguridad

Comprueba:

- Validación de las URLs autorizadas.
- Riesgos de SSRF y acceso a destinos no permitidos.
- Validación y confinamiento de rutas de archivos.
- Protección de credenciales y tokens.
- Límites de tiempo y concurrencia.
- Rechazo de código ejecutable generado por IA.
- Aprobación explícita para acciones destructivas.
- Protección frente a instrucciones maliciosas incluidas en páginas web.
- Consistencia de los hashes y las versiones aprobadas.

Permite entornos de desarrollo locales autorizados sin abrir indiscriminadamente el acceso a servicios internos.

## Pruebas

Introduce pruebas controladas de errores, cancelación, reinicio, concurrencia e integridad. No provoques acciones destructivas contra sistemas reales.

Corrige los problemas encontrados sin ocultar errores modificando las pruebas para que pasen.

## Finalización

Actualiza `estado_proyecto.md` con los controles implementados, las verificaciones ejecutadas y los riesgos pendientes.

No añadas capas de abstracción o mecanismos de bloqueo innecesarios. Adapta la solución a la arquitectura real del repositorio.

# FASE 9 — AUDITORÍA FINAL Y VALIDACIÓN END-TO-END

Lee `PROMPT_MAESTRO.md` y `estado_proyecto.md`. Examina el código actual y contrasta cada criterio de aceptación con evidencia disponible.

## Objetivo

Verificar el estado final del producto, corregir las regresiones relevantes y documentar con precisión qué está implementado y qué sigue pendiente.

## Validación de extremo a extremo

Comprueba, según las capacidades y dependencias disponibles:

1. El frontend existente se inicia correctamente.
2. Se puede configurar una aplicación de pruebas.
3. El usuario introduce una solicitud en lenguaje natural.
4. El planner produce un plan validado o solicita aclaraciones.
5. Se genera un `.feature` real con steps existentes.
6. El usuario puede revisar y aprobar una versión concreta.
7. El runner ejecuta exactamente la versión aprobada.
8. Playwright interactúa con la aplicación de prueba real.
9. La consola existente recibe y muestra eventos auténticos.
10. El resultado final corresponde a lo ocurrido en la ejecución.
11. Los resultados, eventos y evidencias disponibles se persisten.
12. El historial sobrevive al reinicio.
13. Una versión modificada o no aprobada no puede ejecutarse como si fuera la aprobada.
14. Los errores, cancelaciones y las interrupciones se distinguen correctamente.
15. Las integraciones de Ollama y MCP se describen según su estado real.

Ejecuta pruebas unitarias, de integración, typecheck, lint y compilación utilizando los comandos definidos en el repositorio.

Ejecuta pruebas E2E únicamente en un entorno controlado y autorizado. Si una dependencia externa no está disponible, realiza las verificaciones que sí sean posibles y documenta el bloqueo.

No afirmes haber ejecutado pruebas, utilizado integraciones o comprobado comportamientos que no hayas verificado.

## Correcciones

Corrige los fallos relevantes que se hayan introducido durante las fases anteriores. Evita reescrituras generales si una corrección localizada es suficiente.

No añadas funcionalidades nuevas solo para aparentar que la lista de requisitos está completa.

## Informe final

Actualiza `estado_proyecto.md` con una matriz de criterios de aceptación que utilice exclusivamente estos estados:

- Implementado y verificado.
- Implementado, pero no verificado completamente.
- Parcial.
- Pendiente.
- Bloqueado.

Incluye los comandos realmente ejecutados y sus resultados, los archivos modificados, las decisiones técnicas y las limitaciones conocidas.

Diferencia entre el código existente, las verificaciones automatizadas y las comprobaciones manuales que realmente se hayan realizado.

No elimines información útil de la auditoría inicial.

No hagas commits, pushes, publicaciones ni despliegues.

No marques el proyecto como terminado si todavía existen criterios esenciales pendientes de implementación o verificación.

PROMPT MAESTRO: PLATAFORMA UNIVERSAL DE AUTOMATIZACIÓN E2E CON IA, OLLAMA, PLAYWRIGHT MCP, GHERKIN Y CUCUMBER.JS
1. Objetivo general
Quiero implementar una plataforma funcional de automatización de pruebas web que permita a cualquier usuario describir qué quiere probar mediante lenguaje natural, generar un plan de prueba, revisar un archivo .feature, aprobarlo y ejecutarlo con Playwright mediante Cucumber.js.

El usuario no necesita conocer Gherkin, Cucumber.js, TypeScript ni los selectores de Playwright.

Ya existe un frontend parcialmente desarrollado, incluida una consola o panel que muestra información relacionada con la ejecución y los pasos. Inspecciona primero el repositorio, identifica qué partes funcionan y reutiliza los componentes, rutas, estilos, servicios y tecnologías existentes.

No reconstruyas el frontend desde cero ni crees una segunda consola si los componentes actuales pueden reutilizarse. Identifica lo que falta para conectar la interfaz existente con el proceso real de ejecución.

No reutilices a ciegas la lógica defectuosa del planner, la generación de escenarios o los steps. Rediseña e implementa correctamente esos componentes cuando sea necesario. Si el proyecto está vacío o falta alguna funcionalidad, implementa lo que sea necesario.

La aplicación debe funcionar con distintas aplicaciones web, no únicamente con un sistema específico ni con los módulos de los ejemplos de este documento.

Ejemplo de entrada estructurada:

Dónde: módulo de productos.
Qué hacer: buscar un registro, editarlo y cambiar un campo.
Qué esperar: comprobar que el cambio se ha guardado correctamente.
También debe aceptar instrucciones libres, por ejemplo:

"En Catálogos, entra a Productos, busca el registro cuyo nombre es Moisés, pulsa el botón de edición, cambia el nombre a Rolando, guarda y verifica que se haya actualizado".

El sistema debe interpretar instrucciones equivalentes aunque estén redactadas de forma diferente, conocer la estructura observada de la aplicación, resolver los elementos reales y producir una prueba reproducible.

Los nombres Catálogos, Productos, Clientes, USD, Moisés y Rolando son únicamente ejemplos. No deben convertirse en rutas, datos, nombres de campos o reglas de negocio codificados de forma fija.

Tecnologías y componentes esperados
Frontend existente, conservando su tecnología y diseño cuando sea viable.
Ollama como proveedor inicial de IA para el planner.
JSON Schema y validación en tiempo de ejecución.
Playwright MCP para exploración cuando esté disponible y correctamente configurado.
Playwright para la ejecución real de los escenarios.
Gherkin para especificar las pruebas.
Cucumber.js para ejecutar los archivos .feature.
TypeScript para la lógica de automatización.
Persistencia mediante archivos locales, sin requerir una base de datos.
Consola de ejecución existente integrada con eventos reales del runner.
Reportes, capturas, trazas, versiones e historial reales.
No implementes una demostración que se limite a mostrar una interfaz, devolver JSON de ejemplo o simular ejecuciones. El objetivo es construir un flujo real de extremo a extremo.

Considera que una funcionalidad solo está terminada cuando su implementación y su comportamiento se han verificado. Si una dependencia externa no está disponible, implementa lo que sea posible y comunica explícitamente la limitación, sin presentar una simulación como una integración real.

2. Principios arquitectónicos obligatorios
Separa conceptualmente las responsabilidades siguientes:

Entrada del usuario.
Planner con IA.
Normalización semántica de instrucciones.
Mapa jerárquico de navegación.
Exploración de la aplicación.
Resolución de elementos y localizadores.
Validación del plan.
Generación determinista de Gherkin.
Catálogo de acciones y step definitions.
Preparación del entorno y fixtures.
Editor y aprobación versionada.
Persistencia local.
Runner de Cucumber.js y Playwright.
Gestión de eventos y estados de ejecución.
Consola existente y reporte de resultados.
Estas responsabilidades son límites lógicos, no una obligación de crear una carpeta, clase, servicio o capa independiente para cada una.

Inspecciona primero la arquitectura real del repositorio. Conserva sus patrones útiles y crea nuevas abstracciones solamente cuando resuelvan necesidades concretas.

Si el proyecto utiliza controladores y servicios, módulos funcionales, arquitectura por capas, DDD u otra organización coherente, adapta la implementación a ella. No impongas una arquitectura nueva solo porque este prompt enumera responsabilidades.

Evita crear capas que únicamente reenvíen llamadas, repositorios genéricos innecesarios, servicios monolíticos o duplicados de funcionalidades que ya existen.

Mantén las reglas del dominio, la ejecución del navegador, la comunicación con el frontend y la persistencia suficientemente separadas para que puedan probarse y evolucionar sin acoplamiento innecesario.

La regla principal es:

La IA interpreta y planifica; los validadores comprueban; las plantillas generan Gherkin; los steps ejecutan código controlado; Playwright verifica el comportamiento real; el backend registra el estado oficial; la consola refleja lo que realmente ocurre.

No diseñes la plataforma de manera que la IA invente frases arbitrarias de Gherkin y después intente encontrar definiciones compatibles.

Tampoco generes código TypeScript nuevo para cada variante lingüística ni dependas de una llamada a la IA cada vez que se ejecuta una prueba.

No ejecutes código arbitrario producido por el modelo.

3. Inspección inicial del repositorio
Antes de modificar el código:

Examina la estructura del repositorio, las dependencias, los scripts, las rutas y los servicios.
Identifica el framework del frontend, el backend y las configuraciones existentes.
Localiza la lógica actual de Ollama, el planner, la generación del .feature, los steps y Playwright.
Comprueba qué partes son funcionales, incompletas, duplicadas, defectuosas o simuladas.
Comprueba si Playwright MCP está configurado y qué herramientas y transportes están disponibles.
Distingue las herramientas utilizadas por el entorno de desarrollo de las integraciones disponibles en tiempo de ejecución para el producto.
Identifica el modelo y la versión de Ollama configurados.
Localiza específicamente la consola, terminal, panel de ejecución o componente existente que muestra los pasos.
Comprueba de dónde procede actualmente la información que aparece en esa consola y si son eventos reales, logs, datos persistidos, datos simulados o mensajes generados por el frontend.
Identifica cómo se comunica el frontend con el backend y si ya existe un mecanismo para recibir actualizaciones de ejecución.
Revisa los tipos, contratos, convenciones, pruebas y patrones arquitectónicos existentes.
Identifica las operaciones de persistencia y los mecanismos actuales de control de concurrencia.
Conserva las funcionalidades del frontend que sean útiles.
Determina qué cambios mínimos se necesitan para completar el flujo funcional.
Continúa con la implementación por etapas, sin detenerte esperando confirmación.
No elimines ni sustituyas la consola existente sin una justificación técnica. El objetivo es conectarla a la ejecución real, conservar su identidad visual y completar su funcionalidad.

No asumas que determinadas rutas, módulos o componentes existen. No cambies tecnologías sin una justificación real.

No agregues una base de datos para resolver la persistencia inicial.

Antes de empezar cambios importantes, identifica los archivos implicados y sus dependencias para reducir regresiones y evitar sobrescribir trabajo preexistente.

El diagnóstico inicial debe ser breve y práctico. No te detengas después de presentar un plan: comienza a implementar las funcionalidades prioritarias con base en lo que encuentres.

4. Entrada de lenguaje natural
Mantén o implementa un formulario que permita especificar:

Dónde se realizará la prueba.
Qué acciones se quieren realizar.
Qué resultados se esperan.
Contexto, datos y precondiciones opcionales.
Si el frontend ya usa un único campo de texto, conserva también esa modalidad. Ambas formas deben producir el mismo tipo de plan interno.

Las instrucciones pueden referirse a navegación, formularios, campos, dropdowns, filtros, tablas, botones, iconos, registros, ventanas emergentes, pestañas y validaciones.

Ejemplos ilustrativos:

"Entra a Productos y busca el registro Moisés".
"En Catálogos, entra en Productos y busca el registro".
"Abre Catálogos > Productos y busca el registro".
"En Catálogos/Productos, localiza el registro".
"En Productos, modifica el nombre Moisés a Rolando".
"Abre la lista de productos, encuentra Moisés, pulsa el lápiz, cambia el nombre a Rolando y guarda".
"Busca el registro, entra a editar y comprueba que el cambio se guardó".
El usuario no debería tener que conocer las palabras Given, When, Then ni escribir código.

Si la instrucción omite información esencial, solicita una aclaración concreta. No inventes resultados esperados ni elijas arbitrariamente entre varias interpretaciones posibles.

Distingue entre la información que el usuario ha proporcionado, la información comprobada mediante exploración y las suposiciones que todavía deben resolverse.

Si la interfaz permite continuar con una parte válida de la solicitud, puedes preparar un borrador parcial, pero no lo declares listo para aprobación o ejecución mientras falten condiciones esenciales.

5. Planner con Ollama y contrato JSON
Implementa o reconstruye el servicio del planner utilizando Ollama.

Encapsula la integración mediante un componente como OllamaPlannerProvider, adaptándolo a las convenciones del proyecto. Configura la URL y el modelo mediante variables de entorno, por ejemplo:

OLLAMA_BASE_URL
OLLAMA_MODEL
Timeouts y límites de generación apropiados.
No expongas configuraciones sensibles en el frontend.

Utiliza salida estructurada mediante JSON Schema cuando sea compatible con la instalación y el modelo. Valida la respuesta mediante un esquema en tiempo de ejecución, por ejemplo Zod si ya existe o si su incorporación está justificada.

Separa tres controles:

JSON sintácticamente válido.
Estructura válida según el esquema.
Significado válido y ejecutable.
El contrato interno debe contener, como mínimo:

Estado: ready, needs_clarification o unsupported.
Título y objetivo del escenario.
Texto original del usuario.
Precondiciones.
Destino y secuencia de navegación.
Acciones ordenadas.
Referencias a elementos.
Parámetros y datos de prueba.
Aserciones separadas de las acciones.
Preguntas pendientes.
Advertencias.
Capacidades faltantes.
Evidencias de las que depende la resolución.
Riesgos y requisitos de autorización.
Cada acción debe utilizar un tipo admitido por el catálogo de acciones e incluir parámetros tipados y suficientes para ejecutarse.

El modelo no puede declarar un plan como listo si hay acciones no soportadas, referencias ambiguas esenciales, precondiciones no satisfechas o resultados esperados que no puedan comprobarse.

El estado ready significa que el plan ha superado las validaciones necesarias para continuar al siguiente paso del flujo. No significa que la prueba ya se haya ejecutado correctamente ni garantiza que vaya a pasar.

Gestiona errores de conexión, modelo inexistente, JSON inválido, respuesta truncada y timeout. Limita los reintentos y vuelve a validar cualquier respuesta reparada.

Los reintentos no deben generar ciclos infinitos ni omitir validaciones. Si el modelo sigue produciendo respuestas inválidas, devuelve un error controlado.

No muestres un JSON de ejemplo como si fuera el resultado de una generación real.

Las respuestas del modelo deben tratarse como datos no confiables: nunca deben convertirse directamente en instrucciones de sistema, rutas de archivos, comandos de terminal ni código ejecutable.

6. Normalización semántica
Esta es una de las prioridades principales del proyecto.

El sistema debe reconocer distintas formas de expresar la misma intención sin necesitar un step definition para cada frase.

Por ejemplo:

"Escribe USD en el campo con placeholder Buscar por moneda".
"Introduce USD en el filtro de moneda".
"Rellena con USD el campo que dice Buscar por moneda".
"Pon USD en la caja de búsqueda de moneda".
Cuando la aplicación confirme que todas estas instrucciones apuntan al mismo campo y representan la misma acción, deben producir planes semánticamente equivalentes.

La normalización también debe funcionar con navegación y edición:

"En Productos".
"En Catálogos > Productos".
"En Catálogos/Productos".
"Entra al módulo Productos dentro de Catálogos".
Y:

"Edita Moisés y cambia el nombre a Rolando".
"Busca Moisés, pulsa el lápiz y modifica el nombre a Rolando".
"En Productos, cambia el campo Nombre de Moisés a Rolando y guarda".
La equivalencia debe depender del contexto y la evidencia real de la aplicación. No asumas que dos frases similares siempre significan lo mismo.

Distingue entre:

Variantes lingüísticas equivalentes.
Acciones conocidas.
Composiciones de varias acciones.
Instrucciones incompletas.
Instrucciones ambiguas.
Contradicciones.
Acciones no implementadas.
Acciones que requieren autorización adicional.
Utiliza Ollama para interpretar el lenguaje y validadores deterministas para comprobar el resultado. No dependas solamente de expresiones regulares, diccionarios de sinónimos o coincidencias literales.

La normalización debe terminar en acciones canónicas, no en código o frases de Gherkin inventadas.

Si varias instrucciones terminan produciendo el mismo objetivo, destino, acciones, argumentos y aserciones, sus planes deben ser equivalentes en significado, aunque los metadatos o textos explicativos sean distintos.

7. Playwright MCP
La aplicación puede utilizar Playwright MCP para descubrir y explorar una aplicación objetivo cuando el servidor correspondiente esté disponible y correctamente configurado.

Primero comprueba qué herramientas, parámetros y transportes están realmente disponibles. No inventes capacidades MCP.

Distingue entre:

MCP accesible únicamente en el entorno de desarrollo.
MCP integrado con el backend de la plataforma.
API de Playwright utilizada por el runner para ejecutar las pruebas.
Que el entorno de desarrollo tenga MCP no significa que el producto pueda invocarlo automáticamente.

Si el producto requiere utilizar MCP, implementa una integración real con conexión, gestión de sesiones, manejo de errores y acceso restringido a las herramientas necesarias.

Utiliza MCP para apoyar la exploración, inspeccionar páginas, observar controles, navegar y recopilar información de la interfaz.

Convierte las observaciones en un inventario estructurado que el planner pueda consultar.

No guardes identificadores temporales de elementos MCP como si fueran localizadores permanentes. Durante la ejecución, vuelve a resolver los elementos con localizadores fiables de Playwright.

El runner de los escenarios aprobados seguirá utilizando Cucumber.js, código TypeScript controlado y Playwright para realizar acciones y aserciones reproducibles. MCP puede facilitar la exploración, pero no sustituye las validaciones, el versionado ni los reportes.

No ejecutes operaciones destructivas durante la exploración sin autorización expresa.

Si MCP no está disponible, informa de la limitación y utiliza una alternativa de exploración directa con Playwright solo si está implementada y autorizada. No simules llamadas MCP exitosas ni declares que MCP fue utilizado cuando no hubo una integración real.

No añadas MCP como requisito obligatorio para ejecutar pruebas si la ejecución directa con Playwright puede satisfacer el flujo previsto.

8. Explorador e inventario
Implementa una funcionalidad que permita configurar un proyecto de pruebas y una aplicación web objetivo.

Recopila, cuando esté disponible:

URL, título y ubicación actual.
Breadcrumbs.
Menús y jerarquía.
Rutas observadas.
Enlaces y botones.
Roles y nombres accesibles.
Etiquetas y placeholders.
Formularios y dropdowns.
Tablas, encabezados y filas.
Botones de acción e iconos.
Atributos estables, como data-testid.
Diálogos, páginas adicionales y ventanas emergentes.
Estados y pantallas visitados.
Prioriza el DOM y la información de accesibilidad. Las capturas pueden complementar los datos, pero no deben ser la única fuente de identificación.

Registra la evidencia disponible, su procedencia, la página donde se obtuvo y cuándo se observó.

Cuando corresponda, registra la URL, el estado de navegación y el contexto donde se encontró cada elemento para que pueda resolverse de nuevo durante la ejecución.

La exploración debe permitir navegar entre módulos y descubrir estados nuevos. No des por hecho que una única visita descubre toda la aplicación.

No recorras toda la aplicación de forma indiscriminada ni ejecutes todas las acciones encontradas. La exploración debe guiarse por la intención de la prueba y limitarse a las rutas necesarias.

No intentes omitir la autenticación, los permisos ni los controles de acceso.

Si los datos del inventario pueden quedar obsoletos, indícalo y vuelve a verificar los elementos relevantes cuando sea necesario. La existencia de una observación anterior no garantiza que el DOM actual siga siendo idéntico.

9. Mapa jerárquico de navegación
Construye un mapa de navegación basado en la aplicación realmente explorada. No codifiques módulos de ejemplo como parte fija del producto.

Cada nodo debe contener, cuando sea posible:

ID canónico.
Nombre visible y normalizado.
Nodo padre.
Ruta observada.
Alias reconocidos.
Breadcrumbs.
Tipo de nodo: módulo, submódulo, página, pestaña o sección.
Referencias a elementos de navegación.
Evidencia.
Estado de verificación y fecha de observación.
Ejemplo ilustrativo:

Catálogos.
Productos.
Categorías.
Clientes.
Personas naturales.
Este árbol no es obligatorio. La estructura debe adaptarse a cada aplicación.

El sistema debe resolver rutas o expresiones equivalentes cuando la evidencia confirme que identifican el mismo nodo.

Si existen varios módulos con el mismo nombre, utiliza el contexto, la jerarquía y las rutas observadas. Si continúa la ambigüedad, pide aclaración.

No deduzcas rutas reales exclusivamente a partir del texto visible del menú.

Actualiza el mapa cuando la exploración detecte cambios y marca los datos antiguos como potencialmente obsoletos.

No trates el mapa de navegación como un sustituto del estado real de la aplicación. Antes de utilizar una ruta o un control para ejecutar una operación, comprueba que siguen siendo válidos.

10. Resolución de elementos
Implementa un resolutor que relacione la descripción del usuario con los elementos reales de la página.

Debe admitir expresiones como:

"El botón Guardar".
"El campo con placeholder Buscar por moneda".
"El campo etiquetado Nombre".
"El dropdown Categoría".
"La opción Electrónica".
"El texto Producto creado".
"El lápiz que permite editar esta fila".
"El botón de acciones a la derecha del registro".
Prioriza:

Roles y nombres accesibles.
Etiquetas.
Placeholders.
Texto visible.
data-testid.
Atributos estables observados.
Localizadores específicos basados en evidencia del DOM.
El orden anterior es orientativo: selecciona la estrategia que mejor corresponda al control real, a la accesibilidad y a la estabilidad del elemento.

Comprueba la cantidad de coincidencias. Para operaciones que requieren un solo elemento, rechaza resoluciones ambiguas.

Intenta desambiguar mediante el contexto de la página, el formulario, el contenedor o la fila del registro.

Si no hay evidencia suficiente, solicita aclaración. No inventes atributos ni selecciones silenciosamente el primer elemento coincidente.

Vuelve a resolver los elementos durante la ejecución en lugar de depender de referencias temporales del DOM o MCP.

Utiliza las esperas automáticas y las aserciones apropiadas de Playwright. Evita sustituir una sincronización basada en el estado real de la interfaz por pausas fijas sin justificación.

Si un elemento existe en el inventario, pero ya no puede encontrarse en la aplicación actual, informa del fallo de resolución y conserva información suficiente para diagnosticarlo.

11. Iconos y botones sin texto
Una aplicación puede representar Editar, Eliminar, Ver, Añadir o Guardar mediante iconos.

No asumas que cualquier lápiz significa editar ni que una papelera se puede pulsar de forma segura.

Para resolver estos controles:

Inspecciona el elemento y su contexto en el DOM o árbol de accesibilidad.
Busca nombres accesibles, aria-label, title, data-testid y atributos estables.
Determina el contenedor al que pertenece, especialmente si está dentro de una fila.
Examina los controles de ese contenedor y su relación con los datos.
Si es necesario, utiliza exploración guiada o una interacción controlada en un entorno autorizado.
Observa el comportamiento resultante cuando la interacción sea segura.
Conserva evidencia que ayude a localizar el control en futuras ejecuciones.
Si no puede determinarse su función con seguridad, solicita aclaración.
Si la aplicación carece de atributos accesibles, puedes proponer añadir aria-label o data-testid, pero no modifiques la aplicación objetivo sin autorización.

No ejecutes una acción destructiva solo para averiguar qué hace un icono.

Una evidencia previa sobre la función del icono puede utilizarse como información auxiliar, pero debe comprobarse su vigencia y su contexto antes de repetir la acción.

12. Identificación y edición de registros
Implementa acciones reutilizables para trabajar con tablas, filas y formularios de edición.

Ejemplo:

"En Productos, busca la fila cuyo campo Nombre es Moisés, abre su edición, cambia Nombre a Rolando, pulsa Guardar y comprueba el cambio".

El plan debe descomponer la tarea en pasos identificables:

Resolver el módulo.
Identificar la tabla o colección.
Identificar la fila mediante sus campos y valores.
Resolver el control de acción dentro de esa fila.
Abrir el formulario o estado de edición.
Identificar el campo que se modificará.
Introducir el valor nuevo.
Guardar.
Comprobar el resultado real.
Confirmar que se actualizó el registro correcto.
Si varias filas coinciden, solicita información adicional. No selecciones una fila por una coincidencia parcial, salvo que sea la intención explícita.

Si el botón de edición es un icono, resuélvelo dentro del contexto de la fila. No pulses el primer icono de lápiz de la página.

No confundas el éxito de un clic con el éxito de la operación de negocio.

Las pruebas que modifican registros deben utilizar datos y entornos autorizados y deben señalar sus posibles efectos secundarios.

Cuando sea posible, usa un identificador estable del registro. Si no existe, selecciona una combinación de campos suficientemente discriminante y valida que haya exactamente una coincidencia.

No inventes una estrategia de limpieza o reversión de datos cuando la aplicación no la soporte. Si una prueba modifica datos persistentes, registra ese hecho y aplica la estrategia de restauración autorizada que exista.

13. Catálogo canónico de acciones
Implementa un catálogo central que describa las capacidades ejecutables.

Cada acción debe disponer de:

ID estable.
Nombre y descripción.
Parámetros tipados.
Esquema de validación.
Plantilla Gherkin.
Step definition correspondiente.
Implementación.
Requisitos previos.
Reglas de localización.
Clasificación de riesgo.
Pruebas automatizadas.
Estado de disponibilidad.
Incluye acciones genéricas para:

Navegar a una URL autorizada.
Abrir un módulo o submódulo.
Hacer clic en un elemento.
Rellenar o limpiar un campo.
Seleccionar una opción.
Marcar o desmarcar un control.
Pulsar una tecla admitida.
Verificar visibilidad u ocultación.
Comprobar texto, valor y URL.
Contar elementos.
Verificar filas y columnas.
Localizar filas por valores.
Pulsar una acción de una fila.
Abrir formularios de edición.
Rellenar campos.
Guardar.
Verificar actualizaciones.
Administrar páginas adicionales y ventanas emergentes.
El catálogo debe permitir componer acciones para pruebas complejas. No codifiques nombres de módulos o valores de datos de ejemplo dentro de las implementaciones.

No es necesario crear una clase o archivo independiente para cada acción si el repositorio dispone de una organización más simple y mantenible. Conserva una separación clara entre el contrato de acción, su validación, su representación Gherkin y su ejecución.

Añadir una nueva capacidad debe exigir, como mínimo:

Definir su contrato y parámetros.
Validar entradas.
Definir su representación en el plan.
Generar Gherkin compatible.
Implementar o reutilizar el step correspondiente.
Probar su comportamiento.
Actualizar la documentación necesaria.
No anuncies acciones que no tengan una implementación real. Si no se admite una acción solicitada, indícalo en el plan y no la conviertas silenciosamente en otra operación.

14. Generación determinista de Gherkin
La IA genera el plan JSON. El backend convierte las acciones validadas en frases Gherkin mediante plantillas conocidas.

Ejemplo de plan:

{
  "action": "fill",
  "target": {
    "locatorStrategy": "placeholder",
    "observedValue": "Buscar por moneda"
  },
  "value": "USD"
}
Plantilla canónica:

Cuando relleno el campo con placeholder {string} con {string}
Archivo ilustrativo:

# language: es

Característica: Filtrado de catálogos

  Escenario: Filtrar por moneda USD
    Cuando accedo al módulo "Catálogos"
    Y relleno el campo con placeholder "Buscar por moneda" con "USD"
    Entonces todos los resultados visibles corresponden a la moneda "USD"
Adapta la sintaxis a las palabras clave y expresiones de steps que realmente implementes.

El paso de autenticación, las precondiciones y cualquier otro requisito deben generarse solamente si existen mecanismos reales para satisfacerlos. Un ejemplo de Gherkin no implica que sus pasos estén implementados.

No conviertas cada frase del usuario en una definición nueva. Las distintas formas de describir una misma acción deben normalizarse antes de generar Gherkin.

El archivo .feature debe ser comprensible, editable y ejecutable. No serialices identificadores temporales de MCP como localizadores permanentes.

La generación debe ser determinista respecto al plan normalizado, las plantillas y las versiones de las reglas de generación. No es necesario que dos respuestas originales de Ollama sean textualmente idénticas; una vez que el resultado haya sido aceptado, su contenido debe guardarse como una versión fija.

El sistema debe verificar:

Sintaxis Gherkin.
Correspondencia con las definiciones de pasos.
Validez de parámetros.
Acciones soportadas.
Aserciones verificables.
Coherencia con el plan.
Ausencia de pasos sin implementación.
Disponibilidad de las precondiciones necesarias.
La validación previa confirma la consistencia del archivo, no que el comportamiento futuro de la aplicación vaya a satisfacer las aserciones.

15. Step definitions y contexto de ejecución
Organiza las definiciones de Cucumber.js en módulos reutilizables.

Implementa un World tipado y hooks para gestionar page, context, inventario y demás recursos del escenario.

Cada step debe:

Validar parámetros.
Resolver el localizador.
Comprobar unicidad cuando sea necesario.
Aplicar esperas razonables.
Utilizar aserciones cuando corresponda.
Proporcionar errores útiles.
Guardar evidencias sin exponer secretos.
Prioriza reutilizar steps existentes.

No combines innecesariamente los fixtures de Playwright Test con el ciclo de vida de Cucumber.js. Utiliza el World y los hooks de Cucumber.js para administrar el contexto del runner BDD, apoyándote en servicios de preparación y limpieza reutilizables.

Si una acción no existe, comprueba primero si puede componerse con acciones disponibles. Si no, marca la capacidad como no soportada y permite proponer una implementación nueva para revisión.

No ejecutes código generado por IA de forma automática.

Un error en un step debe conservar suficiente contexto para su diagnóstico: escenario, paso, tipo de acción, resultado de la búsqueda del elemento y error de Playwright, sin revelar información sensible.

La implementación debe distinguir entre una aserción fallida y un error técnico. No conviertas una excepción del navegador en una aserción exitosa ni ignores un error para continuar como si la acción hubiera funcionado.

16. Editor, validación y aprobación del .feature
El usuario debe ver el archivo .feature real, con resaltado de sintaxis y edición manual.

Incluye:

Nombre y ruta del archivo.
Visualización del Gherkin.
Edición.
Guardado como borrador.
Regeneración desde la descripción original.
Validación de sintaxis.
Detección de steps no implementados.
Identificación de ambigüedades.
Historial de versiones.
Acción de aprobación.
Acción de ejecución disponible únicamente tras aprobar.
La edición manual no debe modificar silenciosamente la descripción original ni las versiones aprobadas.

Si el usuario introduce una frase de Gherkin desconocida, ofrece normalizarla a una acción canónica o presentar una propuesta de capacidad nueva.

Reglas de aprobación
Aprobar un escenario significa confirmar una versión específica del .feature, no aprobar cualquier versión futura de ese archivo.

Antes de habilitar la aprobación, comprueba:

Sintaxis de Gherkin.
Existencia de steps compatibles.
Parámetros correctos.
Precondiciones.
Acciones autorizadas.
Destinos resueltos.
Localizadores no ambiguos.
Aserciones verificables.
Ausencia de contradicciones esenciales.
Preparación del contexto y de los datos.
Integridad de la versión que se va a aprobar.
Tras la aprobación, registra la versión exacta, su hash y el momento de aprobación.

Si el archivo se modifica posteriormente, crea una nueva versión borrador y exige una nueva aprobación.

No permitas ejecutar una versión diferente a la aprobada. La validación previa tampoco debe confundirse con una garantía de que la prueba pasará en tiempo de ejecución.

Mantén separado el estado de revisión del caso de prueba y el estado de ejecución. Un caso puede estar aprobado y posteriormente fallar durante la ejecución; eso no invalida automáticamente la aprobación de su definición.

17. Versionado inmutable
Cada escenario debe tener versiones inmutables.

Registra como mínimo:

ID y número de versión.
Texto original.
Plan JSON.
Contenido completo del .feature.
Hash criptográfico, por ejemplo SHA-256.
Versión del catálogo de acciones.
Versión de las reglas o plantillas de generación cuando corresponda.
Estado de validación.
Aprobación.
Fecha.
Ejecuciones relacionadas.
Una modificación crea una nueva versión borrador.

El runner debe comprobar el hash, la aprobación y la compatibilidad de los steps requeridos antes de ejecutar. No debe ejecutar contenido modificado, no aprobado o diferente de la versión solicitada.

Calcula el hash sobre una representación canónica y documentada del contenido que se ejecutará. Evita calcularlo sobre un objeto cuya serialización pueda cambiar de forma no controlada.

La ejecución debe registrar la versión y el hash exactos que utilizó. Si el archivo de trabajo no coincide con la versión aprobada, detén el inicio y comunica el error.

Si cambia una implementación de steps de manera incompatible, vuelve a validar la versión correspondiente; no cambies silenciosamente su comportamiento.

El hash garantiza la integridad del contenido comparado, pero por sí solo no demuestra que el comportamiento del runner, la aplicación o las dependencias no hayan cambiado.

18. Ejecución, consola existente y ciclo de vida del runner
Utiliza Cucumber.js para ejecutar los escenarios y Playwright para controlar el navegador.

La consola que ya existe en el frontend debe reutilizarse e integrarse con el runner real. No crees una segunda consola si la actual puede adaptarse.

Antes de implementarla, inspecciona sus componentes, estilos, rutas y forma actual de recibir información. Determina qué necesita para reflejar los eventos reales de ejecución y modifica únicamente lo necesario.

18.1 Ciclo de vida de una ejecución
Implementa un ciclo de ejecución explícito:

El usuario selecciona una versión aprobada del .feature.
El backend comprueba la aprobación, el hash, los steps requeridos y las condiciones de ejecución.
Se crea un registro persistente con un identificador único de ejecución.
El runner prepara el navegador, el contexto, la sesión y los datos autorizados.
Cucumber.js comienza a ejecutar los pasos.
El backend recibe o procesa los acontecimientos reales del runner y registra los eventos normalizados.
El frontend recibe los eventos y actualiza la consola sin necesitar recargar la página.
Cuando la prueba termina, el runner genera los resultados y las evidencias disponibles.
El estado final se persiste y queda disponible en el historial.
Cada ejecución debe estar vinculada a una versión concreta, inmutable y aprobada.

No es necesario introducir una capa de eventos compleja si la solución existente permite obtener los mismos resultados con un adaptador sencillo y fiable. Lo obligatorio es conservar el vínculo entre los sucesos reales del runner y el estado mostrado.

18.2 Estados de ejecución
Utiliza estados explícitos y coherentes:

PENDING: la ejecución se ha creado, pero todavía no comienza.
RUNNING: la ejecución está activa.
PASSED: todos los criterios de éxito se han cumplido.
FAILED: uno o más pasos o aserciones de la prueba han fallado.
ERROR: la ejecución no pudo completarse correctamente debido a un error de infraestructura, configuración o del runner.
CANCELLED: la ejecución se canceló explícitamente y la cancelación se completó.
INTERRUPTED: la ejecución dejó de estar activa inesperadamente y no hay evidencia de una finalización normal.
Para los pasos individuales, registra al menos:

PENDING
RUNNING
PASSED
FAILED
ERROR
SKIPPED
Distingue un fallo funcional de un error que impide ejecutar o completar la prueba. Los pasos que no llegaron a ejecutarse deben aparecer como pendientes o saltados según corresponda; nunca como aprobados.

Define transiciones de estado válidas. Por ejemplo, una ejecución terminada no debe volver a RUNNING debido a un evento retrasado, y la cancelación no debe marcarse como completada antes de confirmar la terminación.

El resultado global debe derivarse de los resultados reales del runner y de las reglas explícitas de finalización. No lo determines por el número de mensajes que recibió el frontend.

18.3 Integración de eventos con la consola
La consola existente debe mostrar, en tiempo real o con un retraso mínimo:

Inicio de la ejecución.
Escenario y versión que se están ejecutando.
Paso que acaba de comenzar.
Pasos completados correctamente.
Pasos fallidos.
Mensajes y detalles del error.
Duración por paso, cuando esté disponible.
Capturas, trazas y evidencias cuando se generen.
Progreso general, si se puede calcular a partir de información real.
Estado final de la ejecución.
Utiliza eventos reales del runner de Cucumber.js y Playwright. No inventes mensajes ni marques pasos como completados desde el frontend.

El backend debe ser responsable del estado oficial de la ejecución. El frontend debe representar los eventos recibidos y consultar o recuperar el estado persistido cuando sea necesario.

Define un contrato de eventos tipado. Por ejemplo, contempla eventos equivalentes a:

run.started
run.progress
step.started
step.passed
step.failed
step.error
step.skipped
artifact.created
run.finished
run.cancelled
run.interrupted
Estos nombres son ilustrativos: adapta el contrato a la arquitectura existente, sin duplicar eventos ya representados por otros contratos.

Cada evento debe incluir, cuando corresponda:

Identificador de ejecución.
Identificador único o número de secuencia.
Tipo de evento.
Fecha y hora.
Identificador del escenario y versión.
Paso implicado.
Estado.
Duración, cuando esté disponible.
Información de diagnóstico segura.
Referencias a las evidencias generadas.
Utiliza tipos discriminados o contratos equivalentes que permitan validar los datos según su tipo de evento.

Obtén los resultados estructurados mediante los mecanismos de eventos, formatos o reportes soportados por la versión instalada de Cucumber.js y Playwright.

Puedes conservar stdout y stderr como registros auxiliares, pero no los uses como única fuente para decidir que un paso pasó o falló. El texto de salida puede variar y no equivale necesariamente a un resultado estructurado.

Si necesitas adaptar la información del runner a los eventos de la aplicación, crea un adaptador pequeño, explícito y verificable.

Para la comunicación, reutiliza el mecanismo existente. Si no existe, selecciona la opción más sencilla que satisfaga las necesidades:

Evalúa SSE como opción inicial cuando el frontend principalmente necesita recibir eventos del backend.
Utiliza polling si la arquitectura actual lo facilita y la frecuencia de actualización resulta suficiente.
Reutiliza WebSocket si ya existe y encaja con las necesidades, o si se necesita comunicación bidireccional continua.
No implementes SSE, WebSocket y polling simultáneamente sin una razón concreta.

Si utilizas SSE, contempla las desconexiones, las reconexiones y la recuperación del estado actual. Si utilizas polling, consulta el estado persistido sin crear una carga innecesaria.

La cancelación puede utilizar un endpoint HTTP independiente, salvo que la arquitectura existente justifique otro mecanismo.

Si se pierde el canal de eventos, el usuario debe poder recuperar el estado actual y consultar el historial sin perder la información de la ejecución.

18.4 Representación en la consola
La consola debe distinguir visualmente los estados de los pasos y mostrar los mensajes de manera legible.

Por ejemplo, durante una ejecución podría mostrar:

[PASS] Sesión autenticada
[PASS] Navegar a Catálogos > Productos
[PASS] Encontrar el registro
[RUNNING] Abrir formulario de edición
[PENDING] Modificar el campo
[PENDING] Guardar
[PENDING] Verificar actualización
Este es un ejemplo ilustrativo. Los nombres, resultados y tiempos definitivos deben proceder del runner real.

Conserva el diseño de la consola existente siempre que sea viable. Reutiliza sus componentes y estilos, y completa las funciones necesarias en lugar de diseñar un panel duplicado.

Permite consultar los detalles de un paso, el mensaje de error y las evidencias relacionadas.

No muestres secretos, cookies, tokens, contraseñas ni datos sensibles en la consola.

No uses animaciones, temporizadores o mensajes predefinidos para simular avance. La interfaz debe permanecer en el estado correcto aunque la ejecución se retrase, falle o no produzca eventos durante un intervalo.

18.5 Cancelación de ejecuciones
Si la arquitectura existente lo permite, añade o completa un control para cancelar una ejecución activa.

Cuando el usuario solicite la cancelación:

Verifica que la ejecución esté activa.
Registra la solicitud.
Detén de manera controlada el runner correspondiente.
Cierra las páginas y contextos administrados por esa ejecución.
Limpia los recursos temporales que corresponda.
Registra el estado final CANCELLED únicamente cuando se haya confirmado la terminación.
Notifica el resultado a la consola.
Conserva los logs y evidencias ya generados.
No confundas una solicitud de cancelación con una cancelación completada. No marques la ejecución como cancelada hasta que el backend confirme su finalización.

Los procesos deben administrarse mediante referencias controladas por la aplicación. No finalices procesos ajenos ni utilices comandos construidos a partir del texto del usuario.

Si es necesario utilizar un proceso hijo para aislar y controlar Cucumber.js, gestiona correctamente su inicio, salida, código de terminación, señales, timeout y limpieza. No introduzcas un proceso hijo obligatorio si el runner existente satisface los requisitos con un mecanismo más apropiado.

Si una operación externa no puede interrumpirse de inmediato, indica que la cancelación está en curso y gestiona su terminación de manera segura.

18.6 Errores y fallos
Cuando falle un step, la consola debe mostrar:

Nombre del escenario.
Paso que falló.
Mensaje de error.
Tipo de fallo.
Información útil para diagnosticarlo.
Captura de pantalla y traza, si existen.
Estado general actualizado.
No ocultes los errores ni los sustituyas por mensajes genéricos que impidan diagnosticar el problema.

Si Playwright no puede abrir el navegador, Ollama no está disponible o falta un requisito, registra el problema como error de ejecución o de preparación, según corresponda.

No afirmes que una prueba falló funcionalmente si en realidad nunca pudo iniciarse.

Diferencia entre:

Fallo de una aserción de la prueba.
Error de localización de un elemento.
Error de preparación del entorno.
Error de comunicación.
Error de persistencia.
Error interno del runner.
Cancelación solicitada.
Interrupción inesperada.
No conviertas un error técnico en un resultado PASSED.

18.7 Concurrencia y aislamiento
Controla las ejecuciones simultáneas.

Limita el número de ejecuciones concurrentes según la configuración y la capacidad del entorno.
Evita ejecutar accidentalmente varias veces la misma solicitud cuando sea aplicable.
Utiliza un identificador único para cada ejecución.
Evita que dos pruebas modifiquen de forma incompatible el mismo entorno o los mismos registros.
Mantén aislados los contextos y perfiles del navegador.
No mezcles los eventos de distintas ejecuciones en una misma consola.
Vincula cada log y evidencia a su ejecución.
Impide que una cancelación afecte a otras ejecuciones.
Permite ejecución paralela únicamente cuando el entorno, los datos y los recursos sean compatibles con ella.

No añadas bloqueos personalizados para todos los archivos de forma preventiva. Prioriza identificadores únicos, escrituras atómicas y operaciones serializadas cuando existan conflictos. Introduce mecanismos de bloqueo explícitos solo si las condiciones reales de concurrencia los requieren y puedes definir claramente su liberación y recuperación.

18.8 Navegador y contexto
El World debe administrar:

Browser.
BrowserContext.
Page activa.
Páginas adicionales.
URL base.
Inventario.
Datos de prueba.
Evidencias.
Errores.
Implementa hooks para preparar y limpiar los recursos correctamente.

Permite ejecución headless y visible. Si el navegador debe abrirse en el escritorio del usuario, distingue entre el entorno donde corre el runner y la máquina local. Implementa un runner local si la arquitectura lo requiere.

No supongas que un navegador ejecutado en un servidor remoto aparecerá en el escritorio del usuario.

Usa contextos aislados por defecto. No manipules automáticamente el perfil personal del usuario.

Gestiona pestañas adicionales y ventanas emergentes de manera explícita e identifica qué página utiliza cada acción.

Las ejecuciones deben producir resultados reales. No simules éxito cuando la prueba no se haya ejecutado.

19. Persistencia sin base de datos
La plataforma no dispone de una base de datos en esta fase. No instales ni configures PostgreSQL, SQLite u otro motor de base de datos sin una necesidad demostrada y una instrucción explícita.

Implementa persistencia basada en el sistema de archivos. Encapsúlala en servicios o adaptadores compatibles con la arquitectura del proyecto para permitir una migración futura sin reescribir la lógica de negocio.

Estructura orientativa:

workspace/
  projects/
    <project-id>/
      project.json
      app-map/
        inventory.json
        navigation.json
      action-catalog/
        catalog-version.json
      scenarios/
        <scenario-id>/
          manifest.json
          plan.json
          versions/
            v0001.feature
            v0001.json
      runs/
        <run-id>/
          result.json
          events.jsonl
          report.html
          logs/
          screenshots/
          traces/
Adapta los nombres y la estructura al repositorio real. No crees archivos o carpetas separados innecesarios cuando la implementación existente permita organizar las mismas responsabilidades de forma más simple y segura.

Implementa las operaciones que realmente requiera el sistema para proyectos, inventario, mapas, catálogo de acciones, planes, escenarios, versiones, aprobaciones, ejecuciones, eventos y evidencias.

Requisitos:

Los archivos deben guardarse realmente.
Las versiones aprobadas no deben sobrescribirse.
Los hashes deben permitir verificar la integridad.
Las escrituras deben ser seguras y atómicas cuando sea apropiado.
Evita actualizaciones perdidas por accesos concurrentes.
Valida rutas y evita path traversal.
Conserva el historial después de reiniciar la aplicación.
Documenta almacenamiento, recuperación y copias de seguridad.
Protege credenciales y estado de autenticación.
Nunca guardes secretos en Gherkin, planes o reportes.
Distingue el estado transitorio de una ejecución del resultado persistido.
Prioriza escrituras atómicas para archivos de estado y asigna identificadores únicos a cada ejecución.

Si utilizas events.jsonl, define una política de escritura y lectura por ejecución que evite que varios escritores corrompan el mismo archivo. Al recuperar un registro incompleto, maneja explícitamente la última entrada y conserva la información válida anterior.

No asumas que una operación segura dentro de un único proceso también es segura con varios procesos o instancias. Si el despliegue previsto utiliza varias instancias, verifica que el mecanismo de persistencia local elegido pueda soportarlas; de lo contrario, documenta la limitación y controla la ejecución concurrente.

No es obligatorio implementar bloqueos de archivos personalizados. Utilízalos únicamente cuando la concurrencia real lo justifique, con reglas claras para timeout, liberación y recuperación de bloqueos abandonados.

Cuando el backend se reinicie, identifica las ejecuciones que hayan quedado en RUNNING sin evidencia de finalización. Márcalas como INTERRUPTED o como el error de infraestructura que corresponda. Nunca las conviertas automáticamente en PASSED.

No utilices arrays en memoria como sustituto de persistencia.

20. Seguridad
Trata el texto del usuario, la información de la página y las respuestas de la IA como datos no confiables.

Restringe las URLs a orígenes autorizados conforme al modelo de uso previsto.
Evita acceso a servicios internos no permitidos.
No ejecutes código arbitrario.
Valida rutas de archivos.
Protege credenciales, cookies y tokens.
No pruebes contra producción por defecto.
Exige autorización para acciones destructivas.
Aplica límites de tiempo y concurrencia.
Registra errores sin revelar secretos.
No permitas que instrucciones encontradas en una página amplíen los permisos del sistema.
No permitas que una respuesta de Ollama modifique por sí misma la configuración de seguridad.
Durante la exploración, prioriza operaciones de lectura. Antes de modificar o eliminar registros, comprueba que el entorno y los datos estén autorizados.

Si el usuario puede proporcionar una URL arbitraria, considera los riesgos de SSRF y acceso a direcciones internas. Implementa validaciones apropiadas al entorno, sin bloquear innecesariamente los entornos de desarrollo locales autorizados.

Considera las páginas exploradas como datos no confiables. El texto de una página no debe alterar las instrucciones de sistema, desactivar validaciones ni conceder permisos adicionales.

Distingue entre pruebas destructivas y no destructivas. Si una prueba puede realizar un pago real, eliminar permanentemente información, cambiar credenciales o producir otro efecto irreversible, no la ejecutes automáticamente en producción sin autorización explícita y controles apropiados.

Siempre que sea posible, utiliza entornos de prueba, datos ficticios y mecanismos de limpieza verificables.

21. Reportes, historial y evidencia de ejecución
Cada ejecución debe registrar:

Estado general.
Escenario y versión exacta.
Hash de la versión ejecutada.
Inicio, fin y duración.
Resultado de cada paso.
Orden de los eventos.
Errores.
Evidencias.
Capturas y trazas cuando corresponda.
Identificador de ejecución.
Estado de cancelación, si aplica.
Genera reportes reales, JSON y HTML cuando sea compatible con el proyecto.

Guarda los resultados en el workspace y vincúlalos con la versión exacta que se ejecutó.

El historial debe poder consultarse después de reiniciar la aplicación.

Distingue entre prueba fallida, ejecución no iniciada, error de infraestructura, ejecución cancelada, ejecución interrumpida y capacidad no soportada.

La consola sirve para observar el progreso y consultar detalles, pero el registro persistente del backend es la fuente de verdad sobre el resultado de una ejecución.

No marques una ejecución como PASSED hasta que el runner haya completado el escenario y confirmado los criterios de éxito.

Guarda únicamente evidencias que realmente se hayan generado. Si no se pudo crear una captura o una traza, registra la ausencia de la evidencia si resulta relevante. No inventes archivos ni rutas para completar un reporte.

No expongas información sensible en las capturas, trazas, logs o informes. Cuando corresponda, aplica las reglas de redacción o exclusión de datos previstas por la plataforma.

Implementa una política razonable de conservación de reportes y evidencias si el volumen de datos puede crecer. No elimines automáticamente las evidencias necesarias para diagnosticar una ejecución fallida.

22. Pruebas obligatorias
Implementa pruebas unitarias, de integración y de extremo a extremo.

No basta con verificar que cada función devuelve el valor esperado. Las pruebas deben cubrir los contratos entre componentes y, cuando sea posible, el flujo completo.

A. Equivalencia semántica
Prueba distintas frases que expresen una misma intención. Deben generar planes equivalentes cuando el inventario confirme el mismo destino y elemento.

B. Rutas equivalentes
Prueba variaciones de nombres y rutas de un mismo módulo. Cuando el mapa confirme el mismo destino, deben resolver al mismo nodo canónico.

C. Jerarquía y ambigüedad
Prueba módulos con nombres repetidos en distintas ramas y verifica que el sistema no seleccione uno arbitrariamente.

D. Localizadores
Prueba campos, botones, dropdowns, texto visible y atributos estables, incluyendo casos donde el texto del usuario no coincide exactamente con la etiqueta.

E. Iconos y edición de filas
Crea una aplicación de prueba con una tabla y un botón de edición representado por un icono.

Comprueba que el sistema puede encontrar la fila correcta, resolver el control dentro de ella, abrir el formulario, modificar un campo, guardar y verificar el resultado.

Incluye un caso donde el icono no tenga nombre accesible. Si no puede resolverse mediante evidencia suficiente, debe solicitar aclaración.

F. Acciones compuestas
Prueba navegación, búsqueda, selección, edición y verificación en un mismo escenario.

G. Ambigüedad y falta de soporte
Comprueba que las instrucciones incompletas o no soportadas no se conviertan silenciosamente en pruebas ejecutables.

H. Gherkin y steps
Comprueba que los archivos sean válidos y que cada step tenga una definición compatible.

I. Aprobación
Verifica que no se puedan ejecutar versiones no aprobadas, modificadas o con hashes incorrectos.

J. Persistencia
Comprueba que los escenarios, aprobaciones e historial sobrevivan al reinicio y que no se pueda acceder a rutas fuera del workspace.

Comprueba también que los archivos mantengan su integridad cuando existan accesos concurrentes compatibles con el diseño.

K. Playwright MCP
Si está configurado, comprueba la exploración real y el manejo de errores de conexión. No simules herramientas MCP inexistentes.

Si MCP no está disponible, documenta esa limitación y prueba la alternativa real que se haya implementado.

L. Ejecución real
Ejecuta escenarios aprobados contra una aplicación de prueba. Verifica tanto resultados satisfactorios como fallos intencionales.

M. Ollama
Prueba la integración real cuando esté configurada y utiliza respuestas controladas para comprobar JSON inválido, timeouts y ambigüedades sin depender siempre de llamadas reales al modelo.

Las pruebas con respuestas controladas verifican contratos y casos límite, pero no sustituyen la comprobación de la integración real cuando sus dependencias están disponibles.

N. Consola y eventos reales
Verifica que la consola existente:

Muestre el inicio de la ejecución real.
Reciba los eventos del runner.
Muestre los pasos en el orden correcto.
Distinga pasos pendientes, activos, completados, fallidos y saltados.
Muestre el resultado final verdadero.
Identifique correctamente el escenario, versión y ejecución.
No mezcle eventos de dos ejecuciones.
Recupere el estado después de una desconexión.
No dependa de datos ficticios ni de una recarga completa de la página.
Comprueba que los resultados mostrados coincidan con el registro persistido y con el resultado real del runner.

O. Cancelación
Comprueba que:

Se pueda solicitar la cancelación de una ejecución activa.
El backend gestione su terminación.
Los recursos del navegador se limpien correctamente.
El estado final sea CANCELLED únicamente cuando la cancelación haya concluido.
Las evidencias y los logs disponibles se conserven.
La cancelación de una ejecución no afecte a otras.
P. Errores y concurrencia
Simula o provoca fallos controlados de preparación, navegador, validación y ejecución. Comprueba que la consola distinga el motivo de fallo y que el historial refleje el resultado correcto.

Verifica también que dos ejecuciones no mezclen sus eventos ni modifiquen de forma incompatible el mismo entorno.

Comprueba que una ejecución interrumpida por un reinicio no se presente como exitosa.

Q. Integridad de la ejecución
Comprueba que la versión, el hash, las acciones y los steps utilizados sean los correspondientes a la versión aprobada.

Modifica una copia de una versión aprobada en un entorno de prueba y verifica que el runner rechace la ejecución si el contenido no coincide.

23. Fases de implementación
Implementa de forma incremental. Ajusta las fases al repositorio real, manteniendo las prioridades funcionales y evitando reescrituras innecesarias.

Fase A — Diagnóstico
Inspeccionar el repositorio y documentar su estado, incluida la consola existente, su mecanismo actual de comunicación y las funcionalidades ya operativas.

Identificar las partes que se pueden reutilizar y los principales riesgos de integración.

Fase B — Contratos
Definir el esquema JSON, las acciones canónicas y las validaciones necesarias. Integrarlos con los tipos y convenciones ya existentes.

Fase C — Planner y normalización
Implementar Ollama, equivalencia semántica, composición de acciones y aclaraciones.

Fase D — Exploración
Implementar o integrar Playwright MCP cuando esté disponible, construir el inventario y el mapa de navegación.

Fase E — Resolución
Implementar localizadores, iconos, filas, formularios y contexto.

Fase F — Gherkin
Generar .feature deterministas, validar la correspondencia con los steps y reutilizar definiciones existentes.

Fase G — Persistencia
Guardar proyectos, inventarios, versiones, aprobaciones, ejecuciones, eventos e historial en archivos.

Fase H — Ejecución
Integrar Cucumber.js, Playwright, ventanas, pestañas, gestión de errores y cancelación.

Fase I — Consola existente
Conectarla al estado real del runner, implementar actualizaciones durante la ejecución y recuperar el historial sin duplicar componentes de interfaz.

Fase J — End-to-end
Verificar el flujo completo, incluidos aprobación, ejecución, eventos, cancelación y reportes.

Prioridades de implementación
Utiliza las fases anteriores junto con las siguientes prioridades para evitar invertir demasiado esfuerzo en capacidades avanzadas antes de tener un sistema funcional.

P0 — Flujo vertical real:

Recibir una descripción del usuario.
Generar y validar un plan.
Generar un .feature.
Aprobar una versión concreta.
Ejecutarla mediante Cucumber.js y Playwright.
Mostrar en la consola existente los eventos reales.
Persistir el resultado y las evidencias disponibles.
Consultar el historial.
P0 es el criterio prioritario para demostrar que la plataforma funciona realmente de extremo a extremo.

P1 — Fiabilidad y trazabilidad:

Versiones inmutables y hashes.
Estados de ejecución y de pasos.
Control de concurrencia.
Cancelación.
Recuperación de ejecuciones interrumpidas.
Manejo de errores y persistencia consistente.
Recuperación de eventos tras desconexiones.
Integridad entre el resultado del runner y el historial.
P2 — Exploración y capacidades avanzadas:

Normalización semántica más completa.
Inventario y mapa de navegación avanzados.
Resolución compleja de tablas e iconos.
Mayor cobertura de acciones.
Propuestas de corrección de pruebas fallidas.
Funciones adicionales de reproducción y análisis.
Capacidades opcionales que aporten valor real.
No retrases el flujo vertical funcional por intentar completar todas las capacidades de exploración avanzada.

Después de cada fase o cambio significativo, ejecuta las verificaciones pertinentes, corrige las regresiones y comprueba que el comportamiento anterior sigue funcionando.

No te detengas en un plan: continúa con la implementación en el entorno disponible. Si una dependencia externa bloquea una parte, trabaja en las partes que puedan completarse sin falsear sus resultados y documenta exactamente el bloqueo.

24. Criterios de aceptación
La implementación solo se considera terminada cuando puedo demostrar los siguientes comportamientos. Si un criterio no se ha implementado o no se pudo comprobar, debe indicarse como pendiente, no como completado.

Abrir el frontend existente.
Configurar un proyecto y la URL de una aplicación de pruebas.
Explorar los módulos disponibles.
Guardar un inventario y mapa de navegación.
Escribir instrucciones libres.
Utilizar diferentes formulaciones para expresar la misma intención.
Referirme a módulos mediante nombres, jerarquías y rutas equivalentes.
Identificar registros y actuar sobre sus botones de fila.
Resolver controles representados por iconos con evidencia suficiente.
Recibir aclaraciones cuando existan ambigüedades.
Recibir un plan JSON validado mediante Ollama, cuando esté configurado.
Generar, guardar, revisar y editar un .feature real.
Identificar steps disponibles y capacidades faltantes.
Validar y aprobar una versión inmutable.
Ejecutar exactamente esa versión con Cucumber.js y Playwright.
Ver el navegador cuando se solicite ejecución visible y el entorno lo permita.
Observar en la consola existente el progreso real, paso a paso, sin duplicar la consola.
Ver los estados de cada paso y el estado final de la ejecución.
Consultar errores, capturas, trazas y resultados.
Solicitar la cancelación de una ejecución activa y observar su terminación controlada.
Recuperar el estado y el historial tras una desconexión o reinicio.
Comprobar que dos ejecuciones no mezclen sus logs ni se cancelen mutuamente.
Reiniciar la aplicación sin perder proyectos, escenarios aprobados ni historial, sin utilizar una base de datos.
Comprobar que una versión modificada o no aprobada no pueda ejecutarse como si fuera la versión aprobada.
Comprobar que una ejecución interrumpida no aparezca como exitosa.
Confirmar que los eventos y los reportes provienen de la ejecución real y no de datos simulados.
No todos los criterios requieren una función independiente o una nueva pantalla. Algunos pueden satisfacerse utilizando componentes y servicios existentes. Lo importante es demostrar el comportamiento requerido.

25. Verificación y entrega final
Al terminar:

Ejecuta typecheck, lint, compilación y pruebas usando los scripts reales del repositorio.
Corrige los errores introducidos por tus cambios.
No modifiques las pruebas para ocultar fallos.
No marques funcionalidades simuladas como terminadas.
No afirmes que se ejecutaron pruebas que no se ejecutaron.
No afirmes que se utilizó MCP si no se realizaron llamadas reales a sus herramientas.
Comprueba que la consola existente recibe eventos reales del runner.
Comprueba que los resultados del frontend coinciden con el estado persistido y el runner.
Documenta las variables de entorno y la configuración de Ollama.
Documenta cómo comprobar y configurar Playwright MCP.
Documenta la estructura del workspace y la persistencia sin base de datos.
Documenta los comandos necesarios para iniciar el frontend, backend y runner.
Explica cómo se gestionan los estados, la cancelación, la concurrencia y la recuperación de ejecuciones.
Resume los archivos modificados y las decisiones arquitectónicas.
Enumera las funcionalidades pendientes y explica por qué no se completaron.
En el informe final, distingue claramente:

Implementado y verificado: existe una implementación real y las pruebas correspondientes se ejecutaron satisfactoriamente.
Implementado, pero no verificado completamente: existe código, pero faltan pruebas o condiciones externas para demostrar su funcionamiento.
Parcial: solo se completó una parte del requisito.
Pendiente: no está implementado.
Bloqueado: no pudo completarse por una dependencia o limitación identificada.
Incluye los comandos realmente ejecutados y sus resultados. No presentes una lista de comandos recomendados como si se hubieran ejecutado.

No hagas commits, pushes, publicaciones ni despliegues, salvo que formen parte de la tarea autorizada.

Comprueba el estado final del repositorio y evita sobrescribir cambios preexistentes.

Empieza inspeccionando el repositorio y continúa con la implementación por fases. No te limites a proponer una arquitectura ni esperes confirmación para empezar a trabajar.

El objetivo es construir una plataforma que convierta lenguaje natural en pruebas BDD fiables, sea capaz de resolver distintas formulaciones equivalentes, explore aplicaciones reales, genere escenarios revisables y ejecute únicamente pruebas aprobadas, con código controlado, persistencia real y resultados verificables.

La consola existente debe reflejar fielmente lo ocurrido durante cada ejecución. La arquitectura debe adaptarse al repositorio sin perder las responsabilidades necesarias. Ningún resultado se debe presentar como real si no existe evidencia verificable de que ocurrió.
