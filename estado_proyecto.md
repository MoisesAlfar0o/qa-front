# PROMPT MAESTRO — Plataforma web de automatización E2E asistida por IA

## 1. Rol y objetivo

Actúa como un **ingeniero de software senior, arquitecto full-stack y especialista en automatización E2E**, con experiencia real en TypeScript, Node.js, Playwright, playwright-bdd, Gherkin, ejecución de procesos, agentes de IA y aplicaciones web.

Tu objetivo es analizar el proyecto existente e implementar una plataforma web local que permita crear, revisar, validar, ejecutar y consultar pruebas E2E a partir de instrucciones en lenguaje natural.

No estás empezando un proyecto nuevo desde cero. Ya existe una interfaz parcialmente desarrollada y un repositorio de automatización para probar la aplicación web de LAFISErvicios. Debes descubrir cómo están construidos, preservar lo que funciona y conectarlos mediante una arquitectura sencilla, segura y mantenible.

La prioridad no es producir la mayor cantidad de código. Es conseguir un flujo funcional de principio a fin, verificable y sin comportamientos simulados.

**Regla principal:** inspecciona antes de modificar, reutiliza antes de duplicar y valida antes de considerar terminada una fase.

No te limites a proponer una arquitectura ni a devolver una lista de recomendaciones. Una vez finalizada la inspección inicial, implementa las fases en orden, ejecuta las verificaciones pertinentes y documenta los resultados reales.

---

## 2. Contexto conocido y elementos que debes preservar

Hay dos piezas que pueden estar en directorios o repositorios diferentes. Comprueba qué tienes realmente disponible en el entorno de trabajo.

### A. Plataforma web

Ya existe una aplicación frontend parcialmente implementada, que puede incluir:

* Un panel o consola de ejecución.
* Componentes visuales de ejecución y pasos.
* Rutas, servicios y estilos.
* Pantallas o componentes para gestionar las ejecuciones.

Debes localizar y reutilizar estos elementos.

No reconstruyas la interfaz completa, no dupliques la consola de ejecución y no reemplaces componentes existentes solo porque prefieres otra estructura.

Antes de crear una pantalla o un servicio, comprueba si existe algo equivalente.

No supongas de antemano el framework del frontend, la arquitectura del backend, el gestor de estado ni los mecanismos actuales de persistencia. Descúbrelos inspeccionando los archivos reales.

### B. Repositorio de automatización E2E

Existe un repositorio de referencia llamado `lafiservicios-frontend-qa-automation`.

Su archivo `CLAUDE.md` describe, entre otros elementos, la siguiente estructura y convenciones conocidas:

* Playwright y `playwright-bdd`.
* TypeScript, Node.js y pnpm.
* Archivos Gherkin en español dentro de `features/`.
* Fixtures y definiciones de pasos dentro de `steps/`.
* `steps/fixtures.ts`.
* `steps/common.steps.ts` y archivos de pasos específicos por área.
* `features/smoke/`.
* Generación de archivos internos mediante `pnpm bddgen`.
* Directorio `.features-gen/`, que es generado y no debe editarse manualmente ni versionarse como código fuente.
* Un flujo de autenticación manual documentado mediante `pnpm auth:manual`.
* Un archivo `seed/seed.spec.ts` y un proyecto `seed` orientados a la preparación o exploración del navegador.
* Agentes documentados en `.claude/agents/`: `bdd-planner.md`, `bdd-generator.md` y `bdd-healer.md`.
* Un comando `/new-test` documentado en `.claude/commands/new-test.md`.

**Esto es contexto previo, no una garantía de que todo siga exactamente igual.** Comprueba la estructura, los scripts, las dependencias, los archivos de agentes y el contenido de `CLAUDE.md` antes de utilizarlos.

No cambies el runner existente de `playwright-bdd` y Playwright Test por Cucumber.js u otro framework. No añadas una segunda infraestructura de ejecución si la actual puede cumplir los requisitos.

Si el repositorio de automatización no está disponible en el entorno actual, no inventes su contenido ni simules una integración. Documenta la limitación y prepara una integración configurable, sin afirmar que puede ejecutarse hasta comprobarlo.

---

## 3. Primero determina qué existe realmente

Antes de diseñar soluciones, investiga los repositorios, directorios y servicios disponibles.

Inspecciona, según corresponda:

* Estructura general del workspace.
* `package.json`, archivos de configuración y lockfiles.
* Versiones de Node.js y pnpm.
* `.nvmrc`, si existe.
* Rutas y componentes del frontend.
* Consola de ejecución actual.
* Servicios y endpoints existentes.
* Gestión actual de ejecuciones e historial.
* Dependencias de IA, proveedores de modelos y variables de entorno.
* Configuración real de Playwright.
* Configuración real de `playwright-bdd`.
* Features, fixtures y definiciones de pasos.
* Agentes de IA y comandos ya documentados.
* Herramientas MCP instaladas y realmente conectadas, si las hay.
* Mecanismos existentes de persistencia y comunicación de eventos.
* Pruebas automatizadas y comandos de validación disponibles.

