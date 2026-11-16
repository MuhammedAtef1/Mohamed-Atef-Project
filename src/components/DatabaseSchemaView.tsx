import React, { useState } from 'react';
import { Check, Copy, Database, KeyRound, Link2 } from 'lucide-react';
import {
  DATABASE_SCHEMA_TABLES,
  DOCKER_COMPOSE_YAML,
  POSTGRES_DDL_SQL,
} from '../data/blueprintData';

export function DatabaseSchemaView() {
  const [selectedTable, setSelectedTable] = useState<string>('events');
  const [codeTab, setCodeTab] = useState<'sql' | 'docker'>('sql');
  const [copied, setCopied] = useState(false);

  const activeTable =
    DATABASE_SCHEMA_TABLES.find((t) => t.tableName === selectedTable) ||
    DATABASE_SCHEMA_TABLES[0];

  const activeSnippet = codeTab === 'sql' ? POSTGRES_DDL_SQL : DOCKER_COMPOSE_YAML;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(activeSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8">
        <div className="max-w-3xl space-y-2">
          <p className="text-xs font-medium text-blue-700 tracking-wide">
            PostgreSQL 16 Relational Model · Dockerized Persistence
          </p>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">
            Database Schema, Constraints & Entity Relationships
          </h1>
          <p className="text-sm lg:text-base text-slate-600 leading-relaxed">
            Normalized relational schema enforcing seat-capacity invariants directly at the storage layer via CHECK constraints, foreign-key referential integrity, and partial FIFO waitlist indexes.
          </p>
        </div>

        {/* Relationship Summary Strip */}
        <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-4 gap-4">
          {DATABASE_SCHEMA_TABLES.map((tbl) => {
            const isSelected = tbl.tableName === selectedTable;
            return (
              <button
                key={tbl.tableName}
                type="button"
                onClick={() => setSelectedTable(tbl.tableName)}
                className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-blue-700 bg-blue-50/40'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-bold text-slate-900">
                    {tbl.tableName}
                  </span>
                  <span className="font-mono text-xs text-slate-500 tabular-nums">
                    {tbl.columns.length} cols
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-slate-600 line-clamp-2">{tbl.purpose}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Active Table Column Breakdown */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-700" />
              <h2 className="text-lg font-bold font-mono text-slate-900">
                TABLE {activeTable.tableName}
              </h2>
            </div>
            <p className="text-xs text-slate-600">{activeTable.purpose}</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            {activeTable.relationships.map((rel) => (
              <span key={rel} className="inline-flex items-center gap-1 font-mono">
                <Link2 className="w-3.5 h-3.5 text-slate-400" />
                {rel}
              </span>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-6">Column</th>
                <th className="py-3 px-4">PostgreSQL Type</th>
                <th className="py-3 px-4">Constraints & Keys</th>
                <th className="py-3 px-6">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {activeTable.columns.map((col) => (
                <tr key={col.name} className="hover:bg-slate-50/60">
                  <td className="py-3 px-6 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      {col.constraints.includes('PRIMARY KEY') && (
                        <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                      )}
                      {col.name}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-blue-800 whitespace-nowrap">
                    {col.type}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-700">
                    {col.constraints}
                  </td>
                  <td className="py-3 px-6 text-xs text-slate-600">{col.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 space-y-1.5">
          <p className="text-xs font-semibold text-slate-700">Indexes & Invariant Guards</p>
          {activeTable.indexes.map((idxSql) => (
            <pre key={idxSql} className="text-xs font-mono text-slate-700 overflow-x-auto">
              {idxSql}
            </pre>
          ))}
        </div>
      </section>

      {/* Copyable DDL & Docker Compose */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 w-fit">
            <button
              type="button"
              onClick={() => setCodeTab('sql')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                codeTab === 'sql'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              schema.sql (PostgreSQL 16)
            </button>
            <button
              type="button"
              onClick={() => setCodeTab('docker')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                codeTab === 'docker'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              docker-compose.yml
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition-colors w-fit cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy File'}
          </button>
        </div>

        <pre className="p-6 text-xs font-mono text-slate-100 bg-slate-900 overflow-x-auto leading-relaxed">
          {activeSnippet}
        </pre>
      </section>
    </div>
  );
}
