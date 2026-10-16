/* Amounts as people read them on receipts: "₹1,000.00". The PDFs embed Unicode fonts
   (common/export/fonts.js), so currency symbols print. */
export const formatAmount = (amount, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount);
