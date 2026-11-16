import React, { useState } from 'react';
import { GitBranch, Lock, Server, ShieldCheck } from 'lucide-react';
import { SDLC_PIPELINE_STAGES } from '../data/blueprintData';

type TrafficTier = 'startup' | 'growth' | 'spike';

const TRAFFIC_TIERS: Record<
  TrafficTier,
  {
    label: string;
    rpm: string;
    recommendation: string;
    apiLayer: string;
    dbLayer: string;
    cachingLocks: string;
  }
> = {
  startup: {
    label: 'Baseline (< 1k RPM)',
    rpm: '50 – 1,000 req/min',
    recommendation: 'Vertical scaling first for simplicity + single-region managed PostgreSQL.',
    apiLayer: '2 stateless FastAPI Uvicorn workers behind Nginx/Cloud Load Balancer.',
    dbLayer: 'Vertical PostgreSQL (2 vCPU, 8 GB RAM) handles row-level locks comfortably.',
    cachingLocks: 'PostgreSQL SELECT ... FOR UPDATE alone guarantees zero overbooking.',
  },
  growth: {
    label: 'Growth (10k RPM)',
    rpm: '2,000 – 15,000 req/min',
    recommendation: 'Horizontal API auto-scaling + Read Replicas + PgBouncer connection pooling.',
    apiLayer: '4–10 horizontally scaled FastAPI containers across 2 availability zones.',
    dbLayer: 'Primary PostgreSQL (vertical scale + PgBouncer) for writes; 2 Read Replicas for GET /events browsing.',
    cachingLocks: 'Redis caches public GET /events catalog (5s TTL) to shield DB from read storms.',
  },
  spike: {
    label: 'On-Sale Spike (100k+ RPM)',
    rpm: '50,000 – 150,000 req/min',
    recommendation: 'Hybrid: Horizontal stateless API + Redis atomic seat counters + async queue.',
    apiLayer: 'Auto-scaling Kubernetes pods (HPA on CPU & RPS) with rate-limiting at API Gateway.',
    dbLayer: 'Partitioned tickets table by event_id/month + PgBouncer transaction pooling on high-IOPS NVMe Primary.',
    cachingLocks: 'Redis Lua DECRBY pre-filters sold-out requests in <2ms before hitting PostgreSQL row locks; Celery/SQS processes email & waitlist notifications asynchronously.',
  },
};

const FASTAPI_RBAC_SNIPPET = `from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> User:
    payload = decode_jwt(token)  # Raises 401 Unauthorized on expiry/tamper
    user = await db.get(User, payload["sub"])
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user")
    return user

def require_role(required: UserRole):
    async def role_guard(user: User = Depends(get_current_user)) -> User:
        if user.role != required:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Requires {required.value}")
        return user
    return role_guard

@router.post("/api/v1/tickets", status_code=201)
async def book_ticket(body: BookTicketIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async with db.begin():
        # Row-level pessimistic lock prevents concurrent overbooking
        result = await db.execute(select(Event).where(Event.id == body.event_id).with_for_update())
        event = result.scalar_one_or_none()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        if event.capacity - event.booked_seats < body.quantity:
            raise HTTPException(status_code=409, detail="Event sold out or insufficient seats")
        if not charge_payment_gateway(user, event.price_cents * body.quantity):
            raise HTTPException(status_code=402, detail="Payment required / declined")
        event.booked_seats += body.quantity
        ticket = Ticket(event_id=event.id, user_id=user.id, quantity=body.quantity, status="CONFIRMED")
        db.add(ticket)
        return ticket`;