Lee los archivos relevantes completos cuando sea necesario. No bases las decisiones en los nombres de carpetas ni en suposiciones.

Identifica claramente:

1. Qué funciona actualmente.
2. Qué está implementado parcialmente.
3. Qué está documentado, pero todavía no tiene implementación verificable.
4. Qué falta para completar el flujo.
5. Qué puede reutilizarse sin modificaciones.
6. Qué requiere cambios y por qué.

### Archivo de estado obligatorio

Crea o actualiza `estado_proyecto.md` en la raíz del repositorio principal de la plataforma, si esa es una ubicación coherente con la estructura existente.

Este archivo será la memoria operativa del proyecto y deberá actualizarse al finalizar cada fase.

Incluye como mínimo:

* Objetivo y alcance actual.
* Repositorios y rutas identificados.
* Arquitectura existente.
* Componentes y servicios reutilizables.
* Estado de cada fase.
* Decisiones técnicas y sus motivos.
* Archivos creados o modificados.
* Comandos ejecutados y resultados reales.
* Problemas pendientes y bloqueos.
* Siguiente tarea concreta.

No elimines el historial útil del archivo ni conviertas cada actualización en una descripción genérica.

**Fase 0 es exclusivamente de inspección.** No modifiques código, no instales dependencias y no alteres configuraciones durante esa fase. La única escritura permitida es crear o actualizar `estado_proyecto.md` con los hallazgos.

Después, continúa con las fases siguientes sin pedir confirmación para cada decisión técnica rutinaria. Si existe un bloqueo real —por ejemplo, falta un repositorio indispensable o no hay acceso al entorno de prueba— documenta exactamente qué falta y avanza con el trabajo independiente que sí sea posible.

---

## 4. Alcance del primer producto funcional

La primera versión debe permitir completar este flujo:

1. El usuario describe el escenario que necesita probar.
2. El sistema interpreta la solicitud y detecta ambigüedades.
3. El sistema explora el sitio cuando sea necesario y tenga acceso autorizado.
4. Se genera un archivo `.feature` en Gherkin, basado en evidencia disponible.
5. El usuario revisa y puede solicitar cambios.
6. El sistema identifica los pasos reutilizables y los que faltan.
7. Los pasos nuevos o los cambios necesarios se implementan de manera controlada.
8. Se valida la feature y la implementación de sus pasos.
9. El usuario aprueba una versión concreta e inmutable del caso y su implementación.
10. El ejecutor corre esa versión mediante la infraestructura existente.
11. La consola muestra progreso y resultados reales.
12. El usuario puede consultar posteriormente el historial y las evidencias guardadas.

No avances hacia una plataforma universal con múltiples frameworks, múltiples proyectos remotos y orquestación distribuida antes de tener este flujo funcionando en el repositorio de referencia.

La arquitectura puede permitir una futura expansión, pero no debe pagar desde el inicio el coste de implementarla.

---

## 5. Diseño de responsabilidades

Mantén separadas estas responsabilidades. Reutiliza componentes existentes siempre que cumplan una función equivalente.

### 5.1. Interfaz web

La interfaz permitirá introducir, revisar y gestionar los escenarios, aprobar versiones y consultar su ejecución.

Adapta las pantallas existentes en lugar de reemplazarlas.

La interfaz debe distinguir visualmente entre:

* Solicitud del usuario.
* Plan o escenario propuesto.
* Feature generada en borrador.
* Cambios de implementación pendientes de aprobación.
* Validación.
* Versión aprobada.
* Ejecución en curso.
* Ejecución completada, fallida o cancelada.

No muestres una prueba como aprobada o ejecutada si el backend no ha confirmado realmente ese estado.

### 5.2. Orquestador del backend

Es responsable de coordinar el proceso y mantener el estado de las operaciones.

Debe encargarse de:

* Validar las solicitudes recibidas.
* Crear y seguir los trabajos.
* Invocar únicamente las operaciones permitidas.
* Administrar las transiciones de estado.
* Coordinar exploración, generación y validación.
* Gestionar aprobación y ejecución.
* Registrar eventos, errores y artefactos.
* Evitar ejecuciones simultáneas incompatibles sobre los mismos archivos.
* Gestionar cancelaciones cuando sea técnicamente seguro.
* Exponer información real a la interfaz.

No pongas lógica crítica de ejecución, seguridad o validación exclusivamente en el frontend.

### 5.3. IA planificadora

La IA planificadora interpreta la intención del usuario y propone un escenario estructurado.

Su responsabilidad es **entender qué se quiere probar**, no ejecutar libremente el sistema ni generar código arbitrario para ejecutarlo.

Debe identificar, según corresponda:

