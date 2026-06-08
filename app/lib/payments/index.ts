import type { PayMethod, PaymentProvider } from "./types";
import { offlineProvider } from "./offline";
import { stripeProvider } from "./stripe";

export function getProvider(payMethod: PayMethod): PaymentProvider {
  return payMethod === "card" ? stripeProvider : offlineProvider;
}

export type { PayMethod } from "./types";
