// PaymentProvider port (ADR-0001). Providers only collect money; our DB owns
// the canonical invoice/membership state. Keep this surface small.

export type PayMethod = "card" | "bank_transfer";

export interface CreateInvoiceArgs {
  member: {
    id: string;
    legalName: string;
    primaryEmail: string;
    country: string;
    stripeCustomerId: string | null;
  };
  invoice: {
    id: string;
    number: string;
    grossAmount: number; // minor units; VAT already computed in-app
    currency: string;
    description: string;
  };
}

export interface CreateInvoiceResult {
  providerRef: string | null; // provider's invoice id
  hostedPayUrl: string | null; // where to send the payer (card), else null
  customerId: string | null; // provider customer id to persist, if created
}

export interface PaymentProvider {
  readonly id: string;
  createInvoice(args: CreateInvoiceArgs): Promise<CreateInvoiceResult>;
}
