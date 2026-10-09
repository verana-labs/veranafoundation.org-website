# Colombia: Associate Member dues paid without withholding

Supporting pack for Associate Members established in Colombia. Goal: the member pays its annual dues in full, with no *retención en la fuente* (income-tax withholding on payments abroad) and no *retención de IVA*, and its accountant and bank have the documents they need to book and remit the payment.

This pack is not tax advice. It was checked against public DIAN doctrine on 9 October 2026. The member's *contador* or tax advisor confirms the treatment; our documents give them the facts and the references.

## Why no withholding applies

- Withholding on payments abroad (art. 406 ET and following) applies only to income taxable in Colombia. A foreign entity without domicile in Colombia is taxed there only on Colombian-source income (arts. 12 and 20 ET). Art. 24 ET lists what is Colombian-source: services rendered inside Colombia and, wherever rendered, technical services, technical assistance and consulting.
- Membership dues of a non-profit are none of those. DIAN said so for membership payments to organisations abroad in Oficio 007242 of 30 March 2017 (Dirección de Gestión Jurídica, radicado 100202208-0276): such payments are neither Colombian-source income nor taxable income for the organisation, so there is no income-tax withholding, and no IVA withholding because no taxable service is rendered in Colombia. Oficio 057318 of 2014 applies the same source reasoning to services executed entirely abroad.
- There is no double-tax treaty between Colombia and Estonia. The result rests on domestic source rules only, so no treaty form is needed.
- What would apply if the dues were recharacterised as a service: 20 percent (art. 408 ET) or 15 percent residual (art. 415 ET). Private agreements cannot stop a withholding the law requires (art. 553 ET, Concepto 12499 of 2025). This is why the agreement describes the dues precisely (v5 Section 7.7) and allocates any withholding to the member (v5 Section 7.9).

## Files

| File | Audience | Language | Use |
| :---- | :---- | :---- | :---- |
| `carta-caracterizacion-tributaria.md` | member's accountant, tax advisor, bank | Spanish | Letter from 2060 OÜ stating the nature of the dues, the payee, and the resulting treatment. Send with the first invoice of each year and on request. |
| `tax-characterisation-letter.md` | same | English | Mirror of the Spanish letter for the Foundation's file and English-speaking signers. The Spanish text is the one the member uses in Colombia. |
| `guia-contador-miembro.md` | member's accountant and treasury | Spanish | Step by step: booking, *documento soporte*, no withholding, IVA, payment channel, exchange regime, audit file, FAQ, cover email. |
| `acuerdo-modificatorio-v4.md` | members who signed v4 | English, with Spanish courtesy text | Amendment No. 1 that brings a v4 agreement in line with v5 Sections 1.29, 7.2, 7.7 to 7.12 and Annex D Sections D.8 to D.11. Not needed for members who sign v5. |

## Checklist (Foundation side)

1. Agreement: have the member sign v5 (activate it in `/admin/settings`). If the member already signed v4, send Amendment No. 1 for signature first.
2. Attachments to obtain once a year for 2060 OÜ: (a) certificate of tax residence from the Estonian Tax and Customs Board (e-MTA portal, English version); (b) e-Business Register extract (ariregister.rik.ee, English). Keep both PDFs with the member's file.
3. Fill the letter placeholders, sign (Fabrice Rochette, legal representative), export to PDF.
4. Send together with the invoice: the letter (Spanish), the guide (Spanish), the residency certificate, the register extract and the signed agreement.
5. Ask the member's accountant to confirm in writing, before the due date, that no withholding will be applied. If they insist on withholding, point to Section 7.9 (gross-up) and offer a call with their advisor.
6. Payment: recommend the card link on the invoice. A bank transfer works too (charges "OUR", reference = invoice number).
7. On payment, file the member's *documento soporte* reference if they share it.

## Placeholders

`{{member_legal_name}}`, `{{member_nit}}`, `{{member_address}}`, `{{member_contact}}`, `{{member_email}}`, `{{entity_form}}`, `{{jurisdiction}}`, `{{invoice_number}}`, `{{invoice_date}}`, `{{invoice_amount_eur}}`, `{{tier_label}}`, `{{letter_date}}`, `{{agreement_date}}`, `{{signer_name}}`, `{{signer_title}}`, `{{effective_date}}`, `{{seller_vat_number}}`, `{{foundation_contact_email}}`.

The agreement renderer does not process these files; fill them by hand or with a script.

## Known gaps and follow-ups

- Invoice PDF: the seller block prints no address or registry code (the lazily created seller row carries name, country and VAT number only). Colombian buyers need the supplier's name, address, country and identifier for the *documento soporte*. Until that is fixed, the letter carries those details. Follow-up: add a seller address and the registry code to `getSellerEntity` and the PDF seller block.
- If the Invoicing Entity or its jurisdiction changes (Section 7.8), re-run this analysis for the new jurisdiction before the first invoice, including Colombia's lists under art. 260-7 ET and the deductibility rule of art. 124-2 ET.
- The letter and guide are per member: version them with the member name and date when sent.

## Sources

- DIAN Oficio 007242 de 2017: https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_7242_2017.htm
- DIAN Oficio 057318 de 2014: https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_57318_2014.htm
- DIAN Concepto 12499 de 2025: https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_12499_2025.htm
- Estatuto Tributario arts. 12, 20, 24, 107, 121, 122, 124-2, 260-7, 406, 408, 415, 437-2, 553: https://estatuto.co/
- Decreto 1966 de 2014 (list of non-cooperative jurisdictions, compiled in art. 1.2.2.5.1 of Decreto 1625 de 2016): https://actualicese.com/archivo/decreto-1966-de-07-10-2014/
- Treaties in force: https://actualicese.com/listado-de-convenios-internacionales-para-evitar-la-doble-tributacion-y-otros-acuerdos-para-el-intercambio-de-informacion-fiscal/
