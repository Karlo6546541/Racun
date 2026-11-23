/** Maps a Google Play subscriptionsv2 state to our subscription status (pure). */
export type PlaySubscription = {
  subscriptionState: string;
  lineItems?: { productId: string; expiryTime?: string; autoRenewingPlan?: { autoRenewEnabled?: boolean } }[];
  acknowledgementState?: string;
  linkedPurchaseToken?: string;
};

export function mapPlayState(p: PlaySubscription, now: Date = new Date()) {
  const item = p.lineItems?.[0];
  const expiry = item?.expiryTime ? new Date(item.expiryTime) : null;
  const autoRenew = item?.autoRenewingPlan?.autoRenewEnabled ?? false;
  let status: string;
  switch (p.subscriptionState) {
    case "SUBSCRIPTION_STATE_ACTIVE":
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
      status = "active";
      break;
    case "SUBSCRIPTION_STATE_CANCELED":
      // Canceled by the user but paid until expiry.
      status = expiry && expiry > now ? "active" : "canceled";
      break;
    case "SUBSCRIPTION_STATE_ON_HOLD":
      status = "on_hold";
      break;
    case "SUBSCRIPTION_STATE_PAUSED":
      status = "paused";
      break;
    case "SUBSCRIPTION_STATE_PENDING":
      status = "incomplete";
      break;
    default:
      status = "canceled";
  }
  return { status, productId: item?.productId ?? null, currentPeriodEnd: expiry, cancelAtPeriodEnd: status === "active" && !autoRenew, needsAck: p.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING" };
}

/** Parses a Pub/Sub push body from Real-time Developer Notifications. */
export function parseRtdn(body: unknown): { purchaseToken: string; packageName: string; productId?: string; type?: number } | null {
  const data = (body as { message?: { data?: string } })?.message?.data;
  if (!data) return null;
  try {
    const n = JSON.parse(Buffer.from(data, "base64").toString("utf8")) as { packageName?: string; subscriptionNotification?: { purchaseToken?: string; subscriptionId?: string; notificationType?: number } };
    const s = n.subscriptionNotification;
    if (!s?.purchaseToken || !n.packageName) return null;
    return { purchaseToken: s.purchaseToken, packageName: n.packageName, productId: s.subscriptionId, type: s.notificationType };
  } catch {
    return null;
  }
}