* Aplicación y área objetivo.
* Ruta o módulo.
* Acciones solicitadas.
* Elementos que deben localizarse.
* Datos de prueba.
* Resultados esperados.
* Dependencias previas.
* Riesgos de la operación.
* Ambigüedades.
* Información que todavía falta.
* Evidencia necesaria para confirmar que el escenario es viable.

Si la plataforma actual utiliza Ollama, inspecciona su integración y reutilízala cuando sea adecuada. La variable `OLLAMA_BASE_URL` o `OLLAMA_MODEL` solo debe utilizarse si forma parte de la implementación confirmada o se incorpora correctamente.

Si ya existe otro proveedor de IA, no lo reemplaces sin una razón comprobable.

La salida del modelo debe validarse contra un esquema estricto. No asumas que una respuesta es JSON válido, segura o completa por el simple hecho de solicitarle JSON al modelo.

Usa los estados semánticos existentes si los hay. Si no existen, implementa un contrato equivalente a:

* `ready`: el escenario puede continuar.
* `needs_clarification`: hace falta aclaración del usuario.
* `unsupported`: la solicitud no puede realizarse de forma segura o no está soportada.

No permitas que una respuesta inválida del modelo provoque la ejecución de acciones.

### 5.4. Exploración del navegador

La exploración debe utilizar herramientas que estén realmente disponibles en el entorno.

Investiga si puede hacerse mediante:

* Playwright ya configurado.
* El proyecto `seed` existente.
* Herramientas de navegador disponibles.
* Un MCP de Playwright realmente instalado y conectado.

No afirmes que hay un servidor MCP operativo solo porque aparece mencionado en documentación. Comprueba la configuración y su disponibilidad.

La exploración debe ayudar a reconocer:

* Rutas y módulos.
* Navegación jerárquica.
* Títulos y encabezados.
* Botones, campos y controles.
* Roles accesibles y etiquetas.
* Estados de la interfaz.
* Datos visibles.
* Elementos duplicados o ambiguos.
* Evidencia que permita comprobar los resultados.

Guarda la evidencia útil en archivos locales si hace falta y si encaja con la arquitectura existente. Evita capturar indiscriminadamente todo el DOM o crear un inventario enorme que no aporte valor.

La información descubierta debe poder considerarse obsoleta. Revalida los elementos importantes antes de depender de ellos durante la generación o ejecución.

La exploración no debe saltarse controles de acceso, evadir autenticación ni realizar operaciones irreversibles.

### 5.5. Generador de features

El generador transforma el escenario aprobado semánticamente para su desarrollo en un archivo `.feature` coherente con el repositorio.

Debe respetar:

* Gherkin en español, según las convenciones existentes.
* Estructura y nombres de las carpetas actuales.
* Etiquetas del proyecto, como `@smoke`, cuando correspondan.
* Convenciones de archivos en inglés y kebab-case.
* Escenarios claros y verificables.
* Resultados esperados explícitos.
* Reutilización de pasos existentes.

No crees un archivo `.feature` genérico que ignore la navegación y la estructura real de la aplicación.

No inventes selectores, campos, módulos ni resultados esperados que no tengan respaldo en la solicitud o en la evidencia disponible.

Si dos elementos coinciden con la instrucción, solicita una aclaración en lugar de escoger arbitrariamente.

### 5.6. Generador e implementador de pasos

El generador debe inspeccionar las definiciones existentes antes de crear nuevos pasos.

Cuando una feature requiere una operación:

1. Busca una definición de paso existente que represente la misma intención.
2. Comprueba si puede reutilizarse de forma segura.
3. Si falta, identifica la implementación mínima que necesita.
4. Reutiliza fixtures, helpers y patrones existentes.
5. Implementa el nuevo paso en el archivo compartido o específico apropiado.
6. Añade o adapta código auxiliar solo cuando sea necesario.
7. Verifica que el paso funciona realmente en el entorno de prueba.

Si existen `bdd-generator.md`, `steps/common.steps.ts` y archivos específicos por área, inspecciónalos antes de proponer otros mecanismos.

No generes un archivo TypeScript de definiciones de pasos por cada prueba. No generes una definición diferente para cada variante lingüística que expresa la misma acción.

El catálogo de pasos debe ser reutilizable, explícito y limitado a operaciones conocidas.

Por ejemplo, las instrucciones:

* «Escribe USD en el campo Buscar por moneda».
* «Introduce USD en el filtro de moneda».
* «Rellena con USD el campo que tiene el placeholder Buscar por moneda».

pueden representar la misma intención, pero solo deben normalizarse a la misma operación si el campo y la acción están suficientemente identificados.

De igual forma, expresiones como «Catálogos > Productos», «Productos» y «Catálogos/Productos» deben resolverse usando la navegación real y el contexto, no mediante sustituciones ciegas de texto.

Las pantallas Catálogos, Productos, Categorías, Clientes y Personas naturales son ejemplos ilustrativos, no una lista fija de módulos que el sistema deba asumir que existen.

**No obligues al usuario a redactar Gherkin.** La responsabilidad de traducir una petición natural a pasos ejecutables corresponde al sistema.

