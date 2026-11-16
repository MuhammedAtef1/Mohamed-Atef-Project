import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'eventledger-local-signing-key-2026';

type UserRole = 'ADMIN' | 'ATTENDEE';
type EventStatus = 'PUBLISHED' | 'SOLD_OUT' | 'CANCELLED';
type TicketStatus = 'CONFIRMED' | 'CANCELLED';
type WaitlistStatus = 'WAITING' | 'PROMOTED';

interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  organization: string;
  createdAt: string;
}

interface StoredEvent {
  id: string;
  hostId: string;
  hostName: string;
  title: string;
  category: string;
  venue: string;
  startsAt: string;
  priceCents: number;
  capacity: number;
  bookedSeats: number;
  status: EventStatus;
  imageUrl: string;
  description: string;
}

interface StoredTicket {
  id: string;
  bookingCode: string;
  eventId: string;
  userId: string;
  quantity: number;
  totalPriceCents: number;
  status: TicketStatus;
  bookedAt: string;
  cancelledAt: string | null;
}

interface StoredWaitlist {
  id: string;
  eventId: string;
  userId: string;
  requestedSeats: number;
  status: WaitlistStatus;
  createdAt: string;
}

interface AuthenticatedRequest extends Request {
  currentUser?: StoredUser;
}

function hashPassword(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function signJwt(payload: { sub: string; email: string; role: UserRole; exp: number }): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyJwt(token: string): { sub: string; email: string; role: UserRole; exp: number } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  if (signature !== expected) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      sub: string;
      email: string;
      role: UserRole;
      exp: number;
    };
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Seeded PostgreSQL-modeled in-memory store
const users: StoredUser[] = [
  {
    id: 'usr_admin_01',
    email: 'elena.host@eventledger.io',
    passwordHash: hashPassword('host-pass-2026'),
    fullName: 'Elena Vance',
    role: 'ADMIN',
    organization: 'Northstar Venues',
    createdAt: '2026-09-14T09:00:00.000Z',
  },
  {
    id: 'usr_att_01',
    email: 'marcus.chen@attendee.io',
    passwordHash: hashPassword('attendee-pass-2026'),
    fullName: 'Marcus Chen',
    role: 'ATTENDEE',
    organization: 'CloudScale Systems',
    createdAt: '2026-10-02T14:30:00.000Z',
  },
  {
    id: 'usr_att_02',
    email: 'priya.nair@attendee.io',
    passwordHash: hashPassword('attendee-pass-2026'),
    fullName: 'Priya Nair',
    role: 'ATTENDEE',
    organization: 'Lattice Labs',
    createdAt: '2026-10-18T11:15:00.000Z',
  },
];

const events: StoredEvent[] = [
  {
    id: 'evt_sys_2026',
    hostId: 'usr_admin_01',
    hostName: 'Elena Vance',
    title: 'Distributed Systems & Architecture Summit',
    category: 'Engineering',
    venue: 'Civic Auditorium · San Francisco',
    startsAt: '2026-12-04T17:00:00.000Z',
    priceCents: 18500,
    capacity: 120,
    bookedSeats: 118,
    status: 'PUBLISHED',
    imageUrl: '/src/assets/images/event_systems_summit_1794859487117.jpg',
    description:
      'Deep-dive technical track covering database concurrency control, event-driven booking ledgers, and multi-region PostgreSQL resilience.',
  },
  {
    id: 'evt_sym_2026',
    hostId: 'usr_admin_01',
    hostName: 'Elena Vance',
    title: 'Winter Acoustic Chamber Evening',
    category: 'Culture',
    venue: 'Timber Hall · Seattle',
    startsAt: '2026-12-11T19:30:00.000Z',
    priceCents: 9500,
    capacity: 60,
    bookedSeats: 60,
    status: 'SOLD_OUT',
    imageUrl: '/src/assets/images/event_symphony_hall_1794859487307.jpg',
    description:
      'Intimate acoustic orchestral repertoire in the main timber hall. Currently at full capacity — join the waitlist for automatic seat release on cancellations.',
  },
  {
    id: 'evt_wrk_2026',
    hostId: 'usr_admin_01',
    hostName: 'Elena Vance',
    title: 'FastAPI & Docker PostgreSQL Production Lab',
    category: 'Workshop',
    venue: 'Foundry Loft · Austin',
    startsAt: '2026-12-18T16:00:00.000Z',
    priceCents: 14000,
    capacity: 40,
    bookedSeats: 26,
    status: 'PUBLISHED',
    imageUrl: '/src/assets/images/event_cloud_workshop_1794859488169.jpg',
    description:
      'Hands-on full-day laboratory building idempotent REST APIs, Alembic migrations, and containerized integration pipelines.',
  },
  {
    id: 'evt_dsn_2026',
    hostId: 'usr_admin_01',
    hostName: 'Elena Vance',
    title: 'Spatial Systems & Editorial Design Forum',
    category: 'Design',
    venue: 'Limestone Atrium · Chicago',
    startsAt: '2027-01-09T18:00:00.000Z',
    priceCents: 7500,
    capacity: 85,
    bookedSeats: 42,
    status: 'PUBLISHED',
    imageUrl: '/src/assets/images/event_design_forum_1794859488853.jpg',
    description:
      'Cross-disciplinary symposium examining typographic precision, civic architecture, and high-density operational software.',
  },
];

