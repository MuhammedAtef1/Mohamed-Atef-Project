export enum UserRole {
  ADMIN = 'ADMIN',
  ATTENDEE = 'ATTENDEE',
}

export enum EventStatus {
  PUBLISHED = 'PUBLISHED',
  SOLD_OUT = 'SOLD_OUT',
  CANCELLED = 'CANCELLED',
}

export enum TicketStatus {
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum WaitlistStatus {
  WAITING = 'WAITING',
  PROMOTED = 'PROMOTED',
  EXPIRED = 'EXPIRED',
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  organization: string;
  createdAt: string;
}

export interface EventRecord {
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
  availableSeats: number;
  status: EventStatus;
  imageUrl: string;
  description: string;
  waitlistCount: number;
}

export interface TicketRecord {
  id: string;
  bookingCode: string;
  eventId: string;
  eventTitle: string;
  eventVenue: string;
  eventStartsAt: string;
  userId: string;
  attendeeName: string;
  attendeeEmail: string;
  quantity: number;
  totalPriceCents: number;
  status: TicketStatus;
  bookedAt: string;
  cancelledAt: string | null;
}

export interface WaitlistEntry {
  id: string;
  eventId: string;
  userId: string;
  attendeeName: string;
  requestedSeats: number;
  status: WaitlistStatus;
  createdAt: string;
}

export interface ApiAuditEntry {
  id: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  status: number;
  statusText: string;
  role: string;
  durationMs: number;
  summary: string;
  payloadPreview?: unknown;
  timestamp: string;
}