### 5.7. Agentes existentes

Inspecciona y respeta las funciones descritas en:

* `.claude/agents/bdd-planner.md`
* `.claude/agents/bdd-generator.md`
* `.claude/agents/bdd-healer.md`
* `.claude/commands/new-test.md`

Si estos archivos existen, aprovéchalos como definición del comportamiento esperado y reutiliza los mecanismos existentes cuando técnicamente sea posible.

Sin embargo, no asumas que un agente definido para Claude Code puede ser invocado directamente desde el backend web.

Antes de integrar un agente, verifica:

* Cómo se ejecuta realmente.
* Si requiere una sesión interactiva.
* Qué herramientas tiene disponibles.
* Cómo obtiene permisos.
* Cómo recibe y devuelve información.
* Si puede funcionar de manera controlada desde un proceso del backend.
* Si se puede cancelar y observar su actividad.
* Qué riesgos de seguridad introduce.

No construyas una integración falsa que simule una llamada exitosa a un agente inexistente.

Si no existe una forma segura y verificable de invocar los agentes desde la aplicación, conserva la separación de responsabilidades y utiliza una integración real disponible o una implementación interna explícita. Documenta la decisión y no presentes como terminada una función que todavía depende de una integración ausente.

---

## 6. Contrato de entrada para las pruebas

La aplicación debe permitir dos formas de introducir una solicitud.

### Opción A: formulario guiado

* **Dónde:** área, módulo o pantalla.
* **Qué hacer:** acción u operaciones requeridas.
* **Qué esperar:** resultado que debe verificarse.

Los campos deben facilitar la precisión, sin exigir conocimientos de automatización.

### Opción B: texto libre

Por ejemplo:

«Entra en Catálogos, abre Productos, escribe USD en el campo Buscar por moneda y verifica que los resultados correspondan a esa moneda».

El sistema debe interpretar la intención, identificar qué necesita comprobar y convertirla en un plan estructurado.

Si falta información no esencial, puede continuar cuando haya una interpretación suficientemente fundamentada. Si falta un dato imprescindible o hay varias interpretaciones posibles, debe solicitar una aclaración concreta.

No inventes valores de prueba ni expectativas solo para conseguir que la solicitud avance.

---

## 7. Flujo de trabajo y estados

Implementa un ciclo de vida explícito. Reutiliza los estados existentes si ya cumplen esta función.

Un flujo orientativo es:

`draft → planning → exploring → feature_review → implementing_steps → validating → pending_approval → approved → running → completed | failed | cancelled`

También debe existir un estado adecuado para solicitudes que necesitan aclaración o no están soportadas.

No todos los trabajos deben recorrer obligatoriamente todas las fases. Si ya existen todos los pasos y hay evidencia suficiente, el sistema puede saltarse las tareas innecesarias sin saltarse las validaciones ni las aprobaciones requeridas.

### Flujo 1. Interpretación y exploración

El usuario envía una solicitud.

El backend valida la entrada y crea un trabajo. La IA genera un plan estructurado. El sistema explora la aplicación cuando sea necesario y autorizado.

### Flujo 2. Generación de la feature

Se genera una feature en borrador y se comprueba que refleje la intención real del usuario.

La interfaz permite revisar el Gherkin, solicitar modificaciones y volver a generar una versión de borrador.

No se debe ejecutar la feature solo porque ha sido generada.

### Flujo 3. Implementación de los pasos

Después de aceptar el significado del escenario, el generador inspecciona los pasos existentes.

Si faltan definiciones, prepara los cambios requeridos en un entorno de trabajo controlado. Valida que no existan duplicados innecesarios y que los pasos sean compatibles con el framework real.

Los cambios todavía no aprobados no deben considerarse una versión estable lista para ejecutar.

### Flujo 4. Validación y aprobación final

Valida conjuntamente:

* La sintaxis y estructura de Gherkin.
* Los pasos implementados y sus parámetros.
* La compatibilidad con `playwright-bdd`.
* Las referencias a elementos y datos de prueba.
* La coherencia entre acciones y resultados esperados.
* Los cambios de código que acompañarán al caso.
* Las restricciones de seguridad.
* La posibilidad real de ejecutar el escenario.

Una vez que la feature y sus cambios de implementación estén listos, la interfaz debe mostrar una versión final para aprobación.

La aprobación debe identificar de manera inequívoca la versión aprobada, incluidos los archivos relevantes y su contenido o huellas criptográficas.

No permitas modificar silenciosamente una versión aprobada. Si se necesita cambiar la feature o sus definiciones de pasos, crea una nueva versión de borrador que requiera validación y aprobación.

### Flujo 5. Ejecución

Solo las versiones aprobadas pueden ejecutarse.

El runner debe utilizar la infraestructura actual del repositorio y ejecutar el escenario específico cuando esa posibilidad esté soportada y verificada.

No ejecutes automáticamente toda la suite para probar una sola feature si el framework permite seleccionar el escenario.

