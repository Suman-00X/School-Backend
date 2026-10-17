import { between } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { unprocessable } from "../../../../common/http/errors.js";
import { logger } from "../../../../common/logging/logger.js";
import { fromMinor } from "../../../../common/money/money.js";
import { paymentGateway } from "../../../../common/payments/gateway.js";
import { financePostings } from "../../ledger/index.js";
import { paymentSettingsService } from "../../payment-settings/index.js";
import { gatewaySettlements } from "../models/gatewaySettlement.schema.js";
import { gatewaySettlementRepository as settlements } from "../repositories/gatewaySettlement.repository.js";

const DAY_MS = 86_400_000;
/* The daily import looks back this far, so a missed day or a late payout is still caught */
const LOOKBACK_DAYS = 7;

const withEntry = { journalEntry: { columns: { id: true, entryNumber: true, entryDate: true } } };

/* One settlement: recorded and posted in one transaction, exactly once */
const importOne = async (ctx, provider, payout) =>
  transaction(async tx => {
    const row = await settlements.insertNew(
      ctx.tenantId,
      {
        provider,
        settlementId: payout.settlementId,
        amount: fromMinor(payout.amountMinor),
        fees: fromMinor(payout.feesMinor),
        tax: fromMinor(payout.taxMinor),
        utr: payout.utr,
        settledAt: payout.settledAt
      },
      { dbc: tx }
    );
    if (!row) return null;
    const entry = await financePostings.settlementReceived(ctx, { settlement: row }, { dbc: tx });
    return settlements.update(ctx.tenantId, row.id, { journalEntryId: entry.id }, { dbc: tx });
  });

/* Money the gateway paid into the school's bank: Razorpay settlements, read with the
   school's own keys and posted to the books (Dr bank, Dr gateway charges / Cr gateway
   clearing). Replaces entering payouts by hand. */
export const settlementService = {
  /* Import the payouts made between two dates (default: the last 7 days). Already
     imported ones are skipped, so it is safe to run again. */
  importRange: async (ctx, { from, to } = {}) => {
    const credentials = await paymentSettingsService.credentialsFor(ctx);
    const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
    const start = from ? new Date(`${from}T00:00:00.000Z`) : new Date(end.getTime() - LOOKBACK_DAYS * DAY_MS);
    if (start > end) throw unprocessable("from must be on or before to");
    const gateway = paymentGateway();
    let payouts;
    try {
      payouts = await gateway.settlements(credentials, { from: start, to: end });
    } catch (error) {
      logger.warn({ err: error, tenantId: ctx.tenantId }, "Gateway settlements could not be read");
      throw unprocessable("Razorpay could not be reached, or refused the request. Try again in a few minutes");
    }
    const processed = payouts.filter(payout => payout.status === "PROCESSED");
    const imported = [];
    for (const payout of processed) {
      const row = await importOne(ctx, gateway.name, payout);
      if (row) imported.push(row);
    }
    return {
      from: start.toISOString(),
      to: end.toISOString(),
      found: processed.length,
      imported: imported.length,
      alreadyImported: processed.length - imported.length,
      /* Not yet paid out: picked up by a later import */
      notYetProcessed: payouts.length - processed.length,
      settlements: imported
    };
  },

  /* Daily, every school with online payments; schools without keys are skipped */
  importRecent: async ctx => {
    if (!(await paymentSettingsService.get(ctx)).configured) return { skipped: true };
    return settlementService.importRange(ctx);
  },

  list: (ctx, { page, limit, from, to }) =>
    settlements.list(ctx.tenantId, {
      page,
      limit,
      with: withEntry,
      conditions: [
        from && to && between(gatewaySettlements.settledAt, new Date(from), new Date(`${to}T23:59:59.999Z`))
      ].filter(Boolean)
    })
};
