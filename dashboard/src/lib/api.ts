import type { MitmStatus, FlowsResponse, FlowsSearchParams, Flow, FlowComparison, StartRequest, ReplayRequest, ReplayResponse, FlowsExportRequest, FlowsExportResponse, SequenceData, FridaStatus, FridaDevice, FridaHook, FridaEvent, FridaTraceResult, FridaMemoryScanResult, FridaMemoryReadResult, MobilePairing, CodexStatus, CodexReview } from './types'

async function fetchApi<T>(path: string, token: string | null, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...((options?.headers as Record<string, string>) || {}),
  }

  if (token) {
    headers['X-MCP-Token'] = token
  }

  const response = await fetch(path, {
    ...options,
    headers,
  })

  if (!response.ok) {
    let errorMessage = response.statusText
    const errorBody = await response.text()
    if (errorBody) {
      try {
        const errorData = JSON.parse(errorBody)
        errorMessage = errorData.error || errorMessage
      } catch {
        errorMessage = errorBody
      }
    }
    throw new Error(errorMessage)
  }

  return response.json()
}

export async function getStatus(token: string | null): Promise<MitmStatus> {
  return fetchApi<MitmStatus>('/api/status', token)
}

export async function startProxy(req: StartRequest, token: string | null): Promise<MitmStatus> {
  return fetchApi<MitmStatus>('/api/start', token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req),
  })
}

export async function stopProxy(token: string | null): Promise<{ running: false }> {
  return fetchApi<{ running: false }>('/api/stop', token, {
    method: 'POST',
  })
}

export async function clearFlows(token: string | null): Promise<{ cleared: true; capture_path: string }> {
  return fetchApi<{ cleared: true; capture_path: string }>('/api/clear', token, {
    method: 'POST',
  })
}

export async function createMobilePairing(wifiSsid: string, token: string | null): Promise<MobilePairing> {
  return fetchApi<MobilePairing>('/api/mobile-pairing', token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ wifi_ssid: wifiSsid }),
  })
}

export async function getMobilePairing(pairingToken: string, token: string | null): Promise<MobilePairing> {
  return fetchApi<MobilePairing>(`/api/mobile-pairing/${encodeURIComponent(pairingToken)}`, token)
}

export async function getCodexStatus(token: string | null): Promise<CodexStatus> {
  return fetchApi<CodexStatus>('/api/codex/status', token)
}

export async function startCodexReview(
  flowIds: string[],
  instruction: string,
  includeBodies: boolean,
  token: string | null
): Promise<CodexReview> {
  return fetchApi<CodexReview>('/api/codex/reviews', token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ flow_ids: flowIds, instruction, include_bodies: includeBodies }),
  })
}

export async function getCodexReview(reviewId: string, token: string | null): Promise<CodexReview> {
  return fetchApi<CodexReview>(`/api/codex/reviews/${encodeURIComponent(reviewId)}`, token)
}

export async function interruptCodexReview(reviewId: string, token: string | null): Promise<CodexReview> {
  return fetchApi<CodexReview>(`/api/codex/reviews/${encodeURIComponent(reviewId)}/interrupt`, token, {
    method: 'POST',
  })
}

export async function getFlows(
  params: FlowsSearchParams,
  token: string | null,
  signal?: AbortSignal
): Promise<FlowsResponse> {
  const searchParams = new URLSearchParams()
  searchParams.set('n', params.n.toString())
  if (params.query) searchParams.set('query', params.query)
  if (params.url_contains) searchParams.set('url_contains', params.url_contains)
  if (params.method) searchParams.set('method', params.method)
  if (params.status_min !== undefined) searchParams.set('status_min', params.status_min.toString())
  if (params.status_max !== undefined) searchParams.set('status_max', params.status_max.toString())
  if (params.time_from !== undefined) searchParams.set('time_from', params.time_from.toString())
  if (params.time_to !== undefined) searchParams.set('time_to', params.time_to.toString())
  if (params.decode_proto) searchParams.set('decode_proto', '1')
  if (params.summary !== false) searchParams.set('summary', '1')

  return fetchApi<FlowsResponse>(`/api/flows?${searchParams.toString()}`, token, { signal })
}