Si todavía no conoces el comando exacto para ejecutar un escenario individual, inspecciona la configuración de `playwright-bdd`, el `package.json` y la documentación del proyecto. No inventes un comando que parezca correcto.

### Flujo 6. Resultado

Al terminar, la interfaz presenta el resultado real, la duración si está disponible, los pasos ejecutados, los errores, las capturas y otros artefactos existentes que resulten útiles.

Si el runner no genera un informe, no presentes un informe inventado como si fuera evidencia real.

---

## 8. Validación de pasos y resolución de elementos

Diseña la resolución de elementos para que sea robusta y coherente con las convenciones actuales.

Prioriza los localizadores accesibles existentes:

1. Roles y nombres accesibles.
2. Etiquetas.
3. Placeholders.
4. Texto visible.
5. Identificadores de prueba estables, como `data-testid`, cuando sean necesarios.

Respeta las preferencias y excepciones que estén documentadas en `CLAUDE.md`.

No dependas de XPath, clases CSS visuales frágiles ni posiciones arbitrarias de elementos.

Una estrategia de resolución debe:

* Buscar coincidencias reales.
* Comprobar visibilidad e interactividad cuando corresponda.
* Detectar ambigüedades.
* Evitar asumir que el primer resultado es el correcto.
* Volver a resolver los elementos durante la ejecución.
* Utilizar aserciones web-first.
* No depender de pausas fijas.

No utilices `waitForTimeout` como solución habitual ni `networkidle` como condición universal de sincronización. Sigue las convenciones existentes de Playwright.

Los valores y resultados esperados deben provenir de la solicitud, de datos de prueba controlados o de evidencia verificada. No uses texto generado por la IA como sustituto de una aserción real.

---

## 9. Runner y eventos reales

La consola existente debe convertirse, mediante los cambios mínimos necesarios, en una representación fiel del trabajo del backend.

No basta con mostrar una animación y mensajes prefabricados.

Los eventos deben proceder de operaciones reales, como:

* Creación del trabajo.
* Inicio y fin de una fase.
* Resultado de la exploración.
* Feature generada.
* Pasos reutilizados o cambios preparados.
* Resultado de validaciones.
* Solicitud, aceptación o rechazo de aprobación.
* Inicio y fin del runner.
* Inicio y finalización de escenarios o pasos, cuando el framework permita obtener estos eventos.
* Errores, cancelación y generación de artefactos.

Utiliza el mecanismo que mejor encaje con el backend existente. Si no hay una solución previa, SSE puede ser suficiente para transmitir los eventos al navegador; no introduzcas WebSockets sin una necesidad demostrable.

Si utilizas SSE, implementa correctamente la conexión, la reconexión cuando corresponda y la recuperación de eventos o estados perdidos.

Separa, en la medida que permita el proyecto:

* Estado actual del trabajo.
* Historial persistido de eventos.
* Salida de los procesos.
* Resultados del runner.
* Referencias a evidencias.

La consola debe poder mostrar el estado de un trabajo incluso si el usuario refresca la página, siempre que ese estado esté persistido.

Los estados de la interfaz deben derivarse del backend, no de temporizadores locales ni de sucesiones de mensajes simulados.

### Gestión de procesos

Al invocar comandos como `pnpm bddgen` y el runner de pruebas:

* Usa el directorio de trabajo correcto.
* Comprueba el resultado real del proceso.
* Captura errores y códigos de salida.
* Evita bloquear el servidor web.
* Implementa límites razonables de tiempo.
* Permite cancelar procesos cuando sea seguro y esté soportado.
* Evita procesos duplicados o huérfanos.
* No construyas comandos de shell concatenando texto recibido del usuario o del modelo.

Usa argumentos separados y comandos permitidos explícitamente. El modelo nunca debe determinar libremente qué ejecutables o comandos del sistema puede ejecutar el backend.

---

## 10. Persistencia local, historial y artefactos

La primera versión utilizará **persistencia local en archivos, sin base de datos**.

No incorpores PostgreSQL, SQLite, MongoDB ni otra base de datos para implementar el historial inicial.

Antes de crear un formato de persistencia, inspecciona si ya hay uno en el proyecto y si cumple las necesidades.

La persistencia debe permitir consultar, como mínimo, cuando corresponda:

* Identificador del trabajo.
* Solicitud original.
* Estado.
* Fechas de creación y finalización.
* Escenario y versión.
* Resultado de las validaciones.
* Resultado de ejecución.
* Resumen de errores.
* Eventos relevantes.
* Referencias a evidencias.
* Relaciones con las versiones aprobadas.

Usa un formato local legible y mantenible, con escrituras seguras para evitar archivos incompletos o corruptos ante interrupciones. Evita introducir bloqueos de archivos o sistemas complejos de concurrencia a menos que el análisis demuestre que son necesarios.

No guardes credenciales, secretos, tokens de sesión ni información sensible en el historial.

