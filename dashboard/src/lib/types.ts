export type DashboardView =
  | 'capture'
  | 'flows'
  | 'search'
  | 'compare'
  | 'sequence'
  | 'replay'
  | 'agents'
  | 'frida'
  | 'settings'

export type ProtocolFilter = 'all' | 'http' | 'https' | 'websocket'

export type OrphanProcess = {
  pid: number
  command: string
  listen_host?: string | null
  listen_port?: number | null
  mode?: string | null
  capture_path?: string | null
  max_body_bytes?: number | null
}

export type OrphanCleanupFailure = OrphanProcess & {
  error?: string
}

export type MitmStatus = {
  running: boolean
  pid?: number
  capture_path: string
  listen_host?: string | null
  listen_port?: number | null
  lan_ip?: string | null
  mode?: string | null
  max_body_bytes?: number | null
  orphan_count?: number
  orphan_processes?: OrphanProcess[]
  cleaned_orphans?: OrphanProcess[]
  cleanup_failed?: OrphanCleanupFailure[]
  index_progress?: {
    indexed: number
    total: number
  }
  error?: string
}

export type FlowPart = {
  http_version: string
  headers: Record<string, string>
  body: string | null
  body_base64?: string | null
  body_proto?: unknown
}

export type FlowTiming = {
  dns_lookup_ms?: number
  tcp_connect_ms?: number
  tls_handshake_ms?: number
  time_to_first_byte_ms?: number
  download_ms?: number
  total_duration_ms?: number
}

export type FlowSearchFilters = {
  query: string
  method: string
  statusMin: string
  statusMax: string
  timeFrom: string
  timeTo: string
}

export type Flow = {
  ts: number
  id: string
  client: [string, number] | null
  server: [string, number] | null
  request: FlowPart & {
    method: string
    url: string
    host?: string | null
    path?: string | null
  }
  response: FlowPart & {
    status_code: number
    reason: string
    body_size?: number | null
  }
  timing?: FlowTiming
}

export type FlowSummary = {
  ts: number
  id: string
  client: [string, number] | null
  server: [string, number] | null
  request: {
    method: string
    url: string
    host?: string | null
    path?: string | null
  }
  response: {
    status_code: number
    reason: string
    body_size?: number | null
  }
  timing?: FlowTiming
}

export type FlowsResponse = {
  count: number
  flows: FlowSummary[]
}

export type FlowsSearchParams = {
  n: number
  query?: string
  url_contains?: string
  method?: string
  status_min?: number
  status_max?: number
  time_from?: number
  time_to?: number
  decode_proto?: boolean
  summary?: boolean
}

export type StartRequest = {
  listen_host: string
  listen_port: number
  mode: string
  capture_path?: string | null
  max_body_bytes: number
}

export type MobilePairing = {
  token: string
  profile_url: string
  host: string
  pairing_port: number
  proxy_port: number
  wifi_ssid: string
  created_at: number
  expires_at: number
  downloaded_at: number | null
  client_ip: string | null
  status: 'ready' | 'downloaded' | 'expired'
  expires_in_seconds: number
  qr_image_data_url?: string
  status_url?: string
  proxy_ready?: boolean
}

export type CodexStatus = {
  available: boolean
  running: boolean
  initialized: boolean
  last_error: string | null
  active_reviews: number
}

export type CodexReview = {
  id: string
  thread_id: string | null
  turn_id: string | null
  status: 'starting' | 'running' | 'completed' | 'interrupted' | 'failed'
  output: string
  error: string | null
  created_at: number
  updated_at: number
  events: Array<{ type: string; status: string }>
  flow_ids?: string[]
  missing_flow_ids?: string[]
  include_bodies?: boolean
}

export type ReplayRequest = {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string | null
  body_base64?: string | null
  timeout_seconds?: number
  verify_tls?: boolean
  max_response_bytes?: number
}

export type ReplayResponse = {
  ok: boolean
  response?: {
    status_code: number
    reason?: string
    headers: Record<string, string>
    body?: string | null
    body_base64?: string | null
  }
  elapsed_ms?: number
  error?: string
}

export type FieldComparison = {
  equal: boolean
  value1: string | number | null
  value2: string | number | null
  diff?: string[]
}

export type HeaderComparison = {
  in_flow1: boolean
  in_flow2: boolean
  value1: string | null
  value2: string | null
  equal: boolean
}

export type BodyComparison = {
  equal: boolean
  value1: string
  value2: string
  diff: string[]
  truncated: boolean
}

export type FlowComparison = {
  flow1_id: string
  flow2_id: string
  request: {
    url: FieldComparison
    method: FieldComparison
    headers: Record<string, HeaderComparison>
    body: BodyComparison
  } | null
  response: {
    status: FieldComparison
    headers: Record<string, HeaderComparison>
    body: BodyComparison
  } | null
}

export type ExportFormat = 'json' | 'jsonl' | 'curl'

export type FlowsExportRequest = {
  flow_ids: string[]
  format: ExportFormat
}

export type FlowsExportResponse = {
  data: string
  format: ExportFormat
  count: number
}

export type SequenceMessage = {
  from: string
  to: string
  label: string
  status: number
  method: string
  path: string
  timestamp: number
  flow_id: string
}

export type SequenceData = {
  participants: string[]
  messages: SequenceMessage[]
}

export type FridaDevice = {
  id: string
  name: string
  type: string
}

export type FridaSessionState = {
  device_id: string
  device_name: string
  process_name: string
  process_pid: number
  attached: boolean
  attached_at: number
}

export type FridaStatus = {
  frida_available: boolean
  session: FridaSessionState
  hook_count: number
  event_count: number
}

export type FridaHook = {
  id: string
  target: string
  capture_args: boolean
  capture_retval: boolean
  call_count: number
  created_at: number
}

export type FridaEvent = {
  hook_id: string
  timestamp: number
  event_type: string
  data: Record<string, unknown>
  correlated_flow_id: string
}

export type FridaTraceResult = {
  duration: number
  event_count: number
  events: FridaEvent[]
}

export type FridaMemoryScanResult = {
  matches: Array<Record<string, unknown>>
  pattern: string
}

export type FridaMemoryReadResult = {
  address: string
  size: number
  hex: string
}
