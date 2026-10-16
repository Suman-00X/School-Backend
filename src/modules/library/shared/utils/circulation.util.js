import { fromMinor, toMinor } from "../../../../common/money/money.js";

/* Pure circulation arithmetic. Money is computed in minor units (paise). */

/* A copy may override its book's item type (e.g. one reference copy of a textbook) */
export const itemTypeOf = (copy, book) => copy.itemType ?? book.itemType;

/* min(cap, max(0, lateDays - graceDays) x finePerDay); `terms` are the loan's own,
   fixed when it was issued: { finePerDay, fineGraceDays, fineCap } */
export const lateFineFor = (terms, lateDays) => {
  const chargeable = Math.max(0, lateDays - terms.fineGraceDays);
  const fine = chargeable * toMinor(terms.finePerDay);
  return fromMinor(
    terms.fineCap === null || terms.fineCap === undefined ? fine : Math.min(fine, toMinor(terms.fineCap))
  );
};

/* The cap on a late fine at issue: the copy's price (when the policy says so)
   and the rule's maximum fine, whichever is lower; null when neither applies */
export const fineCapFor = (policy, rule, price) => {
  const caps = [policy.capFineAtPrice ? price : null, rule.maxFine].filter(cap => cap !== null && cap !== undefined);
  return caps.length ? fromMinor(Math.min(...caps.map(toMinor))) : null;
};

/* Replacement charge for a lost copy: max(price + processing fee, minimum charge) */
export const lostChargeFor = (policy, price) =>
  fromMinor(Math.max(toMinor(price) + toMinor(policy.lostProcessingFee), toMinor(policy.lostMinimumCharge)));

/* New charges on a loan -> the loan's new money columns. When what was paid and
   waived exceeds the new charges, waivers are released first, then the paid
   excess becomes library credit (`credit`). */
export const settle = (loan, { lateFine, lostCharge, damageCharge }) => {
  const total = toMinor(lateFine) + toMinor(lostCharge) + toMinor(damageCharge);
  const paid = toMinor(loan.finePaid) - toMinor(loan.fineCredited);
  let waived = toMinor(loan.fineWaived);
  let excess = Math.max(0, paid + waived - total);
  const released = Math.min(waived, excess);
  waived -= released;
  excess -= released;
  return {
    changes: {
      lateFine,
      lostCharge,
      damageCharge,
      fineWaived: fromMinor(waived),
      fineCredited: fromMinor(toMinor(loan.fineCredited) + excess)
    },
    credit: fromMinor(excess)
  };
};

/* What is still owed on a loan's assessed charges */
export const outstandingOf = loan =>
  fromMinor(
    toMinor(loan.lateFine) +
      toMinor(loan.lostCharge) +
      toMinor(loan.damageCharge) -
      toMinor(loan.finePaid) -
      toMinor(loan.fineWaived) +
      toMinor(loan.fineCredited)
  );

/* "Asha Rao" */
export const fullName = user => [user?.firstName, user?.lastName].filter(Boolean).join(" ");

/* 12 -> "12.00" for messages */
export const formatAmount = amount => Number(amount ?? 0).toFixed(2);

/* "1 book", "3 books" */
export const plural = (count, noun, nouns = `${noun}s`) => `${count} ${count === 1 ? noun : nouns}`;