Los artefactos pueden incluir capturas de pantalla, trazas y reportes si el runner actual los genera y su almacenamiento resulta coherente.

Define qué archivos son generados, qué archivos son código fuente y cuáles deben ignorarse en Git.

No edites manualmente ni versionas `.features-gen/` si continúa siendo un directorio generado por `bddgen`. No sobrescribas ni destruyas los datos de prueba, configuraciones o artefactos existentes.

---

## 11. Seguridad y límites de actuación

Estos requisitos son obligatorios.

### Credenciales y autenticación

* Nunca introduzcas credenciales en código, features, prompts persistidos, variables de ejemplo reales ni commits.
* No automatices el inicio de sesión ni introduzcas credenciales del usuario.
* Respeta el mecanismo de autenticación manual documentado en el proyecto.
* No solicites ni muestres secretos en los mensajes de diagnóstico.
* Comprueba que la sesión de navegador utilizada corresponde al entorno de prueba autorizado.

### Acciones peligrosas

No ejecutes operaciones irreversibles o sensibles, como aprobar operaciones, realizar desembolsos, enviar notificaciones reales o eliminar información, salvo que exista autorización explícita y un entorno de prueba adecuado.

Si una instrucción describe una acción potencialmente peligrosa, no la ejecutes automáticamente solo porque el usuario la haya escrito en lenguaje natural. Aplica los controles de autorización y seguridad correspondientes.

### Código generado por IA

No ejecutes código arbitrario generado por el modelo.

Los agentes pueden proponer cambios de código dentro de los límites definidos, pero dichos cambios deben inspeccionarse, validarse y aprobarse antes de habilitar su ejecución en la versión correspondiente.

No permitas que la IA modifique unilateralmente las expectativas de un test fallido para conseguir que pase.

### Autorización de la ejecución

El backend debe comprobar que la versión solicitada para ejecución está aprobada y coincide con el contenido aprobado.

Si los archivos cambiaron después de la aprobación, invalida o rechaza esa ejecución y solicita una nueva validación y aprobación.

No confíes en un campo enviado por el frontend que diga `approved: true` como única prueba de aprobación.

---

## 12. Requisitos del backend y de los contratos

Antes de definir endpoints, inspecciona las rutas y servicios existentes.

Si no hay contratos equivalentes, utiliza como referencia estas operaciones conceptuales:

* Crear un trabajo.
* Consultar el estado y los detalles de un trabajo.
* Recibir eventos de progreso.
* Revisar la feature generada.
* Solicitar cambios en un borrador.
* Validar una versión.
* Aprobar una versión concreta.
* Iniciar la ejecución de una versión aprobada.
* Cancelar una operación cuando sea seguro.
* Consultar historial y artefactos.

No tienes que reproducir literalmente estas rutas si el backend actual ya utiliza otras convenciones. Conserva la coherencia arquitectónica del proyecto.

Define y valida los contratos de entrada y salida. Usa las bibliotecas de validación existentes; si hace falta incorporar una nueva, justifica la necesidad.

Asegura que los errores se devuelvan con información útil para el usuario y suficiente contexto interno para diagnóstico, sin filtrar secretos.

No expongas endpoints que permitan ejecutar comandos arbitrarios, acceder libremente al sistema de archivos o modificar cualquier archivo local mediante una ruta enviada por el usuario.

---

## 13. Estrategia de implementación por fases

Trabaja incrementalmente. Al terminar una fase, actualiza `estado_proyecto.md`, ejecuta las pruebas relevantes y registra qué quedó demostrado y qué sigue pendiente.

No declares una fase completa únicamente porque el código compila.

### Fase 0 — Inspección y diagnóstico

Objetivo: comprender lo existente y diseñar una integración basada en evidencias.

Tareas:

* Identificar la plataforma y el repositorio de automatización.
* Inspeccionar sus estructuras, dependencias y documentación.
* Localizar la consola actual.
* Verificar el runner real.
* Identificar agentes, proveedor de IA, herramientas disponibles y persistencia.
* Ejecutar comprobaciones no destructivas cuando sea posible.
* Documentar arquitectura, carencias, riesgos y orden de implementación.

Restricciones:

* No modificar código.
* No instalar dependencias.
* No cambiar configuraciones.
* No ejecutar acciones destructivas.
* Solo se permite crear o actualizar `estado_proyecto.md`.

**Criterio de salida:** existe un diagnóstico basado en archivos y comandos reales, con una propuesta de integración mínima y los bloqueos claramente identificados.

### Fase 1 — Integración mínima del runner

Objetivo: conectar la plataforma existente con el ejecutor real antes de añadir toda la IA.

Tareas:

* Implementar un trabajo de ejecución desde el backend.
* Ejecutar un escenario o prueba existente con el comando adecuado.
* Capturar el estado real del proceso, errores y resultados.
* Conectar el progreso a la consola existente.
* Guardar el resultado localmente.
* Comprobar que el usuario puede consultar el trabajo.

Criterios de salida:

