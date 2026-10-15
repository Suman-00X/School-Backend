import { createRouter } from "../../common/http/router.js";
import { libraryPolicyRoutes } from "./policy/index.js";
import { bookRoutes } from "./books/index.js";
import { bookCopyRoutes, copyRoutes } from "./copies/index.js";
import { loanRoutes, myLoanRoutes } from "./loans/index.js";

/* Library module, mounted at /api/v1/library */
const router = createRouter();

router.use("/policy", libraryPolicyRoutes);
router.use("/books", bookCopyRoutes);
router.use("/books", bookRoutes);
router.use("/copies", copyRoutes);
router.use("/loans", loanRoutes);
router.use("/my-loans", myLoanRoutes);

export default router;
