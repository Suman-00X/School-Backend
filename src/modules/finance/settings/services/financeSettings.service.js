import { financeSettingsRepository as settings } from "../repositories/financeSettings.repository.js";

const DEFAULTS = { refundApprovalLimit: 0 };

const view = row => ({
  refundApprovalLimit: row?.refundApprovalLimit ?? DEFAULTS.refundApprovalLimit,
  updatedBy: row?.updatedBy ?? null,
  updatedAt: row?.updatedAt ?? null
});

export const financeSettingsService = {
  get: async ctx => view(await settings.findOne(ctx.tenantId, [])),

  /* Administrator: change the settings (the row is created on first change) */
  update: async (ctx, changes) => {
    const existing = await settings.findOne(ctx.tenantId, []);
    const values = { ...changes, updatedBy: ctx.userId };
    if (existing) await settings.update(ctx.tenantId, existing.id, values);
    else await settings.create(ctx.tenantId, values);
    return financeSettingsService.get(ctx);
  },

  /* For refunds: up to how much an accountant refunds without approval (0: never) */
  refundApprovalLimit: async (ctx, { dbc } = {}) =>
    (await settings.findOne(ctx.tenantId, [], { dbc }))?.refundApprovalLimit ?? DEFAULTS.refundApprovalLimit
};
