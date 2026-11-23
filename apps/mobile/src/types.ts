export type Point = { lat: number; lon: number };
export type Place = { name: string; lat?: number; lon?: number };
export type Stop = Place & { minutes: number; metres: number };
export type Ticket = {
  id: string;
  journey_id: string;
  guest_name?: string | null;
  state: string;
  board: number;
  alight: number;
  fare_paise: number;
  confirmed: boolean;
  travel_state: string | null;
  expires: string;
  charged_paise: number;
  refund_paise: number;
};
export type Journey = {
  id: string;
  stops: Stop[];
  departure: string;
  owner: boolean;
  cancelled: boolean;
  booking_eligible: boolean;
  guest_booking_available?: boolean;
  booking_mode: 'approval' | 'instant';
  price_paise: number;
  driver_name: string | null;
  driver_verified: boolean;
  vehicle_verified: boolean;
  vehicle: { make: string; model: string; color: string } | null;
  free: number[];
  tickets: Ticket[];
};
export type Match = { journey: Journey; board: number; alight: number; match: { fare_paise?: number } };
export type Search = { items: Match[]; more: boolean };
export type Quote = {
  fare_paise: number;
  pickup_at: string;
  seats_available: number;
  passenger_fee_if_cancelled_now_paise: number;
};
export type Thread = {
  ticket_id: string;
  guest_name?: string | null;
  journey_id: string;
  origin: string;
  destination: string;
  unread: number;
  closed: boolean;
  preview: string | null;
};
export type Message = { id: string; text: string; sender: 'driver' | 'passenger'; created_at: string };
export type Chat = { role: Message['sender']; guest_name?: string | null; closed: boolean; messages: Message[] };
export type Circle = { id: string; name: string; role: 'member' | 'owner' };
export type Vehicle = {
  id: string;
  make: string;
  model: string;
  color: string;
  status: string;
  seat_capacity: number;
};
export type Eligibility = { driver_status: string; can_offer: boolean; vehicles: Vehicle[] };
export type Tab = 'Book' | 'Offer' | 'Trips' | 'Circles' | 'Inbox' | 'Profile';
export type Route =
  | { tab: Tab }
  | { screen: 'ride'; id: string; board: number; alight: number }
  | { screen: 'chat'; journey: string; ticket: string }
  | { screen: 'safety'; journey: string; ticket?: string }
  | { screen: 'circle'; circle: Circle };
export const WEB = 'https://nagoor06.github.io/commutecircle/';
export const API = 'https://commutecircle-staging-api.onrender.com';
export const money = (paise: number) => '₹' + (paise / 100).toFixed(2);
export const when = (value: string) =>
  new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export const ticketPath = (journey: string, ticket: string) =>
  '/v1/journeys/' + encodeURIComponent(journey) + '/tickets/' + encodeURIComponent(ticket);
