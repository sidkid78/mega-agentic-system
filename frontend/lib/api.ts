/**
 * API client for Mega Agentic System backend
 */

import { apiKeyHeader, getApiKey } from "./api-key";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

export interface TaskCreate {
  description: string;
  complexity: "simple" | "moderate" | "complex" | "critical";
  preferred_mode?: string;
  quality_threshold?: number;
  max_iterations?: number;
  constraints?: Record<string, unknown>;
}

export interface TaskResponse {
  task_id: string;
  status: "pending" | "running" | "completed" | "failed";
  description: string;
  complexity: string;
  mode_used?: string;
  quality_score?: number;
  execution_time?: number;
  agents_involved?: number;
  iterations?: number;
  output?: string;
  error?: string;
  created_at: string;
  completed_at?: string;
  metadata: Record<string, unknown>;
  // Token usage for this task (populated once it completes).
  prompt_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

export interface TokenBucket {
  calls: number;
  prompt_tokens: number;
  output_tokens: number;
  thoughts_tokens: number;
  cached_tokens: number;
  total_tokens: number;
}

export interface TokenUsage {
  total: TokenBucket;
  by_model: Record<string, TokenBucket>;
  by_label: Record<string, TokenBucket>;
}

export interface SystemMetrics {
  total_executions: number;
  avg_quality: number;
  avg_execution_time: number;
  success_rate: number;
  mode_performance: Record<string, {
    executions: number;
    avg_quality: number;
    avg_time: number;
    success_rate: number;
  }>;
  recent_executions: Array<{
    task_id: string;
    mode: string;
    quality: number;
    time: number;
    agents: number;
  }>;
  // Cumulative token usage since server start (may be empty before any calls).
  token_usage?: TokenUsage;
}

export interface AgentMode {
  value: string;
  description: string;
  use_cases: string[];
}

export interface LogEvent {
  timestamp: string;
  level: string;
  message: string;
  event_type: "phase" | "plan" | "mode" | "question" | "answer" | "breakthrough" | "complete" | "warning" | "learning" | "agent" | "info";
}

export interface AgentCard {
  id: number;
  name: string;
  role: string;
  mode: string;
}

export interface TaskLogs {
  task_id: string;
  status: string;
  logs: LogEvent[];
  agents: AgentCard[];
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface MusicImageInput {
  data: string; // base64, no data: prefix
  mime_type: string;
}

export interface MusicConfigRange {
  min: number;
  max: number;
  default: number;
  step: number;
}

export interface MusicRealtimeMetadata {
  success: boolean;
  model: string;
  sample_rate: number;
  channels: number;
  sample_width_bytes: number;
  mime_type: string;
  scales: string[];
  modes: string[];
  hard_transition_fields: string[];
  config_ranges: Record<
    "bpm" | "guidance" | "density" | "brightness" | "temperature" | "top_k",
    MusicConfigRange
  >;
}

export interface WeightedPrompt {
  text: string;
  weight: number;
}

export interface LiveMusicConfig {
  bpm?: number;
  scale?: string;
  guidance?: number;
  density?: number;
  brightness?: number;
  temperature?: number;
  top_k?: number;
  seed?: number;
  mute_bass?: boolean;
  mute_drums?: boolean;
  only_bass_and_drums?: boolean;
  music_generation_mode?: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...apiKeyHeader(), // BYOK: attach the user's Gemini key
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new ApiError(error.detail || `HTTP error! status: ${response.status}`, response.status);
    }

    return response.json();
  }

  async getTaskLogs(taskId: string): Promise<TaskLogs> {
    return this.request<TaskLogs>(`/tasks/${taskId}/logs`);
  }

  async createTask(task: TaskCreate): Promise<TaskResponse> {
    return this.request<TaskResponse>("/tasks", {
      method: "POST",
      body: JSON.stringify(task),
    });
  }

  async getTask(taskId: string): Promise<TaskResponse> {
    return this.request<TaskResponse>(`/tasks/${taskId}`);
  }

  async listTasks(limit: number = 50, offset: number = 0): Promise<TaskResponse[]> {
    return this.request<TaskResponse[]>(`/tasks?limit=${limit}&offset=${offset}`);
  }

  async getMetrics(): Promise<SystemMetrics> {
    return this.request<SystemMetrics>("/metrics");
  }

  async getUsage(): Promise<TokenUsage> {
    return this.request<TokenUsage>("/usage");
  }

  async resetUsage(): Promise<{ message: string; token_usage: TokenUsage }> {
    return this.request("/usage/reset", { method: "POST" });
  }

  async getModes(): Promise<{ modes: AgentMode[] }> {
    return this.request<{ modes: AgentMode[] }>("/modes");
  }

  async getComplexities(): Promise<{ complexities: Array<{ value: string; description: string }> }> {
    return this.request("/complexities");
  }