const tickets: StoredTicket[] = [
  {
    id: 'tkt_1001',
    bookingCode: 'EL-9402-SF',
    eventId: 'evt_sys_2026',
    userId: 'usr_att_01',
    quantity: 1,
    totalPriceCents: 18500,
    status: 'CONFIRMED',
    bookedAt: '2026-11-10T10:22:00.000Z',
    cancelledAt: null,
  },
  {
    id: 'tkt_1002',
    bookingCode: 'EL-8814-SEA',
    eventId: 'evt_sym_2026',
    userId: 'usr_att_01',
    quantity: 2,
    totalPriceCents: 19000,
    status: 'CONFIRMED',
    bookedAt: '2026-11-11T15:05:00.000Z',
    cancelledAt: null,
  },
  {
    id: 'tkt_1003',
    bookingCode: 'EL-7731-ATX',
    eventId: 'evt_wrk_2026',
    userId: 'usr_att_02',
    quantity: 2,
    totalPriceCents: 28000,
    status: 'CONFIRMED',
    bookedAt: '2026-11-12T08:40:00.000Z',
    cancelledAt: null,
  },
];

const waitlist: StoredWaitlist[] = [
  {
    id: 'wl_501',
    eventId: 'evt_sym_2026',
    userId: 'usr_att_02',
    requestedSeats: 1,
    status: 'WAITING',
    createdAt: '2026-11-13T12:00:00.000Z',
  },
];

function serializeUser(u: StoredUser) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    organization: u.organization,
    createdAt: u.createdAt,
  };
}

function serializeEvent(e: StoredEvent) {
  const availableSeats = Math.max(0, e.capacity - e.bookedSeats);
  const derivedStatus: EventStatus =
    e.status === 'CANCELLED' ? 'CANCELLED' : availableSeats === 0 ? 'SOLD_OUT' : 'PUBLISHED';
  const waitlistCount = waitlist.filter(
    (w) => w.eventId === e.id && w.status === 'WAITING'
  ).length;
  return {
    ...e,
    status: derivedStatus,
    availableSeats,
    waitlistCount,
  };
}

function serializeTicket(t: StoredTicket) {
  const ev = events.find((e) => e.id === t.eventId);
  const usr = users.find((u) => u.id === t.userId);
  return {
    ...t,
    eventTitle: ev?.title || 'Unknown Event',
    eventVenue: ev?.venue || 'Unknown Venue',
    eventStartsAt: ev?.startsAt || t.bookedAt,
    attendeeName: usr?.fullName || 'Unknown Attendee',
    attendeeEmail: usr?.email || '',
  };
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      detail: 'Authentication credentials were not provided.',
      code: 'AUTH_MISSING_BEARER_TOKEN',
    });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  const payload = verifyJwt(token);
  if (!payload) {
    res.status(401).json({
      detail: 'Invalid or expired JWT access token.',
      code: 'AUTH_INVALID_TOKEN',
    });
    return;
  }
  const user = users.find((u) => u.id === payload.sub);
  if (!user) {
    res.status(401).json({
      detail: 'Authenticated user no longer exists.',
      code: 'AUTH_USER_NOT_FOUND',
    });
    return;
  }
  req.currentUser = user;
  next();
}

