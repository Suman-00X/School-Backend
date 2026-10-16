import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { loanController as controller } from "../controllers/loan.controller.js";
import { LOAN_PERMISSIONS as can } from "../permissions/loan.permissions.js";
import { loanValidators as rules } from "../validators/loan.validator.js";

/* /api/v1/library/loans: circulation */
export const loanRoutes = createRouter();

loanRoutes.post("/", authorize(can.circulate), validate(rules.issue), controller.issue);
loanRoutes.get("/", authorize(can.read), validate(rules.list), controller.list);
loanRoutes.get("/:loanId", authorize(can.read), validate(rules.getById), controller.getById);
loanRoutes.post("/:loanId/return", authorize(can.circulate), validate(rules.returnLoan), controller.returnLoan);
/* A lost copy came back (lost-and-found) */
loanRoutes.post("/:loanId/recovery", authorize(can.circulate), validate(rules.recordFound), controller.recordFound);
loanRoutes.post("/:loanId/renewal", authorize(can.circulate), validate(rules.renew), controller.renew);
loanRoutes.post("/:loanId/fine-payment", authorize(can.circulate), validate(rules.payFine), controller.payFine);
loanRoutes.post("/:loanId/fine-waiver", authorize(can.waiveFine), validate(rules.waiveFine), controller.waiveFine);

/* /api/v1/library/borrowers/:userId/account: loans out, fines, credit and blocks */
export const borrowerRoutes = createRouter();

borrowerRoutes.get("/:userId/account", authorize(can.read), validate(rules.account), controller.account);

/* /api/v1/library/my-loans: the signed-in person's loans and history (a parent: their children's) */
export const myLoanRoutes = createRouter();

myLoanRoutes.get("/", authorize(can.readOwn), validate(rules.myLoans), controller.myLoans);

/* /api/v1/library/my-fines: the signed-in person's library account (a parent: each child's) */
export const myFineRoutes = createRouter();

myFineRoutes.get("/", authorize(can.readOwn), validate(rules.myFines), controller.myFines);
