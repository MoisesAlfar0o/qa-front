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

Abre [http://127.0.0.1:4173](http://127.0.0.1:4173) para el panel de reportes. Abre [http://127.0.0.1:4173/planner](http://127.0.0.1:4173/planner) para convertir una historia en una propuesta, revisarla y probarla. La app bajo prueba está en [http://127.0.0.1:4173/sample](http://127.0.0.1:4173/sample).

Ollama se ejecuta en tu propio equipo; no se necesita una clave de API ni se envía la historia a un proveedor externo. La primera vez, `ollama pull qwen2.5:3b` descarga el modelo gratuito, que ocupa varios GB y puede tardar según la conexión. En Windows, Ollama suele quedarse activo en segundo plano después de instalarlo. El status del planner indica si el servicio y el modelo están disponibles.

La URL objetivo puede cambiarse desde el planner, pero por seguridad esta demo acepta únicamente `localhost`, `127.0.0.1` y `[::1]`. Inicia primero la aplicación que quieras probar en una de esas direcciones. La navegación del navegador también bloquea solicitudes a destinos externos.

Para cambiar modelo o dirección local de Ollama en PowerShell, antes de `npm run dev`:

```powershell
$env:OLLAMA_MODEL = "qwen2.5:3b"
$env:OLLAMA_URL = "http://127.0.0.1:11434"
npm run dev
```

## Qué ocurre al ejecutar

1. El planner envía la historia y URL local a `POST /api/planner/plan`.
2. El servidor solicita a Ollama un JSON acotado de acciones permitidas (escribir, pulsar y verificar localizadores accesibles).
3. El usuario revisa y aprueba el plan antes de ejecutarlo.
4. `POST /api/planner/runs` inicia Chromium. Playwright emite progreso, registros y capturas que muestra el panel.
5. El reporte general conserva su flujo anterior: `POST /api/runs` ejecuta la suite fija, que produce reportes JSON y HTML e historial local.

Los archivos generados se guardan en `test-results/` y `playwright-report/`; están ignorados por Git. El panel conserva hasta 50 ejecuciones.

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

## Cómo sería el planner en un proyecto real

El planner ya llama a Ollama, pero sigue siendo un prototipo. Una arquitectura de producción debería mejorar estas piezas:

1. **Servicio de IA:** Ollama puede sustituirse por otro proveedor; sus credenciales deben permanecer en backend y nunca enviarse al navegador.
2. **Validación:** el prototipo limita acciones a `fill`, `click` y aserciones visibles. Una app empresarial debe añadir criterios de aceptación, revisión editable y políticas para acciones de riesgo.
3. **URLs autorizadas:** para probar sitios de empresa, reemplaza la regla local por una lista de dominios aprobados y valida DNS/redirecciones en el backend y en el worker. No aceptar URLs arbitrarias del cliente: el navegador servidor podría ser abusado para alcanzar servicios internos.
4. **Ejecución aislada:** usa workers efímeros en contenedores, límites de tiempo y recursos, y permisos de red mínimos.
5. **Actualización en vivo:** cambia el polling del prototipo por WebSocket o Server-Sent Events si necesitas más concurrencia.
6. **Resultados:** guarda el plan aprobado, versión, ambiente, resultado, capturas y trazas con controles de acceso y retención.

La IA ofrece una **propuesta**, no una garantía. La demo no ejecuta código generado por el modelo: valida la respuesta y la traduce a operaciones Playwright permitidas. Una persona debe revisar los pasos, datos de prueba y acciones antes de ejecutarlos.
