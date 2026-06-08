import type { PaymentProvider } from "./types";

// Bank transfer: we issue the invoice (with its number as the payment
// reference) and an admin marks it paid once the wire arrives. No hosted page.
export const offlineProvider: PaymentProvider = {
  id: "offline_bank_transfer",
  async createInvoice() {
    return { providerRef: null, hostedPayUrl: null, customerId: null };
  },
};
