import { fromMinor, percentOf, toMinor } from "../../../../common/money/money.js";
import { daysBetween } from "../../../../common/utils/date.util.js";

/* An item's amount in one installment: sharePercent of it. The last
   installment takes the remainder, so installments add up exactly. */
export const installmentAmount = (itemAmount, installment, installments) => {
  const ordered = [...installments].sort((a, b) => a.sortOrder - b.sortOrder || (a.dueDate < b.dueDate ? -1 : 1));
  if (installment.id !== ordered.at(-1).id) return percentOf(itemAmount, installment.sharePercent);
  const earlier = ordered.slice(0, -1).reduce((total, i) => total + toMinor(percentOf(itemAmount, i.sharePercent)), 0);
  return fromMinor(toMinor(itemAmount) - earlier);
};

/* Discount on one invoice line from the student's concessions (never more than the line) */
export const lineDiscount = (line, concessions) => {
  let discountMinor = 0;
  for (const { concessionType, value, feeHeadId } of concessions) {
    if (feeHeadId && feeHeadId !== line.feeHeadId) continue;
    discountMinor += concessionType === "PERCENT" ? toMinor(percentOf(line.amount, value)) : toMinor(value);
  }
  return fromMinor(Math.min(discountMinor, toMinor(line.amount)));
};

/* Late fee for an invoice on `today` under its structure's rule */
export const lateFeeFor = (structure, dueDate, today) => {
  if (!structure || structure.lateFeeType === "NONE") return 0;
  const daysLate = daysBetween(dueDate, today) - structure.lateFeeGraceDays;
  if (daysLate <= 0) return 0;
  if (structure.lateFeeType === "FIXED") return structure.lateFeeAmount;
  const fee = fromMinor(toMinor(structure.lateFeeAmount) * daysLate);
  return structure.lateFeeCap !== null && structure.lateFeeCap !== undefined
    ? Math.min(fee, structure.lateFeeCap)
    : fee;
};

/* Invoice status after `amountPaid` of `total` has been paid */
export const statusFor = (total, amountPaid) =>
  toMinor(amountPaid) <= 0 ? "ISSUED" : toMinor(amountPaid) >= toMinor(total) ? "PAID" : "PARTIALLY_PAID";