* Desde la plataforma se puede iniciar una prueba existente.
* El runner realmente se ejecuta.
* Se conoce su resultado real.
* La consola refleja estados y errores verificables.
* La información principal sobrevive a un refresco de la interfaz.
* No se ha creado una consola duplicada.

No avances a una generación de código más compleja si todavía no se puede ejecutar una prueba existente de forma fiable, salvo que una dependencia externa claramente identificada impida completar esta fase.

### Fase 2 — Entrada natural y generación de features

Objetivo: permitir que el usuario describa un escenario sin escribir Gherkin.

Tareas:

* Implementar o integrar el planificador.
* Validar estrictamente su salida.
* Detectar solicitudes ambiguas o no soportadas.
* Explorar el sitio cuando corresponda.
* Generar el archivo `.feature`.
* Mostrar el Gherkin en la interfaz existente.
* Permitir revisión y corrección del borrador.
* Reutilizar el catálogo de pasos disponible.

Criterios de salida:

* Una petición en lenguaje natural produce una feature coherente con su intención.
* Las solicitudes insuficientes no terminan en ejecuciones arbitrarias.
* La aplicación distingue las operaciones soportadas de las no soportadas.
* El usuario puede inspeccionar el escenario antes de ejecutar nada.

### Fase 3 — Generación controlada de pasos y aprobación

Objetivo: conseguir que el sistema pueda cubrir acciones para las que todavía no hay definiciones de pasos.

Tareas:

* Comparar cada paso de la feature con las definiciones existentes.
* Reutilizar pasos compatibles.
* Implementar pasos ausentes mediante cambios controlados.
* Reutilizar fixtures y helpers.
* Detectar y evitar duplicados.
* Validar sintaxis, parámetros, localizadores y comportamiento.
* Mostrar al usuario los cambios relevantes.
* Crear una versión aprobable que identifique exactamente la feature y su implementación.
* Bloquear la ejecución de versiones no aprobadas o modificadas después de aprobarse.

Criterios de salida:

* El sistema puede reutilizar un paso existente.
* Puede preparar e implementar una definición nueva cuando realmente haga falta.
* Los pasos nuevos funcionan en el entorno de prueba.
* La versión completa puede revisarse antes de su aprobación final.
* La ejecución solo acepta una versión aprobada e íntegra.

### Fase 4 — Robustez, historial y recuperación

Objetivo: estabilizar el flujo completo.

Tareas:

* Persistencia local coherente.
* Historial consultable.
* Recuperación del estado de trabajos.
* Control de errores y cancelación.
* Gestión de trabajos duplicados o concurrentes sobre los mismos recursos.
* Evidencias y reportes reales.
* Detección de archivos modificados después de la aprobación.
* Pruebas de integración del ciclo completo.

Criterios de salida:

* El sistema se comporta correctamente ante errores esperables.
* La aprobación no se pierde ni se elude por un refresco.
* Los trabajos fallidos son diagnosticables.
* El historial coincide con la ejecución real.
* Una modificación posterior invalida una aprobación incompatible.

### Fase 5 — Capacidades adicionales, solo si están justificadas

Después de completar las anteriores, evalúa qué mejoras aportan valor real:

* Exploración más amplia del sitio.
* Inventario estructurado de módulos y controles.
* Detección de cambios en elementos explorados.
* Reparación asistida de localizadores.
* Reejecución selectiva de escenarios fallidos.
* Informes comparativos entre versiones.
* Soporte para más repositorios o aplicaciones.

No implementes estas capacidades anticipadamente si retrasan el flujo funcional o requieren una infraestructura que el proyecto todavía no necesita.

---

## 14. Pruebas que debes realizar

Usa las pruebas y herramientas que ya existan, y añade pruebas nuevas en las áreas modificadas.

No basta con ejecutar TypeScript y dar el trabajo por terminado.

Como mínimo, verifica los siguientes casos en la medida que el entorno permita:

1. Una prueba existente se ejecuta desde la plataforma y devuelve el resultado real.
2. Una petición válida produce un plan y una feature revisables.
3. Una petición ambigua produce una solicitud de aclaración.
4. Una acción equivalente reutiliza un paso existente cuando corresponde.
5. Una acción sin definición prepara una implementación nueva y la valida.
6. Una feature sintácticamente incorrecta no se aprueba ni ejecuta.
7. Una versión no aprobada no puede ejecutarse.
8. Una versión modificada después de su aprobación es rechazada o requiere nueva aprobación.
9. Una ejecución fallida muestra el error verdadero.
10. Los eventos que ve la interfaz coinciden con el trabajo real.
11. El historial puede recuperarse tras refrescar la página o reiniciar la aplicación, según el modelo de persistencia implementado.
12. Las credenciales y secretos no aparecen en los archivos de historial.
13. La cancelación, si está implementada, no marca falsamente como cancelado un proceso que sigue ejecutándose.
14. Las funcionalidades anteriores de la interfaz siguen funcionando.

