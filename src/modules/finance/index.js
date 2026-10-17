import { createRouter } from "../../common/http/router.js";
import { activityRoutes } from "../../common/audit/activity.routes.js";
import { feeHeadRoutes } from "./fee-heads/index.js";
import { installmentPlanRoutes, planAssignmentRoutes } from "./installment-plans/index.js";
import { lateFeeRuleRoutes } from "./late-fee-rules/index.js";
import { feeStructureRoutes } from "./fee-structures/index.js";
import { concessionGrantRoutes, concessionRoutes } from "./concessions/index.js";
import { invoiceRoutes, statementRoutes } from "./invoices/index.js";
import { invoicePaymentRoutes, paymentRoutes, refundRoutes, studentRefundRoutes } from "./payments/index.js";
import { invoiceCreditRoutes, studentCreditRoutes } from "./credits/index.js";
import { paymentSettingsRoutes } from "./payment-settings/index.js";
import { ledgerRoutes } from "./ledger/index.js";
import { financeSettingsRoutes } from "./settings/index.js";
import { settlementRoutes } from "./settlements/index.js";

/* Finance module, mounted at /api/v1/finance */
const router = createRouter();

/* The module's activity log (first: no other path may capture it) */
router.use("/activity", activityRoutes("finance"));

router.use("/fee-heads", feeHeadRoutes);
router.use("/installment-plans", installmentPlanRoutes);
router.use("/plan-assignments", planAssignmentRoutes);
router.use("/late-fee-rules", lateFeeRuleRoutes);
router.use("/fee-structures", feeStructureRoutes);
router.use("/concessions", concessionRoutes);
router.use("/concession-grants", concessionGrantRoutes);
router.use("/invoices", invoicePaymentRoutes);
router.use("/invoices", invoiceCreditRoutes);
router.use("/invoices", invoiceRoutes);
router.use("/payments", paymentRoutes);
router.use("/refunds", refundRoutes);
router.use("/students", statementRoutes);
router.use("/students", studentCreditRoutes);
router.use("/students", studentRefundRoutes);
router.use("/payment-settings", paymentSettingsRoutes);
router.use("/ledger", ledgerRoutes);
router.use("/settings", financeSettingsRoutes);
router.use("/settlements", settlementRoutes);

export default router;
