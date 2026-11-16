import React, { useState } from 'react';
import { Check, Copy, Play, ShieldAlert } from 'lucide-react';
import { API_ENDPOINTS, ApiEndpointSpec } from '../data/blueprintData';
import { UserProfile } from '../types/eventApp';

interface ApiExplorerViewProps {
  accessToken: string | null;
  currentUser: UserProfile | null;
  onDataMutated: () => Promise<void>;
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-blue-700',
  POST: 'text-emerald-700',
  PATCH: 'text-amber-700',
  DELETE: 'text-red-700',
};

export function ApiExplorerView({
  accessToken,
  currentUser,
  onDataMutated,
}: ApiExplorerViewProps) {
  const [resourceFilter, setResourceFilter] = useState<string>('All');
  const [selectedId, setSelectedId] = useState<string>(API_ENDPOINTS[4].id);
  const [includeAuth, setIncludeAuth] = useState<boolean>(true);
  const [customBody, setCustomBody] = useState<string>(
    API_ENDPOINTS[4].requestExample || ''
  );
  const [customPath, setCustomPath] = useState<string>(API_ENDPOINTS[4].livePath);
  const [running, setRunning] = useState(false);
  const [liveResult, setLiveResult] = useState<{
    status: number;
    statusText: string;
    durationMs: number;
    body: string;
  } | null>(null);
  const [copiedSpec, setCopiedSpec] = useState(false);

  const selectedEndpoint: ApiEndpointSpec =
    API_ENDPOINTS.find((ep) => ep.id === selectedId) || API_ENDPOINTS[0];

  const filteredEndpoints =
    resourceFilter === 'All'
      ? API_ENDPOINTS
      : API_ENDPOINTS.filter((ep) => ep.resource === resourceFilter);

  function selectEndpoint(ep: ApiEndpointSpec) {
    setSelectedId(ep.id);
    setCustomBody(ep.requestExample || '');
    setCustomPath(ep.livePath);
    setLiveResult(null);
  }

  async function executeLiveRequest() {
    setRunning(true);
    const started = performance.now();
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (includeAuth && accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
      const init: RequestInit = {
        method: selectedEndpoint.method,
        headers,
      };
      if (selectedEndpoint.method !== 'GET' && customBody.trim()) {
        init.body = customBody;
      }
      const res = await fetch(customPath, init);
      const text = await res.text();
      let formatted = text;
      try {
        formatted = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // leave plain text if non-JSON
      }
      setLiveResult({
        status: res.status,
        statusText: res.statusText,
        durationMs: Math.round(performance.now() - started),
        body: formatted,
      });
      if (selectedEndpoint.method !== 'GET' && res.ok) {
        await onDataMutated();
      }
    } catch (err) {
      setLiveResult({
        status: 0,
        statusText: 'Network Error',
        durationMs: Math.round(performance.now() - started),
        body: String(err),
      });
    } finally {
      setRunning(false);
    }
  }

  async function copyOpenApiSummary() {
    const openapi = {
      openapi: '3.1.0',
      info: {
        title: 'EventLedger Booking API',
        version: '1.0.0',
      },
      paths: Object.fromEntries(
        API_ENDPOINTS.map((ep) => [
          `${ep.method} ${ep.path}`,
          {
            summary: ep.summary,
            securityRole: ep.role,
            responses: Object.fromEntries(
              ep.statusCodes.map((s) => [String(s.code), { description: s.condition }])
            ),
          },
        ])
      ),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(openapi, null, 2));
      setCopiedSpec(true);
      setTimeout(() => setCopiedSpec(false), 1800);
    } catch {
      setCopiedSpec(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header Summary */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-medium text-blue-700 tracking-wide">
            Swagger / OpenAPI 3.1 · Live REST Contract Runner
          </p>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">
            RESTful CRUD API Documentation & Live Tester
          </h1>
          <p className="text-sm lg:text-base text-slate-600 leading-relaxed">
            Inspect every endpoint for Users, Events, and Tickets, including role enforcement and HTTP status semantics. Execute requests directly against the running backend using your active JWT or unauthenticated mode.
          </p>
        </div>

        <button
          type="button"
          onClick={copyOpenApiSummary}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition-colors w-fit shrink-0 cursor-pointer"
        >
          {copiedSpec ? (
            <Check className="w-4 h-4 text-emerald-600" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
          {copiedSpec ? 'Copied OpenAPI JSON' : 'Copy OpenAPI Spec'}
        </button>
      </section>

      {/* Master-Detail API Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Endpoint Directory (Left) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-1 overflow-x-auto">
              {['All', 'Auth & Users', 'Events', 'Tickets'].map((res) => (
                <button
                  key={res}
                  type="button"
                  onClick={() => setResourceFilter(res)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    resourceFilter === res
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {res}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredEndpoints.map((ep) => {
              const active = ep.id === selectedEndpoint.id;
              return (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => selectEndpoint(ep)}
                  className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                    active ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`font-mono text-xs font-bold w-14 shrink-0 ${
                          METHOD_COLORS[ep.method] || 'text-slate-800'
                        }`}
                      >
                        {ep.method}
                      </span>
                      <span className="font-mono text-xs font-medium text-slate-900 truncate">
                        {ep.path}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 whitespace-nowrap shrink-0">
                      {ep.role}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 pl-16 line-clamp-1">
                    {ep.summary}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Endpoint Inspector & Live Runner (Right) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="space-y-2 pb-5 border-b border-slate-100">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{selectedEndpoint.resource}</span>
              <span aria-hidden="true">·</span>
              <span>Access: {selectedEndpoint.role}</span>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`font-mono text-sm font-bold ${
                  METHOD_COLORS[selectedEndpoint.method]
                }`}
              >
                {selectedEndpoint.method}
              </span>
              <h2 className="font-mono text-base font-bold text-slate-900 break-all">
                {selectedEndpoint.path}
              </h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              {selectedEndpoint.description}
            </p>
          </div>

          {/* Expected HTTP Status Codes */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-700">
              Expected HTTP Status Codes
            </h3>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
              {selectedEndpoint.statusCodes.map((sc) => (
                <div
                  key={sc.code}
                  className="px-4 py-2.5 flex items-baseline justify-between gap-4 text-xs"
                >
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span
                      className={`font-mono font-bold tabular-nums ${
                        sc.code >= 400 ? 'text-red-700' : 'text-emerald-700'
                      }`}
                    >
                      {sc.code}
                    </span>
                    <span className="font-semibold text-slate-800">{sc.label}</span>
                  </div>
                  <span className="text-slate-600 text-right">{sc.condition}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Live Execution Sandbox */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-xs font-semibold text-slate-700">
                Execute Against Running API
              </h3>
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeAuth}
                  onChange={(e) => setIncludeAuth(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <span>
                  Attach Bearer JWT (
                  {currentUser ? `${currentUser.role}` : 'none'}) — uncheck to test 401
                </span>
              </label>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                aria-label="Live request path"
                className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="button"
                onClick={executeLiveRequest}
                disabled={running}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-700 text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                {running ? 'Sending...' : 'Send Live Request'}
              </button>
            </div>

            {selectedEndpoint.method !== 'GET' && (
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-600">
                  JSON Request Body
                </label>
                <textarea
                  rows={5}
                  value={customBody}
                  onChange={(e) => setCustomBody(e.target.value)}
                  className="w-full p-3 text-xs font-mono bg-slate-900 text-slate-100 rounded-lg border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            )}

            {liveResult ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span
                    className={`font-bold tabular-nums ${
                      liveResult.status >= 400 || liveResult.status === 0
                        ? 'text-red-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    HTTP {liveResult.status} {liveResult.statusText}
                  </span>
                  <span className="text-slate-500 tabular-nums">
                    {liveResult.durationMs} ms
                  </span>
                </div>
                <pre className="p-4 text-xs font-mono bg-slate-900 text-slate-100 rounded-lg overflow-x-auto max-h-72 leading-relaxed">
                  {liveResult.body}
                </pre>
              </div>
            ) : (
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-slate-500">
                  Example 200/201 Response Payload
                </span>
                <pre className="p-4 text-xs font-mono bg-slate-50 text-slate-800 border border-slate-200 rounded-lg overflow-x-auto leading-relaxed">
                  {selectedEndpoint.responseExample}
                </pre>
              </div>
            )}

            {!includeAuth && (
              <p className="inline-flex items-center gap-1.5 text-xs text-amber-800">
                <ShieldAlert className="w-3.5 h-3.5" />
                Authorization header omitted — protected routes will return 401 Unauthorized.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