export async function getFlow(
  flowId: string,
  token: string | null,
  signal?: AbortSignal,
  decodeProto: boolean = false
): Promise<Flow> {
  const searchParams = new URLSearchParams()
  searchParams.set('flow_id', flowId)
  if (decodeProto) searchParams.set('decode_proto', '1')
  return fetchApi<Flow>(`/api/flows/item?${searchParams.toString()}`, token, { signal })
}

export async function killProcess(
  pid: number,
  token: string | null
): Promise<{ killed: boolean; pid: number; error?: string }> {
  return fetchApi<{ killed: boolean; pid: number; error?: string }>('/api/processes/kill', token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pid }),
  })
}

export async function replayRequest(req: ReplayRequest, token: string | null): Promise<ReplayResponse> {
  return fetchApi<ReplayResponse>('/api/replay', token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req),
  })
}

export async function compareFlows(
  flowId1: string,
  flowId2: string,
  token: string | null,
  decodeProto: boolean = false
): Promise<FlowComparison> {
  const searchParams = new URLSearchParams()
  searchParams.set('flow_id_1', flowId1)
  searchParams.set('flow_id_2', flowId2)
  if (decodeProto) searchParams.set('decode_proto', '1')

  return fetchApi<FlowComparison>(`/api/flows/compare?${searchParams.toString()}`, token)
}

export async function exportFlows(
  req: FlowsExportRequest,
  token: string | null
): Promise<FlowsExportResponse> {
  return fetchApi<FlowsExportResponse>('/api/flows/export', token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req),
  })
}

export async function getSequence(
  flowIds: string[],
  token: string | null
): Promise<SequenceData> {
  return fetchApi<SequenceData>('/api/flows/sequence', token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ flow_ids: flowIds }),
  })
}

export async function getFridaStatus(token: string | null): Promise<FridaStatus> {
  return fetchApi<FridaStatus>('/api/frida/status', token)
}

export async function getFridaDevices(token: string | null): Promise<{ devices: FridaDevice[] }> {
  return fetchApi<{ devices: FridaDevice[] }>('/api/frida/devices', token)
}

export async function getFridaHooks(token: string | null): Promise<{ hooks: FridaHook[] }> {
  return fetchApi<{ hooks: FridaHook[] }>('/api/frida/hooks', token)
}

export async function fridaAttach(target: string, device: string, token: string | null): Promise<{ attached?: boolean; process?: string; device?: string; error?: string }> {
  return fetchApi('/api/frida/attach', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, device }),
  })
}

export async function fridaDetach(token: string | null): Promise<{ detached: boolean }> {
  return fetchApi('/api/frida/detach', token, { method: 'POST' })
}

export async function fridaAddHook(target: string, captureArgs: boolean, captureRetval: boolean, scriptType: string, token: string | null): Promise<{ hook_id?: string; target?: string; script_type?: string; error?: string }> {
  return fetchApi('/api/frida/hooks', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, capture_args: captureArgs, capture_retval: captureRetval, script_type: scriptType }),
  })
}

export async function fridaRemoveHook(hookId: string, token: string | null): Promise<{ removed?: boolean; hook_id?: string; error?: string }> {
  return fetchApi('/api/frida/hooks/remove', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hook_id: hookId }),
  })
}

export async function fridaTrace(durationSeconds: number, token: string | null): Promise<FridaTraceResult & { error?: string }> {
  return fetchApi('/api/frida/trace', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration_seconds: durationSeconds }),
  })
}

export async function fridaMemoryScan(pattern: string, address: string, size: number, token: string | null): Promise<FridaMemoryScanResult & { error?: string }> {
  return fetchApi('/api/frida/memory/scan', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pattern, address, size }),
  })
}

export async function fridaReadMemory(address: string, size: number, token: string | null): Promise<FridaMemoryReadResult & { error?: string }> {
  return fetchApi('/api/frida/memory/read', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, size }),
  })
}

export type { FridaEvent }
