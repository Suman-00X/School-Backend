/* Amounts as people read them on receipts: "INR 1,000.00".
   The currency code is used, not a symbol, so the built-in PDF fonts can print it
   (Intl puts a no-break space after the code, which those fonts lack). */
export const formatAmount = (amount, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, currencyDisplay: "code" })
    .format(amount)
    .replace(/\s/g, " ");
