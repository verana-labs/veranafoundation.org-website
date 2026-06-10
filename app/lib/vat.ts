// VAT treatment for Associate dues. The seller is the Foundation's invoicing
// entity (2060 OÜ, Estonia). VAT is computed in-app so the bank-transfer and
// card paths agree; Stripe is used purely to collect.
//
// CONFIRM with the accountant before go-live: the Estonian rate and the
// Foundation/2060 OÜ VAT registration status. Reverse-charge here checks only
// that a VAT number was supplied — it should be VIES-validated (see
// verana-invoicing-spec.md §VAT) before granting 0% in production.

import { EU_COUNTRIES as EU } from "@/app/lib/eu";

const SELLER_COUNTRY = "EE";
const DOMESTIC_RATE = Number(process.env.VAT_DOMESTIC_RATE ?? "0.24");

export type VatTreatment = "domestic" | "reverse_charge" | "outside_scope";

export type VatResult = {
  treatment: VatTreatment;
  rate: number;
  vatAmount: number;
};

export function computeVat(
  net: number,
  country: string,
  hasVatNumber: boolean,
): VatResult {
  const c = country.trim().toUpperCase();
  const domestic = (): VatResult => ({
    treatment: "domestic",
    rate: DOMESTIC_RATE,
    vatAmount: Math.round(net * DOMESTIC_RATE),
  });

  if (c === SELLER_COUNTRY) return domestic();
  if (EU.has(c)) {
    return hasVatNumber
      ? { treatment: "reverse_charge", rate: 0, vatAmount: 0 }
      : domestic();
  }
  return { treatment: "outside_scope", rate: 0, vatAmount: 0 };
}
