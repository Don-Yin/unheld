// PayPal sandbox REST client. Server-side only: it reads the client secret from the environment.
// Unheld makes two kinds of call: read an order (amount, capture, trackers) and add a tracker.

import { paypal } from './api-clients.mjs';

export type Tracker = { id: string; status: string };

export type Order = {
  id: string;
  status: string;
  purchase_units: {
    description?: string;
    amount: { value: string; currency_code: string };
    shipping?: { trackers?: Tracker[] };
    payments?: { captures?: { id: string; status: string; create_time: string }[] };
  }[];
};

export const getOrder = (orderId: string) => paypal<Order>(process.env, 'GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`);

/** Attach a shipment tracker to an order's capture (order-level /track; the batch API is 403 here). */
export const addTracking = (orderId: string, captureId: string, carrier: string, trackingNumber: string) =>
  paypal<Order>(process.env, 'POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/track`, {
    capture_id: captureId,
    tracking_number: trackingNumber,
    carrier,
    notify_payer: false,
  });