export function ArchitectureSdlcView() {
  const [tier, setTier] = useState<TrafficTier>('growth');
  const activeTier = TRAFFIC_TIERS[tier];

  return (
    <div className="space-y-8">
      {/* Intro */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8">
        <div className="max-w-3xl space-y-2">
          <p className="text-xs font-medium text-blue-700 tracking-wide">
            Security · Scalability · Software Development Lifecycle
          </p>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">
            Authentication, RBAC, Scaling Strategy & CI/CD Pipeline
          </h1>
          <p className="text-sm lg:text-base text-slate-600 leading-relaxed">
            Production architecture for FastAPI, React, and Dockerized PostgreSQL — covering stateless JWT verification, role-based access control, horizontal vs. vertical scaling tradeoffs, and the Dev → Test → Prod release pipeline.
          </p>
        </div>
      </section>

      {/* Security: Authentication vs Authorization */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <Lock className="w-4 h-4 text-blue-700" />
              <h2 className="text-base font-bold">Authentication (Who are you?)</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Passwords are hashed with <strong>Argon2id / bcrypt</strong> using per-user salts. Upon login (<code className="font-mono">POST /api/v1/auth/login</code>), FastAPI issues a short-lived signed <strong>JWT Access Token</strong> (15–30 min TTL) containing <code className="font-mono">sub</code>, <code className="font-mono">role</code>, and <code className="font-mono">exp</code> claims, plus an HttpOnly rotating refresh cookie.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <h2 className="text-base font-bold">Authorization (What can you do?)</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Enforced at two layers via FastAPI dependency injection:
            </p>
            <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4">
              <li>
                <strong>Role Guard (<code className="font-mono">require_role("ADMIN")</code>):</strong> Restricts event creation, capacity edits, and user listings; returns <code className="font-mono">403 Forbidden</code> to Attendees.
              </li>
              <li>
                <strong>Resource Ownership Check:</strong> Verifies <code className="font-mono">ticket.user_id == current_user.id</code> before cancelling or viewing a ticket unless caller is Admin.
              </li>
            </ul>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-800">
              FastAPI RBAC Dependency + Atomic PostgreSQL Row Lock
            </h3>
            <span className="font-mono text-xs text-slate-500">app/api/tickets.py</span>
          </div>
          <pre className="p-5 text-xs font-mono bg-slate-900 text-slate-100 overflow-x-auto leading-relaxed">
            {FASTAPI_RBAC_SNIPPET}
          </pre>
        </div>
      </section>

      {/* Scalability Strategy: Horizontal vs Vertical */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-700" />
              <h2 className="text-lg font-bold text-slate-900">
                Scalability Strategy: Horizontal vs. Vertical Scaling
              </h2>
            </div>
            <p className="text-xs text-slate-600">
              Select an expected traffic tier to inspect the recommended scaling topology across API, Database, and Cache layers.
            </p>
          </div>

          <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200 w-fit">
            {(Object.keys(TRAFFIC_TIERS) as TrafficTier[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTier(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tier === key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {TRAFFIC_TIERS[key].label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-900">{activeTier.recommendation}</span>
          <span className="font-mono text-xs text-blue-700 tabular-nums shrink-0">
            {activeTier.rpm}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-slate-200 rounded-xl p-5 space-y-2">
            <p className="text-xs font-semibold text-slate-900">
              API Compute (Horizontal)
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">{activeTier.apiLayer}</p>
          </div>
          <div className="border border-slate-200 rounded-xl p-5 space-y-2">
            <p className="text-xs font-semibold text-slate-900">
              PostgreSQL (Vertical + Replicas)
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">{activeTier.dbLayer}</p>
          </div>
          <div className="border border-slate-200 rounded-xl p-5 space-y-2">
            <p className="text-xs font-semibold text-slate-900">
              Concurrency & Caching
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">{activeTier.cachingLocks}</p>
          </div>
        </div>
      </section>

      {/* SDLC Pipeline: Dev -> Test -> Prod */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-blue-700" />
          <h2 className="text-lg font-bold text-slate-900">
            Development Pipeline (Dev → Test → Prod)
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {SDLC_PIPELINE_STAGES.map((stage) => (
            <article
              key={stage.stage}
              className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-5"
            >
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-blue-700">{stage.environment}</p>
                  <h3 className="text-base font-bold text-slate-900">{stage.stage}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{stage.objective}</p>
                </div>

                <div className="text-xs text-slate-500">
                  {stage.tooling.join(' · ')}
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-100">
                  {stage.steps.map((step) => (
                    <div key={step.title} className="space-y-1">
                      <p className="text-xs font-semibold text-slate-800">{step.title}</p>
                      <p className="text-xs text-slate-600 leading-relaxed">{step.detail}</p>
                      <pre className="px-2.5 py-1.5 text-[11px] font-mono bg-slate-900 text-slate-100 rounded-md overflow-x-auto">
                        {step.command}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 text-xs text-slate-700">
                <span className="font-semibold text-slate-900">Exit Gate: </span>
                {stage.exitGate}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
