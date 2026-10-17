import { createRouter } from "../../common/http/router.js";
import { activityRoutes } from "../../common/audit/activity.routes.js";
import { libraryPolicyRoutes } from "./policy/index.js";
import { circulationRuleRoutes } from "./circulation-rules/index.js";
import { bookRoutes, catalogueRoutes } from "./books/index.js";
import { bookCopyRoutes, copyRoutes } from "./copies/index.js";
import { borrowerRoutes, loanRoutes, myFineRoutes, myLoanRoutes } from "./loans/index.js";
import { holdRoutes, myHoldRoutes } from "./holds/index.js";
import { stockCheckRoutes } from "./stock-checks/index.js";
import { libraryReportRoutes } from "./reports/index.js";

/* Library module, mounted at /api/v1/library */
const router = createRouter();

/* The module's activity log (first: no other path may capture it) */
router.use("/activity", activityRoutes("library"));

router.use("/policy", libraryPolicyRoutes);
router.use("/circulation-rules", circulationRuleRoutes);
router.use("/catalogue", catalogueRoutes);
router.use("/books", bookCopyRoutes);
router.use("/books", bookRoutes);
router.use("/copies", copyRoutes);
router.use("/loans", loanRoutes);
router.use("/holds", holdRoutes);
router.use("/borrowers", borrowerRoutes);
router.use("/stock-checks", stockCheckRoutes);
router.use("/reports", libraryReportRoutes);
/* Self-service */
router.use("/my-loans", myLoanRoutes);
router.use("/my-holds", myHoldRoutes);
router.use("/my-fines", myFineRoutes);

export default router;
