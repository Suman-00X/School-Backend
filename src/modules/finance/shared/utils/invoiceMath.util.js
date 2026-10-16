import { fromMinor, toMinor } from "../../../../common/money/money.js";
import { daysBetween } from "../../../../common/utils/date.util.js";

/* Fee arithmetic in integer minor units (paise). See D-17, D-18 and D-19. */

const total = values => values.reduce((sum, value) => sum + value, 0);

/* Basis points of a 2-decimal percentage: 33.33 -> 3333 */
const basisPoints = percent => Math.round(Number(percent) * 100);

/* Split `minor` over installments by share (percentages adding up to 100).
   Every installment but the last is rounded down to the paisa and the last takes
   the remainder, so the parts add up exactly and none is negative. */
export const splitByShares = (minor, shares) => {
  const parts = shares.slice(0, -1).map(share => Math.floor((minor * basisPoints(share)) / 10_000));
  return [...parts, minor - total(parts)];
};

const appliesTo = (concession, feeHeadId) =>
  !concession.feeHeadIds?.length || concession.feeHeadIds.includes(feeHeadId);

/* A student's concessions applied to a structure's items for the whole year.
     items:       [{ feeHeadId, amount }]                         annual amounts
     concessions: [{ id, name, category, concessionType, value, feeHeadIds }]
   Concessions stack. PERCENT ones take their share of each matching item's gross
   (10% + 20% = 30%, not compounded). FIXED ones are annual amounts, taken after the
   percentages and split over the matching items in proportion to what is left.
   An item's discount never exceeds the item.
   -> [{ feeHeadId, grossMinor, allocations: [{ concession, minor }] }] */
export const annualFees = (items, concessions) => {
  const rows = items.map(item => ({ feeHeadId: item.feeHeadId, grossMinor: toMinor(item.amount), allocations: [] }));
  const left = row => row.grossMinor - total(row.allocations.map(a => a.minor));
  const take = (row, concession, minor) => {
    const taken = Math.min(minor, left(row));
    if (taken > 0) row.allocations.push({ concession, minor: taken });
  };

  for (const concession of concessions.filter(c => c.concessionType === "PERCENT")) {
    for (const row of rows.filter(r => appliesTo(concession, r.feeHeadId))) {
      take(row, concession, Math.round((row.grossMinor * basisPoints(concession.value)) / 10_000));
    }
  }

  for (const concession of concessions.filter(c => c.concessionType === "FIXED")) {
    const targets = rows.filter(r => appliesTo(concession, r.feeHeadId) && left(r) > 0);
    const pool = total(targets.map(left));
    if (!pool) continue;
    const minor = Math.min(toMinor(concession.value), pool);
    const shares = targets.map((row, index) =>
      index < targets.length - 1 ? Math.floor((minor * left(row)) / pool) : null
    );
    shares[shares.length - 1] = minor - total(shares.slice(0, -1));
    targets.forEach((row, index) => take(row, concession, shares[index]));
  }
  return rows;
};

/* The lines of installment number `index` (0-based) for a student's annual fees.
   Each concession and the net amount are split by the plan's shares; the line's gross
   is net + concessions, so gross, concession and net always agree.
   -> [{ feeHeadId, amount, discount, netAmount, concessions: [{ concession, amount }] }] */
export const installmentLines = (annual, shares, index) =>
  annual.map(row => {
    const netMinor = splitByShares(row.grossMinor - total(row.allocations.map(a => a.minor)), shares)[index];
    const concessions = row.allocations
      .map(a => ({ concession: a.concession, minor: splitByShares(a.minor, shares)[index] }))
      .filter(a => a.minor > 0);
    const discountMinor = total(concessions.map(a => a.minor));
    return {
      feeHeadId: row.feeHeadId,
      amount: fromMinor(netMinor + discountMinor),
      discount: fromMinor(discountMinor),
      netAmount: fromMinor(netMinor),
      concessions: concessions.map(a => ({ concession: a.concession, amount: fromMinor(a.minor) }))
    };
  });

/* Late fee on `today` for an invoice due on `dueDate` under a rule (null = none).
   The delay is counted from the end of the grace period. The slab containing the
   delay decides the fee: a FIXED slab's amount is the fee; a PER_DAY slab adds its
   amount for each of its days to the fee owed when the slab began. The rule's
   maximum caps the result. */
export const lateFeeFor = (rule, dueDate, today) => {
  if (!rule?.slabs?.length) return 0;
  const delay = daysBetween(dueDate, today) - (rule.graceDays ?? 0);
  if (delay <= 0) return 0;

  let feeMinor = 0;
  for (const slab of [...rule.slabs].sort((a, b) => a.fromDay - b.fromDay)) {
    if (delay < slab.fromDay) break;
    const lastDay = Math.min(delay, slab.toDay ?? Infinity);
    feeMinor =
      slab.chargeType === "FIXED"
        ? toMinor(slab.amount)
        : feeMinor + toMinor(slab.amount) * (lastDay - slab.fromDay + 1);
  }
  if (rule.maxAmount !== null && rule.maxAmount !== undefined) feeMinor = Math.min(feeMinor, toMinor(rule.maxAmount));
  return fromMinor(feeMinor);
};

/* Invoice status after `amountPaid` of `total` has been paid (a fully concessioned invoice is PAID) */
export const statusFor = (invoiceTotal, amountPaid) => {
  const paid = toMinor(amountPaid);
  if (paid >= toMinor(invoiceTotal)) return "PAID";
  return paid > 0 ? "PARTIALLY_PAID" : "ISSUED";
};
