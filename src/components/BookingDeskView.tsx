import React, { useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  CreditCard,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  Ticket,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  ApiAuditEntry,
  EventRecord,
  EventStatus,
  TicketRecord,
  TicketStatus,
  UserProfile,
  UserRole,
} from '../types/eventApp';

interface BookingDeskViewProps {
  currentUser: UserProfile | null;
  events: EventRecord[];
  tickets: TicketRecord[];
  loading: boolean;
  simulatePaymentFailure: boolean;
  onTogglePaymentFailure: (next: boolean) => void;
  onSwitchDemoUser: (demoUserId: string) => Promise<void>;
  onBookTicket: (eventId: string, quantity: number) => Promise<void>;
  onJoinWaitlist: (eventId: string) => Promise<void>;
  onCancelTicket: (ticketId: string) => Promise<void>;
  onCreateEvent: (payload: {
    title: string;
    category: string;
    venue: string;
    startsAt: string;
    priceCents: number;
    capacity: number;
    description: string;
  }) => Promise<boolean>;
  onUpdateCapacity: (eventId: string, capacity: number) => Promise<boolean>;
  onDeleteEvent: (eventId: string) => Promise<void>;
  lastAudit: ApiAuditEntry | null;
  createModalOpen: boolean;
  onSetCreateModalOpen: (open: boolean) => void;
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function EventImage({ src, alt, category }: { src: string; alt: string; category: string }) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div className="w-full h-full bg-slate-100 flex flex-col items-center justify-center p-6 text-center">
        <Calendar className="w-7 h-7 text-slate-400 mb-2" />
        <span className="text-xs font-medium text-slate-500">{category}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
    />
  );
}

