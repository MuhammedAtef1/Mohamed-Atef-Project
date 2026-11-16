import { useCallback, useEffect, useState } from 'react';
import {
  ApiAuditEntry,
  EventRecord,
  TicketRecord,
  UserProfile,
  UserRole,
} from './types/eventApp';
import { BookingDeskView } from './components/BookingDeskView';
import { DatabaseSchemaView } from './components/DatabaseSchemaView';
import { ApiExplorerView } from './components/ApiExplorerView';
import { ArchitectureSdlcView } from './components/ArchitectureSdlcView';

type ActiveView = 'booking' | 'schema' | 'api' | 'architecture';

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('booking');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [simulatePaymentFailure, setSimulatePaymentFailure] = useState<boolean>(false);
  const [lastAudit, setLastAudit] = useState<ApiAuditEntry | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);

  const recordAudit = useCallback(
    (
      method: ApiAuditEntry['method'],
      path: string,
      status: number,
      statusText: string,
      durationMs: number,
      summary: string,
      roleLabel: string
    ) => {
      setLastAudit({
        id: `${Date.now()}`,
        method,
        path,
        status,
        statusText,
        durationMs,
        summary,
        role: roleLabel,
        timestamp: new Date().toISOString(),
      });
    },
    []
  );

  const fetchCatalogAndTickets = useCallback(
    async (tokenOverride?: string | null, userOverride?: UserProfile | null) => {
      const token = tokenOverride !== undefined ? tokenOverride : accessToken;
      const usr = userOverride !== undefined ? userOverride : currentUser;

      const evRes = await fetch('/api/v1/events');
      if (evRes.ok) {
        const evData = (await evRes.json()) as { items: EventRecord[] };
        setEvents(evData.items);
      }

      if (token) {
        const scopeQuery = usr?.role === UserRole.ADMIN ? '?scope=all' : '';
        const tktRes = await fetch(`/api/v1/tickets${scopeQuery}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (tktRes.ok) {
          const tktData = (await tktRes.json()) as { items: TicketRecord[] };
          setTickets(tktData.items);
        }
      }
    },
    [accessToken, currentUser]
  );

  const loginDemoUser = useCallback(
    async (demoUserId: string, silent = false) => {
      const started = performance.now();
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demoUserId }),
      });
      const data = await res.json();
      if (res.ok) {
        setAccessToken(data.access_token);
        setCurrentUser(data.user);
        await fetchCatalogAndTickets(data.access_token, data.user);
        if (!silent) {
          recordAudit(
            'POST',
            '/api/v1/auth/login',
            res.status,
            res.statusText,
            Math.round(performance.now() - started),
            `Issued JWT Bearer token for ${data.user.fullName} (${data.user.role}).`,
            data.user.role
          );
        }
      }
    },
    [fetchCatalogAndTickets, recordAudit]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      await loginDemoUser('usr_att_01', true);
      if (mounted) {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleBookTicket(eventId: string, quantity: number) {
    if (!accessToken || !currentUser) return;
    const started = performance.now();
    const res = await fetch('/api/v1/tickets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        eventId,
        quantity,
        simulatePaymentFailure,
      }),
    });
    const data = await res.json();
    const elapsed = Math.round(performance.now() - started);

    if (res.ok) {
      await fetchCatalogAndTickets();
      recordAudit(
        'POST',
        '/api/v1/tickets',
        res.status,
        res.statusText,
        elapsed,
        `Booked ${quantity} seat(s) (${data.ticket.bookingCode}). Remaining seats: ${data.event.availableSeats}.`,
        currentUser.role
      );
    } else {
      recordAudit(
        'POST',
        '/api/v1/tickets',
        res.status,
        res.statusText,
        elapsed,
        data.detail || 'Booking rejected.',
        currentUser.role
      );
    }
  }

  async function handleJoinWaitlist(eventId: string) {
    if (!accessToken || !currentUser) return;
    const started = performance.now();
    const path = `/api/v1/events/${eventId}/waitlist`;
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = await res.json();
    const elapsed = Math.round(performance.now() - started);
    if (res.ok) {
      await fetchCatalogAndTickets();
      recordAudit(
        'POST',
        path,
        res.status,
        res.statusText,
        elapsed,
        `Added ${currentUser.fullName} to FIFO waitlist for ${data.event.title}.`,
        currentUser.role
      );
    } else {
      recordAudit(
        'POST',
        path,
        res.status,
        res.statusText,
        elapsed,
        data.detail || 'Could not join waitlist.',
        currentUser.role
      );
    }
  }

  async function handleCancelTicket(ticketId: string) {
    if (!accessToken || !currentUser) return;
    const started = performance.now();
    const path = `/api/v1/tickets/${ticketId}/cancel`;
    const res = await fetch(path, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = await res.json();
    const elapsed = Math.round(performance.now() - started);

    if (res.ok) {
      await fetchCatalogAndTickets();
      const promoNote = data.promotedWaitlist
        ? ` Auto-promoted waitlist attendee ${data.promotedWaitlist.attendeeName} (${data.promotedWaitlist.ticketCode}).`
        : '';
      recordAudit(
        'PATCH',
        path,
        res.status,
        res.statusText,
        elapsed,
        `Ticket ${data.ticket.bookingCode} cancelled and seats released.${promoNote}`,
        currentUser.role
      );
    } else {
      recordAudit(
        'PATCH',
        path,
        res.status,
        res.statusText,
        elapsed,
        data.detail || 'Cancellation rejected.',
        currentUser.role
      );
    }
  }

  async function handleCreateEvent(payload: {
    title: string;
    category: string;
    venue: string;
    startsAt: string;
    priceCents: number;
    capacity: number;
    description: string;
  }): Promise<boolean> {
    if (!accessToken || !currentUser) return false;
    const started = performance.now();
    const res = await fetch('/api/v1/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    const elapsed = Math.round(performance.now() - started);

    if (res.ok) {
      await fetchCatalogAndTickets();
      recordAudit(
        'POST',
        '/api/v1/events',
        res.status,
        res.statusText,
        elapsed,
        `Published event "${data.title}" with capacity ${data.capacity}.`,
        currentUser.role
      );
      return true;
    }

    recordAudit(
      'POST',
      '/api/v1/events',
      res.status,
      res.statusText,
      elapsed,
      data.detail || 'Event creation denied.',
      currentUser.role
    );
    return false;
  }

  async function handleUpdateCapacity(eventId: string, capacity: number): Promise<boolean> {
    if (!accessToken || !currentUser) return false;
    const started = performance.now();
    const path = `/api/v1/events/${eventId}`;
    const res = await fetch(path, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ capacity }),
    });
    const data = await res.json();
    const elapsed = Math.round(performance.now() - started);

    if (res.ok) {
      await fetchCatalogAndTickets();
      recordAudit(
        'PATCH',
        path,
        res.status,
        res.statusText,
        elapsed,
        `Updated capacity for "${data.title}" to ${data.capacity} seats.`,
        currentUser.role
      );
      return true;
    }

    recordAudit(
      'PATCH',
      path,
      res.status,
      res.statusText,
      elapsed,
      data.detail || 'Capacity update rejected.',
      currentUser.role
    );
    return false;
  }

  async function handleDeleteEvent(eventId: string) {
    if (!accessToken || !currentUser) return;
    const started = performance.now();
    const path = `/api/v1/events/${eventId}`;
    const res = await fetch(path, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = await res.json();
    const elapsed = Math.round(performance.now() - started);
    if (res.ok) {
      await fetchCatalogAndTickets();
      recordAudit(
        'DELETE',
        path,
        res.status,
        res.statusText,
        elapsed,
        `Deleted event "${data.title}".`,
        currentUser.role
      );
    } else {
      recordAudit(
        'DELETE',
        path,
        res.status,
        res.statusText,
        elapsed,
        data.detail || 'Event deletion failed.',
        currentUser.role
      );
    }
  }

  const navItems: { id: ActiveView; label: string }[] = [
    { id: 'booking', label: 'Booking Desk' },
    { id: 'schema', label: 'Database Schema' },
    { id: 'api', label: 'API Explorer' },
    { id: 'architecture', label: 'Architecture' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line brand wordmark */}
          <button
            type="button"
            onClick={() => setActiveView('booking')}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            EventLedger
          </button>

          {/* Zone 2: 4 concise single-line text nav links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium"
          >
            {navItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'border-blue-700 text-slate-900 font-semibold'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveView('booking');
                setCreateModalOpen(true);
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Create Event
            </button>
          </div>
        </div>

        {/* Mobile navigation row */}
        <div className="md:hidden border-t border-slate-100 px-6 py-2 flex items-center gap-4 overflow-x-auto">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={`py-1.5 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive ? 'text-blue-700 font-semibold' : 'text-slate-600'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {activeView === 'booking' && (
          <BookingDeskView
            currentUser={currentUser}
            events={events}
            tickets={tickets}
            loading={loading}
            simulatePaymentFailure={simulatePaymentFailure}
            onTogglePaymentFailure={setSimulatePaymentFailure}
            onSwitchDemoUser={(id) => loginDemoUser(id, false)}
            onBookTicket={handleBookTicket}
            onJoinWaitlist={handleJoinWaitlist}
            onCancelTicket={handleCancelTicket}
            onCreateEvent={handleCreateEvent}
            onUpdateCapacity={handleUpdateCapacity}
            onDeleteEvent={handleDeleteEvent}
            lastAudit={lastAudit}
            createModalOpen={createModalOpen}
            onSetCreateModalOpen={setCreateModalOpen}
          />
        )}

        {activeView === 'schema' && <DatabaseSchemaView />}

        {activeView === 'api' && (
          <ApiExplorerView
            accessToken={accessToken}
            currentUser={currentUser}
            onDataMutated={() => fetchCatalogAndTickets()}
          />
        )}

        {activeView === 'architecture' && <ArchitectureSdlcView />}
      </main>

      <footer className="bg-white border-t border-slate-200 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
          <span>EventLedger — Event-Booking System Design & Reference Implementation</span>
          <span>React · FastAPI Architecture · Docker PostgreSQL 16</span>
        </div>
      </footer>
    </div>
  );
}
