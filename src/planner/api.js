async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body.details?.errors?.map((item) => item.message).join(' ') ?? body.details?.message;
    throw new Error([body.error, detail].filter(Boolean).join(' '));
  }
  return body;
}

const json = (method, body) => ({ method, body: JSON.stringify(body) });

export const platformApi = {
  status: () => request('/planner/status'),
  projects: () => request('/projects'),
  createProject: (input) => request('/projects', json('POST', input)),
  project: (projectId) => request(`/projects/${encodeURIComponent(projectId)}`),
  explore: (projectId) => request(`/projects/${encodeURIComponent(projectId)}/explore`, json('POST', {})),
  plan: (projectId, input) => request(`/projects/${encodeURIComponent(projectId)}/plans`, json('POST', { input })),
  createScenario: (projectId, planId) => request(`/projects/${encodeURIComponent(projectId)}/scenarios`, json('POST', { planId })),
  scenario: (projectId, scenarioId) => request(`/projects/${encodeURIComponent(projectId)}/scenarios/${encodeURIComponent(scenarioId)}`),
  version: (projectId, scenarioId, version) => request(`/projects/${encodeURIComponent(projectId)}/scenarios/${encodeURIComponent(scenarioId)}/versions/${version}`),
  saveVersion: (projectId, scenarioId, text, parentVersion) => request(
    `/projects/${encodeURIComponent(projectId)}/scenarios/${encodeURIComponent(scenarioId)}/versions`,
    json('POST', { text, parentVersion }),
  ),
  validate: (projectId, text, planId) => request(`/projects/${encodeURIComponent(projectId)}/validate`, json('POST', { text, planId })),
  scenarios: (projectId) => request(`/projects/${encodeURIComponent(projectId)}/scenarios`),
  approve: (projectId, scenarioId, version, expectedHash, authorizeRisk = false) => request(
    `/projects/${encodeURIComponent(projectId)}/scenarios/${encodeURIComponent(scenarioId)}/versions/${version}/approve`,
    json('POST', { expectedHash, authorizeRisk }),
  ),
  runs: (projectId) => request(`/projects/${encodeURIComponent(projectId)}/runs`),
  run: (projectId, runId) => request(`/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}`),
  startRun: (projectId, input) => request(`/projects/${encodeURIComponent(projectId)}/runs`, json('POST', input)),
  cancelRun: (projectId, runId) => request(`/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/cancel`, json('POST', {})),
  artifactUrl: (projectId, runId, file) => `/api/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/artifacts/${file.split('/').map(encodeURIComponent).join('/')}`,
};