export function BookingDeskView({
  currentUser,
  events,
  tickets,
  loading,
  simulatePaymentFailure,
  onTogglePaymentFailure,
  onSwitchDemoUser,
  onBookTicket,
  onJoinWaitlist,
  onCancelTicket,
  onCreateEvent,
  onUpdateCapacity,
  onDeleteEvent,
  lastAudit,
  createModalOpen,
  onSetCreateModalOpen,
}: BookingDeskViewProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null);
  const [editCapacityInput, setEditCapacityInput] = useState<string>('');

  // Create Event form state
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Engineering');
  const [newVenue, setNewVenue] = useState('');
  const [newDate, setNewDate] = useState('2027-02-20T18:00');
  const [newPrice, setNewPrice] = useState('120');
  const [newCapacity, setNewCapacity] = useState('45');
  const [newDescription, setNewDescription] = useState('');
  const [submittingCreate, setSubmittingCreate] = useState(false);

  const categories = ['All', 'Engineering', 'Workshop', 'Culture', 'Design'];

  const filteredEvents = events.filter((ev) => {
    const matchesCat =
      categoryFilter === 'All' || ev.category.toLowerCase() === categoryFilter.toLowerCase();
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      ev.title.toLowerCase().includes(q) ||
      ev.venue.toLowerCase().includes(q) ||
      ev.category.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  const totalRemainingSeats = events.reduce((acc, ev) => acc + ev.availableSeats, 0);
  const confirmedTicketsCount = tickets.filter((t) => t.status === TicketStatus.CONFIRMED).length;
  const totalWaitlist = events.reduce((acc, ev) => acc + ev.waitlistCount, 0);

  const isAdmin = currentUser?.role === UserRole.ADMIN;

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingCreate(true);
    const ok = await onCreateEvent({
      title: newTitle,
      category: newCategory,
      venue: newVenue,
      startsAt: new Date(newDate).toISOString(),
      priceCents: Math.round(Number(newPrice || 0) * 100),
      capacity: Number(newCapacity || 1),
      description: newDescription,
    });
    setSubmittingCreate(false);
    if (ok) {
      setNewTitle('');
      setNewVenue('');
      setNewDescription('');
      onSetCreateModalOpen(false);
    }
  }

  async function handleCapacitySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEvent) return;
    const ok = await onUpdateCapacity(editingEvent.id, Number(editCapacityInput));
    if (ok) {
      setEditingEvent(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Hero / Workspace Context & Role Switcher */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-medium text-blue-700 tracking-wide">
              Role-Based Access Control · Atomic Capacity Locking
            </p>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
              Live Event Booking & Seat Inventory Ledger
            </h1>
            <p className="text-sm lg:text-base text-slate-600 leading-relaxed">
              Switch between Host and Attendee accounts to test JWT role boundaries, payment failure handling (402), sold-out capacity conflicts (409), and ticket cancellations with automatic FIFO waitlist promotion.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => onSwitchDemoUser('usr_admin_01')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  currentUser?.id === 'usr_admin_01'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Admin / Host (Elena)
              </button>
              <button
                type="button"
                onClick={() => onSwitchDemoUser('usr_att_01')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  currentUser?.id === 'usr_att_01'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Attendee (Marcus)
              </button>
              <button
                type="button"
                onClick={() => onSwitchDemoUser('usr_att_02')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  currentUser?.id === 'usr_att_02'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Attendee (Priya)
              </button>
            </div>
          </div>
        </div>

        {/* Active session + Payment simulation bar */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-900">
              <UserCheck className="w-4 h-4 text-blue-700" />
              {currentUser ? `${currentUser.fullName} (${currentUser.role})` : 'Signing in...'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{currentUser?.email}</span>
            <span aria-hidden="true">·</span>
            <span>{currentUser?.organization}</span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={simulatePaymentFailure}
                onChange={(e) => onTogglePaymentFailure(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span>Simulate declined payment (402)</span>
            </label>

            <button
              type="button"
              onClick={() => onSetCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {isAdmin ? 'Create New Event' : 'Test Host Create (403)'}
            </button>
          </div>
        </div>
      </section>

      {/* Live API Audit Banner (shown when an action executes) */}
      {lastAudit && (
        <div
          role="status"
          className={`rounded-xl border px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm ${
            lastAudit.status >= 400
              ? 'bg-red-50/70 border-red-200 text-red-900'
              : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
          }`}
        >
          <div className="flex items-start sm:items-center gap-3">
            {lastAudit.status >= 400 ? (
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5 sm:mt-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5 sm:mt-0" />
            )}
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                <span className="font-semibold">{lastAudit.method}</span>
                <span>{lastAudit.path}</span>
                <span aria-hidden="true">→</span>
                <span className="font-semibold tabular-nums">
                  {lastAudit.status} {lastAudit.statusText}
                </span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums opacity-75">{lastAudit.durationMs}ms</span>
              </div>
              <p className="text-xs font-medium">{lastAudit.summary}</p>
            </div>
          </div>
          <span className="text-xs font-mono opacity-75 whitespace-nowrap shrink-0">
            Role: {lastAudit.role}
          </span>
        </div>
      )}

      {/* 4-Column Summary Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Published Events</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{events.length}</p>
          <p className="mt-1 text-xs text-slate-500">Active catalog schedules</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Remaining Seats</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {totalRemainingSeats}
          </p>
          <p className="mt-1 text-xs text-slate-500">Available across venues</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">
            {isAdmin ? 'Platform Bookings' : 'My Confirmed Tickets'}
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {confirmedTicketsCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">Active seat reservations</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Waitlist Queue</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{totalWaitlist}</p>
          <p className="mt-1 text-xs text-slate-500">Auto-promoted on cancel</p>
        </div>
      </section>

      {/* Catalog Controls + Event Grid */}
      <section className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter events or venues..."
              aria-label="Filter events or venues"
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2].map((n) => (
              <div
                key={n}
                className="bg-white border border-slate-200 rounded-xl h-80 animate-pulse"
              />
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
            <p className="text-base font-semibold text-slate-900">No matching events found</p>
            <p className="text-sm text-slate-500">
              Clear your search filter or create a new event as an Admin host.
            </p>
            <button
              type="button"
              onClick={() => {
                setCategoryFilter('All');
                setSearchQuery('');
              }}
              className="px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredEvents.map((ev) => {
              const isSoldOut = ev.availableSeats === 0 || ev.status === EventStatus.SOLD_OUT;
              const utilization = Math.min(100, Math.round((ev.bookedSeats / ev.capacity) * 100));
              const qty = quantities[ev.id] || 1;

              return (
                <article
                  key={ev.id}
                  className="group bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col"
                >
                  <div className="aspect-[16/9] w-full overflow-hidden bg-slate-100 border-b border-slate-200">
                    <EventImage src={ev.imageUrl} alt={ev.title} category={ev.category} />
                  </div>

                  <div className="p-6 flex-1 flex flex-col justify-between gap-5">
                    <div className="space-y-3">
                      {/* Unboxed static metadata */}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-700">{ev.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatDate(ev.startsAt)}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-semibold ${
                            isSoldOut
                              ? 'text-red-700'
                              : ev.availableSeats <= 5
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                          }`}
                        >
                          {isSoldOut
                            ? 'Sold Out'
                            : ev.availableSeats <= 5
                              ? `${ev.availableSeats} Seats Remaining`
                              : 'Available'}
                        </span>
                      </div>

                      <div className="flex items-start justify-between gap-4">
                        <h2 className="text-lg font-bold text-slate-900 leading-snug">
                          {ev.title}
                        </h2>
                        <span className="text-base font-bold text-slate-900 font-mono tabular-nums shrink-0">
                          {formatPrice(ev.priceCents)}
                        </span>
                      </div>

                      <p className="text-sm text-slate-600 leading-relaxed line-clamp-2">
                        {ev.description}
                      </p>

                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span>{ev.venue}</span>
                        <span aria-hidden="true">·</span>
                        <span>Host: {ev.hostName}</span>
                      </div>
                    </div>

                    {/* Capacity Progress & Actions */}
                    <div className="space-y-4 pt-4 border-t border-slate-100">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-600 font-medium">Capacity Ledger</span>
                          <span className="font-mono tabular-nums text-slate-700">
                            {ev.bookedSeats} / {ev.capacity} booked ({ev.availableSeats} left)
                            {ev.waitlistCount > 0 ? ` · ${ev.waitlistCount} waitlisted` : ''}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              isSoldOut
                                ? 'bg-red-600'
                                : utilization >= 85
                                  ? 'bg-amber-600'
                                  : 'bg-blue-700'
                            }`}
                            style={{ width: `${utilization}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {!isSoldOut ? (
                            <>
                              <select
                                aria-label={`Seat quantity for ${ev.title}`}
                                value={qty}
                                onChange={(e) =>
                                  setQuantities((prev) => ({
                                    ...prev,
                                    [ev.id]: Number(e.target.value),
                                  }))
                                }
                                className="px-2.5 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                              >
                                {[1, 2, 3, 4].map((n) => (
                                  <option key={n} value={n}>
                                    {n} {n === 1 ? 'seat' : 'seats'}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => onBookTicket(ev.id, qty)}
                                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-700 text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                Book Ticket
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => onBookTicket(ev.id, 1)}
                                className="px-3 py-2 text-xs font-medium rounded-lg border border-red-200 bg-red-50 text-red-800 hover:bg-red-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                Attempt Book (409)
                              </button>
                              <button
                                type="button"
                                onClick={() => onJoinWaitlist(ev.id)}
                                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <Users className="w-3.5 h-3.5" />
                                Join Waitlist
                              </button>
                            </>
                          )}
                        </div>

                        {isAdmin && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingEvent(ev);
                                setEditCapacityInput(String(ev.capacity));
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5" />
                              Capacity
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteEvent(ev.id)}
                              aria-label={`Delete ${ev.title}`}
                              className="p-2 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Tickets & Cancellation Ledger */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isAdmin ? 'All Platform Tickets & Cancellations' : 'My Tickets & Cancellation Ledger'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cancelling a confirmed ticket atomically decrements booked_seats and promotes the oldest waitlist attendee.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {tickets.length} record(s)
          </span>
        </div>

        {tickets.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Ticket className="w-6 h-6 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-900">No tickets booked yet</p>
            <p className="text-xs text-slate-500">
              Reserve a seat on any available event above to test the booking and cancellation ledger.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-6">Booking Code</th>
                  <th className="py-3 px-4">Event</th>
                  {isAdmin && <th className="py-3 px-4">Attendee</th>}
                  <th className="py-3 px-4 text-right">Seats</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {tickets.map((tkt) => {
                  const isCancelled = tkt.status === TicketStatus.CANCELLED;
                  return (
                    <tr key={tkt.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-6 font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {tkt.bookingCode}
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-medium text-slate-900">{tkt.eventTitle}</p>
                        <p className="text-xs text-slate-500">{tkt.eventVenue}</p>
                      </td>
                      {isAdmin && (
                        <td className="py-3.5 px-4 text-xs text-slate-600">
                          <span className="font-medium text-slate-800">{tkt.attendeeName}</span>
                        </td>
                      )}
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-800">
                        {tkt.quantity}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-800">
                        {formatPrice(tkt.totalPriceCents)}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-semibold whitespace-nowrap">
                        <span className={isCancelled ? 'text-red-700' : 'text-emerald-700'}>
                          {tkt.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 text-right whitespace-nowrap">
                        {!isCancelled ? (
                          <button
                            type="button"
                            onClick={() => onCancelTicket(tkt.id)}
                            className="px-3 py-1.5 text-xs font-medium text-red-700 border border-red-200 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            Cancel & Release
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 font-mono">
                            Cancelled {tkt.cancelledAt ? formatDate(tkt.cancelledAt) : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create Event Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-5 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Create Hosted Event</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sends <code className="font-mono">POST /api/v1/events</code> with current JWT Bearer token.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSetCreateModalOpen(false)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!isAdmin && (
              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                You are currently signed in as an <strong>ATTENDEE</strong>. Submitting this form will demonstrate the backend enforcing <strong>403 Forbidden</strong> via RBAC.
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Event Title
                </label>
                <input
                  required
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="PostgreSQL Scaling & Sharding Summit"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="Engineering">Engineering</option>
                    <option value="Workshop">Workshop</option>
                    <option value="Culture">Culture</option>
                    <option value="Design">Design</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Date & Time
                  </label>
                  <input
                    required
                    type="datetime-local"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Venue</label>
                <input
                  required
                  type="text"
                  value={newVenue}
                  onChange={(e) => setNewVenue(e.target.value)}
                  placeholder="Civic Hall · New York"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ticket Price (USD)
                  </label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="1"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Max Seat Capacity
                  </label>
                  <input
                    required
                    type="number"
                    min="1"
                    max="50000"
                    value={newCapacity}
                    onChange={(e) => setNewCapacity(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Brief agenda and venue capacity details..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => onSetCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCreate}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-60 cursor-pointer"
                >
                  {submittingCreate ? 'Submitting...' : 'Publish Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Capacity Modal */}
      {editingEvent && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Adjust Event Capacity</h3>
              <button
                type="button"
                onClick={() => setEditingEvent(null)}
                aria-label="Close capacity modal"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              {editingEvent.title} currently has{' '}
              <strong className="font-mono">{editingEvent.bookedSeats}</strong> booked seats. Trying to set capacity lower will trigger{' '}
              <code className="font-mono">409 Conflict</code>.
            </p>
            <form onSubmit={handleCapacitySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Seat Capacity
                </label>
                <input
                  required
                  type="number"
                  min="1"
                  value={editCapacityInput}
                  onChange={(e) => setEditCapacityInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                >
                  Update Capacity
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
