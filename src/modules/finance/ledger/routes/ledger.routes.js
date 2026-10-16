import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { ledgerController as controller } from "../controllers/ledger.controller.js";
import { LEDGER_PERMISSIONS as can } from "../permissions/ledger.permissions.js";
import { ledgerValidators as rules } from "../validators/ledger.validator.js";

/* /api/v1/finance/ledger: chart of accounts, journal, trial balance, income summary */
const router = createRouter();

router.get("/accounts", authorize(can.read), validate(rules.listAccounts), controller.listAccounts);
router.post("/accounts", authorize(can.manageAccounts), validate(rules.createAccount), controller.createAccount);
router.get("/accounts/:accountId", authorize(can.read), validate(rules.getAccount), controller.getAccount);
router.patch(
  "/accounts/:accountId",
  authorize(can.manageAccounts),
  validate(rules.updateAccount),
  controller.updateAccount
);
router.delete(
  "/accounts/:accountId",
  authorize(can.manageAccounts),
  validate(rules.removeAccount),
  controller.removeAccount
);
/* The account's lines with a running balance */
router.get("/accounts/:accountId/ledger", authorize(can.read), validate(rules.accountLedger), controller.accountLedger);

router.get("/journal-entries", authorize(can.read), validate(rules.listEntries), controller.listEntries);
router.post("/journal-entries", authorize(can.post), validate(rules.createEntry), controller.createEntry);
router.get("/journal-entries/:entryId", authorize(can.read), validate(rules.getEntry), controller.getEntry);
router.post(
  "/journal-entries/:entryId/reversal",
  authorize(can.post),
  validate(rules.reverseEntry),
  controller.reverseEntry
);

router.get("/trial-balance", authorize(can.read), validate(rules.trialBalance), controller.trialBalance);
router.get("/income-summary", authorize(can.read), validate(rules.incomeSummary), controller.incomeSummary);

export default router;