  async optimizeSystem(): Promise<{ message: string }> {
    return this.request("/system/optimize", { method: "POST" });
  }

  async saveSystemState(): Promise<{ message: string }> {
    return this.request("/system/save", { method: "POST" });
  }

  // Image Generation
  async generateImage(request: {
    prompt: string;
    aspect_ratio?: string;
    model?: string;
    number_of_images?: number;
    person_generation?: string;
    negative_prompt?: string;
  }): Promise<{ success: boolean; images: Array<{ index: number; data: string; format: string }>; count: number }> {
    return this.request("/images/generate", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async editImage(request: {
    image_base64: string;
    prompt: string;
    number_of_images?: number;
  }): Promise<{ success: boolean; images: Array<{ index: number; data: string; format: string }>; count: number }> {
    return this.request("/images/edit", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async generateWithReference(request: {
    prompt: string;
    reference_image_base64: string;
    aspect_ratio?: string;
    number_of_images?: number;
  }): Promise<{ success: boolean; images: Array<{ index: number; data: string; format: string }>; count: number }> {
    return this.request("/images/generate-with-reference", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async batchGenerateImages(request: {
    prompts: string[];
    aspect_ratio?: string;
    model?: string;
    number_of_images?: number;
  }): Promise<{
    success: boolean;
    results: Array<{ images: Array<{ index: number; data: string; format: string }>; count: number }>;
    total_prompts: number;
  }> {
    return this.request("/images/batch-generate", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  // Document Generation
  async generateDocument(request: {
    topic: string;
    length?: string;
    style?: string;
    target_audience?: string;
    include_citations?: boolean;
  }): Promise<{ success: boolean; content: string; topic: string; length: string; style: string }> {
    return this.request("/documents/generate", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async analyzeDocument(content: string): Promise<{
    success: boolean;
    analysis: {
      readability_score: number;
      main_topics: string[];
      key_points: string[];
      suggested_improvements: string[];
      target_audience: string;
      tone: string;
    };
  }> {
    return this.request("/documents/analyze", {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  }

  async summarizeDocument(content: string, length: string = "moderate"): Promise<{
    success: boolean;
    summary: string;
    length: string;
  }> {
    return this.request("/documents/summarize", {
      method: "POST",
      body: JSON.stringify({ content, length }),
    });
  }

  async expandDocument(content: string, expansion_factor: number = 1.5, focus_areas?: string[]): Promise<{
    success: boolean;
    expanded_content: string;
  }> {
    return this.request("/documents/expand", {
      method: "POST",
      body: JSON.stringify({ content, expansion_factor, focus_areas }),
    });
  }

  async translateDocument(content: string, target_language: string, preserve_formatting: boolean = true): Promise<{
    success: boolean;
    translated_content: string;
    target_language: string;
  }> {
    return this.request("/documents/translate", {
      method: "POST",
      body: JSON.stringify({ content, target_language, preserve_formatting }),
    });
  }

  async improveDocument(content: string, improvements: string[]): Promise<{
    success: boolean;
    improved_content: string;
  }> {
    return this.request("/documents/improve", {
      method: "POST",
      body: JSON.stringify({ content, improvements }),
    });
  }

  async researchDocument(topic: string, use_grounding: boolean = true): Promise<{
    success: boolean;
    content: string;
    topic: string;
  }> {
    return this.request("/documents/research", {
      method: "POST",
      body: JSON.stringify({ topic, use_grounding }),
    });
  }

  // Code Generation
  async generateCode(request: {
    requirements: string;
    language?: string;
    style?: string;
    include_tests?: boolean;
    include_comments?: boolean;
    max_complexity?: string;
  }): Promise<{ success: boolean; code: string; language: string; style: string }> {
    return this.request("/code/generate", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async reviewCode(code: string, language: string = "python"): Promise<{
    success: boolean;
    review: {
      issues: string[];
      suggestions: string[];
      security_concerns: string[];
      performance_notes: string[];
      rating: number;
    };
  }> {
    return this.request("/code/review", {
      method: "POST",
      body: JSON.stringify({ code, language }),
    });
  }

  async explainCode(code: string, detail_level: string = "detailed"): Promise<{
    success: boolean;
    explanation: string;
  }> {
    return this.request("/code/explain", {
      method: "POST",
      body: JSON.stringify({ code, detail_level }),
    });
  }

  async refactorCode(code: string, goals: string[]): Promise<{
    success: boolean;
    refactored_code: string;
  }> {
    return this.request("/code/refactor", {
      method: "POST",
      body: JSON.stringify({ code, goals }),
    });
  }

  async convertCode(code: string, source_lang: string, target_lang: string): Promise<{
    success: boolean;
    converted_code: string;
    source_lang: string;
    target_lang: string;
  }> {
    return this.request("/code/convert", {
      method: "POST",
      body: JSON.stringify({ code, source_lang, target_lang }),
    });
  }

  async generateTests(code: string, test_framework: string = "pytest"): Promise<{
    success: boolean;
    tests: Array<{ test_name: string; test_code: string; description: string }>;
    framework: string;
  }> {
    return this.request("/code/tests", {
      method: "POST",
      body: JSON.stringify({ code, test_framework }),
    });
  }

  async executeCode(code: string, timeout: number = 30): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    return_code: number;
    error?: string;
  }> {
    return this.request("/code/execute", {
      method: "POST",
      body: JSON.stringify({ code, timeout }),
    });
  }

  async validateSyntax(code: string, language: string = "python"): Promise<{
    success: boolean;
    valid: boolean;
    errors: string[];
  }> {
    return this.request("/code/validate", {
      method: "POST",
      body: JSON.stringify({ code, language }),
    });
  }

  // Research Platform
  async researchQuery(request: {
    request_type: "research" | "rag_query" | "chat";
    query?: string;
    question?: string;
    message?: string;
  }): Promise<{ success: boolean; response?: string; answer?: string }> {
    return this.request("/research/query", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  // ===== Search / knowledge tools =====
  async searchArxiv(query: string, max_results = 5): Promise<{
    success: boolean;
    results: Array<{
      title: string; authors: string[]; summary: string; url: string;
      published: string; arxiv_id: string; categories: string[];
    }>;
  }> {
    return this.request("/research/arxiv", {
      method: "POST",
      body: JSON.stringify({ query, max_results }),
    });
  }

  async searchPubmed(query: string, max_results = 5): Promise<{
    success: boolean;
    articles: Array<{
      pmid: string;
      title: string;
      authors: string[];
      abstract: string;
      journal: string;
      year: string;
      doi: string;
      url: string;
      doi_url: string;
    }>;
  }> {
    return this.request("/research/pubmed", {
      method: "POST",
      body: JSON.stringify({ query, max_results }),
    });
  }

  async searchWikipedia(query: string): Promise<{
    success: boolean;
    article: { title?: string; summary?: string; url?: string; content?: string; error?: string };
  }> {
    return this.request("/research/wikipedia", {
      method: "POST",
      body: JSON.stringify({ query }),
    });
  }

  async groundedQuery(query: string): Promise<{
    success: boolean;
    result: {
      answer?: string;
      search_queries?: string[];
      sources?: Array<{ title: string; url: string }>;
    };
  }> {
    return this.request("/research/grounded", {
      method: "POST",
      body: JSON.stringify({ query }),
    });
  }

  // ===== RAG knowledge base =====
  async ragAddDocuments(
    documents: string[],
    titles?: string[],
    sources?: string[],
  ): Promise<{ success: boolean; added: number; total: number }> {
    return this.request("/rag/documents", {
      method: "POST",
      body: JSON.stringify({ documents, titles, sources }),
    });
  }

  async ragStats(): Promise<{
    document_count: number;
    unique_sources: number;
    embedding_model: string;
    chunk_size: number;
    overlap: number;
  }> {
    return this.request("/rag/documents");
  }

  async ragClear(): Promise<{ success: boolean; document_count: number }> {
    return this.request("/rag/documents", { method: "DELETE" });
  }

  async ragUploadPdf(file: File, title?: string, source?: string): Promise<{ success: boolean; added: number; total: number }> {
    const form = new FormData();
    form.append("file", file);
    if (title)  form.append("title",  title);
    if (source) form.append("source", source);
    return this.request("/rag/pdf", { method: "POST", body: form });
  }

  async ragRetrieve(
    query: string,
    top_k = 5,
    min_score = 0,
  ): Promise<{
    success: boolean;
    results: Array<{
      id: string; text: string; title: string; source: string;
      chunk_index: number; score: number; added_at: string;
    }>;
  }> {
    return this.request("/rag/retrieve", {
      method: "POST",
      body: JSON.stringify({ query, top_k, min_score }),
    });
  }

  async ragAnswer(
    question: string,
    top_k = 5,
  ): Promise<{
    success: boolean;
    answer: string;
    sources: Array<{ index: number; title: string; source: string; score: number; snippet: string }>;
  }> {
    return this.request("/rag/answer", {
      method: "POST",
      body: JSON.stringify({ question, top_k }),
    });
  }

  // ===== CSV data completion =====
  async csvAnalyzeUpload(file: File): Promise<{ success: boolean; analysis: CsvAnalysis }> {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`${this.baseUrl}/csv/analyze`, {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new ApiError(error.detail || `HTTP ${response.status}`, response.status);
    }
    return response.json();
  }

  async csvAnalyzeText(csv_content: string): Promise<{ success: boolean; analysis: CsvAnalysis }> {
    return this.request("/csv/analyze-text", {
      method: "POST",
      body: JSON.stringify({ csv_content }),
    });
  }

  // ===== Music generation (Lyria 3) =====
  async generateMusic(
    prompt: string,
    model: "lyria-3-clip-preview" | "lyria-3-pro-preview" = "lyria-3-clip-preview",
    output_format: "mp3" | "wav" = "mp3",
    images?: MusicImageInput[],
  ): Promise<{
    success: boolean;
    audio_base64: string;
    mime_type: string;
    lyrics: string;
    model_used: string;
  }> {
    return this.request("/music/generate", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        model,
        output_format,
        ...(images && images.length > 0 ? { images } : {}),
      }),
    });
  }

  // ===== Lyria RealTime (interactive streaming) =====
  async getMusicRealtimeMetadata(): Promise<MusicRealtimeMetadata> {
    return this.request<MusicRealtimeMetadata>("/music/realtime/metadata");
  }

  /** WebSocket URL for the Lyria RealTime bridge (http(s) -> ws(s)), with BYOK key. */
  getMusicRealtimeWsUrl(): string {
    const base = this.baseUrl.replace(/^http/, "ws");
    return `${base}/music/realtime/ws?key=${encodeURIComponent(getApiKey())}`;
  }

  /**
   * WebSocket URL for the Gemini Live voice bridge (http(s) -> ws(s)).
   * BYOK: the key rides as a query param (browsers can't set WS headers).
   */
  getLiveWsUrl(opts: { voice?: string; system?: string } = {}): string {
    const base = this.baseUrl.replace(/^http/, "ws");
    const params = new URLSearchParams({ key: getApiKey() });
    if (opts.voice) params.set("voice", opts.voice);
    if (opts.system) params.set("system", opts.system);
    return `${base}/speech/live/ws?${params.toString()}`;
  }

  /** Static metadata for the Gemini Live UI (model + voices). */
  async getLiveMetadata(): Promise<{
    success: boolean;
    model: string;
    default_voice: string;
    voices: Array<{ name: string; description: string }>;
    input_sample_rate: number;
    output_sample_rate: number;
  }> {
    return this.request("/speech/live/metadata");
  }

  // ===== Speech generation (Gemini TTS) =====
  async listVoices(): Promise<{
    success: boolean;
    voices: Array<{ name: string; description: string }>;
    models: string[];
  }> {
    return this.request("/speech/voices", { method: "GET" });
  }

  async generateSpeech(request: {
    prompt: string;
    voice?: string;
    model?: string;
  }): Promise<{
    success: boolean;
    audio_base64: string;
    mime_type: string;
    voice: string;
    model_used: string;
  }> {
    return this.request("/speech/generate", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async generateMultiSpeakerSpeech(request: {
    prompt: string;
    speakers: Array<{ speaker: string; voice: string }>;
    model?: string;
  }): Promise<{
    success: boolean;
    audio_base64: string;
    mime_type: string;
    speakers: Array<{ speaker: string; voice: string }>;
    model_used: string;
  }> {
    return this.request("/speech/generate-multi", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  // ===== Standalone orchestrators =====
  async runAgenticOrchestrator(task: string): Promise<{ success: boolean; result: string }> {
    return this.request("/orchestrators/agentic", {
      method: "POST",
      body: JSON.stringify({ task }),
    });
  }

  /** SSE stream of partial chunks. Caller is responsible for closing/aborting. */
  streamAgenticOrchestrator(task: string, signal?: AbortSignal): Promise<Response> {
    return fetch(`${this.baseUrl}/orchestrators/agentic/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task }),
      signal,
    });
  }

  async assistantChat(message: string): Promise<{ success: boolean; response: string }> {
    return this.request("/orchestrators/assistant/chat", {
      method: "POST",
      body: JSON.stringify({ message }),
    });
  }

  async assistantHistory(): Promise<{ history: Array<{ role: string; content: string }> }> {
    return this.request("/orchestrators/assistant/history");
  }

  async assistantReset(): Promise<{ success: boolean }> {
    return this.request("/orchestrators/assistant/reset", { method: "POST" });
  }

  async scoutPlanBuild(request: {
    user_request: string;
    codebase_root?: string;
    documentation_urls?: string[];
  }): Promise<{
    success: boolean;
    scout_output: unknown;
    execution_plan: unknown;
    build_results: unknown;
    elapsed_time: number;
  }> {
    return this.request("/orchestrators/scout-plan-build", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }
}

export interface CsvAnalysis {
  missing_cells: Array<{
    row: number;
    column: number;
    question: string;
    context: string;
  }>;
  total_missing: number;
  completion_rate: number;
}

export const apiClient = new ApiClient();

