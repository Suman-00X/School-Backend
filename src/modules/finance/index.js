import { createRouter } from "../../common/http/router.js";
import { feeHeadRoutes } from "./fee-heads/index.js";
import { feeStructureRoutes } from "./fee-structures/index.js";
import { concessionGrantRoutes, concessionRoutes } from "./concessions/index.js";
import { invoiceRoutes, statementRoutes } from "./invoices/index.js";
import { invoicePaymentRoutes, paymentRoutes } from "./payments/index.js";

/* Finance module, mounted at /api/v1/finance */
const router = createRouter();

router.use("/fee-heads", feeHeadRoutes);
router.use("/fee-structures", feeStructureRoutes);
router.use("/concessions", concessionRoutes);
router.use("/concession-grants", concessionGrantRoutes);
router.use("/invoices", invoicePaymentRoutes);
router.use("/invoices", invoiceRoutes);
router.use("/payments", paymentRoutes);
router.use("/students", statementRoutes);

export default router;