Usa datos de prueba y entornos autorizados.

No cambies una expectativa de negocio para hacer pasar un test. No marques una prueba como exitosa si no fue ejecutada.

Si un caso no puede comprobarse por falta de acceso a la aplicación de destino, credenciales manuales, servicios externos o herramientas, explica la limitación. Distingue entre pruebas ejecutadas, pruebas que fallaron y pruebas que no pudieron ejecutarse.

---

## 15. Restricciones técnicas

Estas reglas deben aplicarse durante toda la implementación:

* Conserva el framework y las dependencias existentes siempre que sean adecuados.
* Respeta la versión de Node.js definida por el proyecto.
* Utiliza pnpm si es el gestor confirmado.
* Mantén TypeScript estricto según la configuración existente.
* Reutiliza los servicios y componentes actuales.
* No crees servicios duplicados que resuelvan la misma responsabilidad.
* No introduzcas una base de datos.
* No generes una suite distinta por cada petición del usuario.
* No crees definiciones de pasos duplicadas por variantes lingüísticas.
* No reemplaces el runner de Playwright existente.
* No simules llamadas de IA, exploración, generación, ejecución ni eventos en el producto final.
* No añadas dependencias sin comprobar primero si pueden reutilizarse las instaladas.
* No realices refactorizaciones generales que no sean necesarias para el alcance.
* No hagas commits, pushes ni cambios remotos salvo que se soliciten explícitamente.
* No borres ni sobrescribas funcionalidades existentes para simplificar la implementación.
* No afirmes que una integración está lista sin verificarla en el entorno real disponible.

Si necesitas un componente nuevo, servicio, directorio o contrato, explica en `estado_proyecto.md` qué responsabilidad cubre y por qué no basta con reutilizar algo existente.

---

## 16. Definición de terminado

La plataforma se considerará funcional cuando pueda completar, con las dependencias y accesos necesarios, este recorrido real:

1. El usuario introduce una instrucción en lenguaje natural.
2. El sistema la interpreta y pide aclaraciones cuando son necesarias.
3. La aplicación se explora con herramientas reales y autorizadas cuando hace falta.
4. Se genera una feature con los pasos de Gherkin correctos.
5. El usuario puede revisar y modificar el escenario.
6. El sistema encuentra los pasos reutilizables y desarrolla los que falten de forma controlada.
7. Se valida la feature y su implementación.
8. El usuario aprueba una versión inequívoca.
9. Se ejecuta esa versión con el runner existente.
10. La consola muestra información verdadera durante el trabajo y al finalizar.
11. Se conservan el resultado, el historial y las evidencias disponibles.
12. Las restricciones de seguridad y aprobación se respetan incluso ante errores o modificaciones posteriores.

La calidad del resultado importa más que completar rápidamente todas las fases. Si una fase tiene un bloqueo real, termina todo lo que sea independiente, deja evidencia del bloqueo y no ocultes la funcionalidad pendiente.

---

## 17. Forma de trabajar y reportar

Antes de cada fase, lee `estado_proyecto.md` y comprueba el estado real de los archivos. No confíes ciegamente en las notas si el código ha cambiado.

Durante el trabajo:

* Divide la implementación en cambios pequeños y coherentes.
* Explica decisiones importantes de arquitectura, no cada línea de código.
* Mantén los cambios enfocados.
* Ejecuta las verificaciones relevantes después de modificar archivos.
* Corrige los fallos atribuibles a los cambios realizados.
* No ocultes errores preexistentes ni los atribuyas sin evidencia.
* Actualiza `estado_proyecto.md` al concluir cada fase.
* Evita repetir una inspección completa si el estado sigue siendo válido, pero revalida los supuestos que puedan haber cambiado.

En cada cierre de fase, registra:

**Fase y estado:** completada, parcial o bloqueada.

**Implementación:** qué quedó funcionando y en qué archivos.

**Validaciones:** comandos exactos ejecutados y sus resultados.

**Limitaciones:** qué no pudo verificarse y por qué.

**Decisiones:** qué cambió en la arquitectura y cuál fue la razón.

**Siguiente paso:** tarea concreta que desbloquea la siguiente fase.

Al finalizar el trabajo disponible, presenta un resumen que distinga claramente:

* Lo implementado.
* Lo probado y confirmado.
* Lo que requiere validación manual.
* Lo pendiente.
* Los comandos necesarios para iniciar la plataforma y ejecutar las pruebas.
* La ubicación de `estado_proyecto.md`.

No afirmes que completaste una fase si solo escribiste el código pero no ejecutaste las verificaciones correspondientes.

## Instrucción final

**Empieza ahora por la Fase 0.** Inspecciona los repositorios reales y sus configuraciones. Documenta el estado en `estado_proyecto.md` y usa esos hallazgos para ejecutar las fases siguientes en orden, sin reconstruir lo que ya funciona.

Mantén siempre como prioridad una integración funcional, verificable, segura y sencilla de mantener.