function requireRole(role: UserRole) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      res.status(401).json({ detail: 'Authentication required.' });
      return;
    }
    if (req.currentUser.role !== role) {
      res.status(403).json({
        detail: `Access denied. Required role: ${role}. Current role: ${req.currentUser.role}.`,
        code: 'RBAC_FORBIDDEN',
      });
      return;
    }
    next();
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Health probe
  app.get('/api/v1/health', (_req, res) => {
    res.status(200).json({
      status: 'healthy',
      service: 'eventledger-api',
      timestamp: new Date().toISOString(),
    });
  });

  // --- AUTH & USERS ---
  app.post('/api/v1/auth/register', (req, res) => {
    const { email, password, fullName, role, organization } = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(422).json({ detail: 'Valid email address is required.' });
      return;
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      res.status(422).json({ detail: 'Password must be at least 6 characters.' });
      return;
    }
    if (!fullName || typeof fullName !== 'string') {
      res.status(422).json({ detail: 'Full name is required.' });
      return;
    }
    const existing = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      res.status(409).json({
        detail: 'A user with this email address already exists.',
        code: 'EMAIL_ALREADY_REGISTERED',
      });
      return;
    }
    const assignedRole: UserRole = role === 'ADMIN' ? 'ADMIN' : 'ATTENDEE';
    const created: StoredUser = {
      id: `usr_${crypto.randomUUID().slice(0, 8)}`,
      email: email.trim().toLowerCase(),
      passwordHash: hashPassword(password),
      fullName: fullName.trim(),
      role: assignedRole,
      organization: typeof organization === 'string' && organization.trim() ? organization.trim() : 'Independent',
      createdAt: new Date().toISOString(),
    };
    users.push(created);
    const accessToken = signJwt({
      sub: created.id,
      email: created.email,
      role: created.role,
      exp: Date.now() + 1000 * 60 * 60 * 12,
    });
    res.status(201).json({
      access_token: accessToken,
      token_type: 'bearer',
      user: serializeUser(created),
    });
  });

  app.post('/api/v1/auth/login', (req, res) => {
    const { email, password, demoUserId } = req.body || {};
    let user: StoredUser | undefined;
    if (demoUserId && typeof demoUserId === 'string') {
      user = users.find((u) => u.id === demoUserId);
    } else if (email && password) {
      user = users.find(
        (u) =>
          u.email.toLowerCase() === String(email).toLowerCase() &&
          u.passwordHash === hashPassword(String(password))
      );
    }
    if (!user) {
      res.status(401).json({
        detail: 'Invalid email or password.',
        code: 'INVALID_CREDENTIALS',
      });
      return;
    }
    const accessToken = signJwt({
      sub: user.id,
      email: user.email,
      role: user.role,
      exp: Date.now() + 1000 * 60 * 60 * 12,
    });
    res.status(200).json({
      access_token: accessToken,
      token_type: 'bearer',
      user: serializeUser(user),
    });
  });

  app.get('/api/v1/users/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.status(200).json(serializeUser(req.currentUser!));
  });

  app.get('/api/v1/users', requireAuth, requireRole('ADMIN'), (_req, res) => {
    res.status(200).json({
      items: users.map(serializeUser),
      total: users.length,
    });
  });

  // --- EVENTS ---
  app.get('/api/v1/events', (req, res) => {
    const { category, status, q } = req.query;
    let list = events.map(serializeEvent);
    if (category && typeof category === 'string' && category !== 'All') {
      list = list.filter((e) => e.category.toLowerCase() === category.toLowerCase());
    }
    if (status && typeof status === 'string' && status !== 'ALL') {
      list = list.filter((e) => e.status === status);
    }
    if (q && typeof q === 'string' && q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(needle) ||
          e.venue.toLowerCase().includes(needle) ||
          e.category.toLowerCase().includes(needle)
      );
    }
    res.status(200).json({
      items: list,
      total: list.length,
    });
  });

  app.get('/api/v1/events/:id', (req, res) => {
    const ev = events.find((e) => e.id === req.params.id);
    if (!ev) {
      res.status(404).json({ detail: `Event '${req.params.id}' not found.` });
      return;
    }
    res.status(200).json(serializeEvent(ev));
  });

  app.post('/api/v1/events', requireAuth, requireRole('ADMIN'), (req: AuthenticatedRequest, res) => {
    const { title, category, venue, startsAt, priceCents, capacity, description } = req.body || {};
    if (!title || !venue || !startsAt) {
      res.status(422).json({
        detail: 'Fields title, venue, and startsAt are required.',
      });
      return;
    }
    const numericCapacity = Number(capacity);
    const numericPrice = Number(priceCents ?? 0);
    if (!Number.isInteger(numericCapacity) || numericCapacity < 1 || numericCapacity > 50000) {
      res.status(422).json({
        detail: 'Capacity must be an integer between 1 and 50,000.',
      });
      return;
    }
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      res.status(422).json({ detail: 'Price must be non-negative.' });
      return;
    }

    const fallbackImages = [
      '/src/assets/images/event_systems_summit_1794859487117.jpg',
      '/src/assets/images/event_cloud_workshop_1794859488169.jpg',
      '/src/assets/images/event_design_forum_1794859488853.jpg',
      '/src/assets/images/event_symphony_hall_1794859487307.jpg',
    ];
    const chosenImage = fallbackImages[events.length % fallbackImages.length];

    const created: StoredEvent = {
      id: `evt_${crypto.randomUUID().slice(0, 8)}`,
      hostId: req.currentUser!.id,
      hostName: req.currentUser!.fullName,
      title: String(title).trim(),
      category: typeof category === 'string' && category.trim() ? category.trim() : 'Engineering',
      venue: String(venue).trim(),
      startsAt: String(startsAt),
      priceCents: Math.round(numericPrice),
      capacity: numericCapacity,
      bookedSeats: 0,
      status: 'PUBLISHED',
      imageUrl: chosenImage,
      description:
        typeof description === 'string' && description.trim()
          ? description.trim()
          : 'Hosted technical and community gathering with live capacity management.',
    };
    events.unshift(created);
    res.status(201).json(serializeEvent(created));
  });

  app.patch('/api/v1/events/:id', requireAuth, requireRole('ADMIN'), (req: AuthenticatedRequest, res) => {
    const ev = events.find((e) => e.id === req.params.id);
    if (!ev) {
      res.status(404).json({ detail: `Event '${req.params.id}' not found.` });
      return;
    }
    const { capacity, priceCents, title, venue } = req.body || {};
    if (capacity !== undefined) {
      const nextCap = Number(capacity);
      if (!Number.isInteger(nextCap) || nextCap < 1) {
        res.status(422).json({ detail: 'Capacity must be a positive integer.' });
        return;
      }
      if (nextCap < ev.bookedSeats) {
        res.status(409).json({
          detail: `Cannot reduce capacity to ${nextCap}; ${ev.bookedSeats} seats are already booked.`,
          code: 'CAPACITY_BELOW_BOOKED_SEATS',
        });
        return;
      }
      ev.capacity = nextCap;
      ev.status = ev.bookedSeats >= ev.capacity ? 'SOLD_OUT' : 'PUBLISHED';
    }
    if (priceCents !== undefined) {
      const nextPrice = Number(priceCents);
      if (!Number.isFinite(nextPrice) || nextPrice < 0) {
        res.status(422).json({ detail: 'Price must be non-negative.' });
        return;
      }
      ev.priceCents = Math.round(nextPrice);
    }
    if (typeof title === 'string' && title.trim()) ev.title = title.trim();
    if (typeof venue === 'string' && venue.trim()) ev.venue = venue.trim();
    res.status(200).json(serializeEvent(ev));
  });

  app.delete('/api/v1/events/:id', requireAuth, requireRole('ADMIN'), (req, res) => {
    const idx = events.findIndex((e) => e.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ detail: `Event '${req.params.id}' not found.` });
      return;
    }
    const [removed] = events.splice(idx, 1);
    res.status(200).json({
      deleted: true,
      id: removed.id,
      title: removed.title,
    });
  });

  // --- TICKETS & CAPACITY / CANCELLATION LOGIC ---
  app.get('/api/v1/tickets', requireAuth, (req: AuthenticatedRequest, res) => {
    const scope = req.query.scope;
    const filtered =
      req.currentUser!.role === 'ADMIN' && scope === 'all'
        ? tickets
        : tickets.filter((t) => t.userId === req.currentUser!.id);
    res.status(200).json({
      items: filtered.map(serializeTicket),
      total: filtered.length,
    });
  });

  app.get('/api/v1/tickets/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const ticket = tickets.find((t) => t.id === req.params.id);
    if (!ticket) {
      res.status(404).json({ detail: `Ticket '${req.params.id}' not found.` });
      return;
    }
    if (ticket.userId !== req.currentUser!.id && req.currentUser!.role !== 'ADMIN') {
      res.status(403).json({
        detail: 'You do not have permission to inspect another attendee’s ticket.',
        code: 'TICKET_OWNERSHIP_FORBIDDEN',
      });
      return;
    }
    res.status(200).json(serializeTicket(ticket));
  });

  app.post('/api/v1/tickets', requireAuth, (req: AuthenticatedRequest, res) => {
    const { eventId, quantity = 1, simulatePaymentFailure = false } = req.body || {};
    if (!eventId || typeof eventId !== 'string') {
      res.status(422).json({ detail: 'eventId is required.' });
      return;
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
      res.status(422).json({ detail: 'Ticket quantity must be an integer between 1 and 10.' });
      return;
    }

    const ev = events.find((e) => e.id === eventId);
    if (!ev) {
      res.status(404).json({ detail: `Event '${eventId}' not found.` });
      return;
    }
    if (ev.status === 'CANCELLED') {
      res.status(409).json({ detail: 'Event has been cancelled and is closed for booking.' });
      return;
    }

    // 402 Payment Required check before committing seat lock
    if (simulatePaymentFailure === true) {
      res.status(402).json({
        detail: 'Payment authorization declined by card issuer. Seat reservation aborted.',
        code: 'PAYMENT_REQUIRED',
        amountCents: ev.priceCents * qty,
      });
      return;
    }

    // Atomic capacity check (mirrors PostgreSQL SELECT ... FOR UPDATE)
    const remaining = ev.capacity - ev.bookedSeats;
    if (remaining <= 0) {
      res.status(409).json({
        detail: `Event '${ev.title}' is sold out (0 seats remaining). Join the waitlist instead.`,
        code: 'EVENT_FULLY_BOOKED',
        availableSeats: 0,
      });
      return;
    }
    if (qty > remaining) {
      res.status(409).json({
        detail: `Requested ${qty} seats, but only ${remaining} seat(s) remain.`,
        code: 'INSUFFICIENT_CAPACITY',
        availableSeats: remaining,
      });
      return;
    }

    ev.bookedSeats += qty;
    ev.status = ev.bookedSeats >= ev.capacity ? 'SOLD_OUT' : 'PUBLISHED';

    const created: StoredTicket = {
      id: `tkt_${crypto.randomUUID().slice(0, 6)}`,
      bookingCode: `EL-${Math.floor(1000 + Math.random() * 9000)}`,
      eventId: ev.id,
      userId: req.currentUser!.id,
      quantity: qty,
      totalPriceCents: ev.priceCents * qty,
      status: 'CONFIRMED',
      bookedAt: new Date().toISOString(),
      cancelledAt: null,
    };
    tickets.unshift(created);

    res.status(201).json({
      ticket: serializeTicket(created),
      event: serializeEvent(ev),
    });
  });

  app.patch('/api/v1/tickets/:id/cancel', requireAuth, (req: AuthenticatedRequest, res) => {
    const ticket = tickets.find((t) => t.id === req.params.id);
    if (!ticket) {
      res.status(404).json({ detail: `Ticket '${req.params.id}' not found.` });
      return;
    }
    if (ticket.userId !== req.currentUser!.id && req.currentUser!.role !== 'ADMIN') {
      res.status(403).json({
        detail: 'Only the ticket owner or an Admin host can cancel this reservation.',
        code: 'RBAC_FORBIDDEN',
      });
      return;
    }
    if (ticket.status === 'CANCELLED') {
      res.status(409).json({
        detail: 'Ticket has already been cancelled.',
        code: 'TICKET_ALREADY_CANCELLED',
      });
      return;
    }

    ticket.status = 'CANCELLED';
    ticket.cancelledAt = new Date().toISOString();

    const ev = events.find((e) => e.id === ticket.eventId);
    let promotedWaitlist: { attendeeName: string; ticketCode: string } | null = null;

    if (ev) {
      ev.bookedSeats = Math.max(0, ev.bookedSeats - ticket.quantity);

      // Auto-promote FIFO waitlist entry if freed seats satisfy requested seats
      const nextWaiting = waitlist.find(
        (w) =>
          w.eventId === ev.id &&
          w.status === 'WAITING' &&
          w.requestedSeats <= ev.capacity - ev.bookedSeats
      );
      if (nextWaiting) {
        nextWaiting.status = 'PROMOTED';
        ev.bookedSeats += nextWaiting.requestedSeats;
        const promotedTicket: StoredTicket = {
          id: `tkt_${crypto.randomUUID().slice(0, 6)}`,
          bookingCode: `EL-WL-${Math.floor(100 + Math.random() * 900)}`,
          eventId: ev.id,
          userId: nextWaiting.userId,
          quantity: nextWaiting.requestedSeats,
          totalPriceCents: ev.priceCents * nextWaiting.requestedSeats,
          status: 'CONFIRMED',
          bookedAt: new Date().toISOString(),
          cancelledAt: null,
        };
        tickets.unshift(promotedTicket);
        const promotedUser = users.find((u) => u.id === nextWaiting.userId);
        promotedWaitlist = {
          attendeeName: promotedUser?.fullName || 'Waitlist Attendee',
          ticketCode: promotedTicket.bookingCode,
        };
      }

      ev.status = ev.bookedSeats >= ev.capacity ? 'SOLD_OUT' : 'PUBLISHED';
    }

    res.status(200).json({
      ticket: serializeTicket(ticket),
      event: ev ? serializeEvent(ev) : null,
      promotedWaitlist,
    });
  });

  app.post('/api/v1/events/:id/waitlist', requireAuth, (req: AuthenticatedRequest, res) => {
    const ev = events.find((e) => e.id === req.params.id);
    if (!ev) {
      res.status(404).json({ detail: `Event '${req.params.id}' not found.` });
      return;
    }
    const available = ev.capacity - ev.bookedSeats;
    if (available > 0) {
      res.status(409).json({
        detail: `Event still has ${available} available seat(s). Book directly via POST /api/v1/tickets.`,
        code: 'SEATS_STILL_AVAILABLE',
      });
      return;
    }
    const alreadyWaiting = waitlist.find(
      (w) => w.eventId === ev.id && w.userId === req.currentUser!.id && w.status === 'WAITING'
    );
    if (alreadyWaiting) {
      res.status(409).json({
        detail: 'You are already on the FIFO waitlist for this event.',
        code: 'ALREADY_WAITLISTED',
      });
      return;
    }

    const entry: StoredWaitlist = {
      id: `wl_${crypto.randomUUID().slice(0, 6)}`,
      eventId: ev.id,
      userId: req.currentUser!.id,
      requestedSeats: 1,
      status: 'WAITING',
      createdAt: new Date().toISOString(),
    };
    waitlist.push(entry);

    res.status(201).json({
      waitlistEntry: entry,
      event: serializeEvent(ev),
    });
  });

  app.get('/api/v1/waitlist', requireAuth, (req: AuthenticatedRequest, res) => {
    const entries = waitlist
      .filter((w) => req.currentUser!.role === 'ADMIN' || w.userId === req.currentUser!.id)
      .map((w) => {
        const usr = users.find((u) => u.id === w.userId);
        return {
          ...w,
          attendeeName: usr?.fullName || 'Unknown',
        };
      });
    res.status(200).json({ items: entries, total: entries.length });
  });

  // Vite integration in development / static dist in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EventLedger server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
