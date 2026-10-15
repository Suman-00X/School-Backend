import { createRouter } from "./common/http/router.js";
import { authenticate } from "./common/auth/authenticate.middleware.js";
import { auditTrail } from "./common/audit/audit.middleware.js";
import usersModule from "./modules/users/index.js";
import academicsModule from "./modules/academics/index.js";
import portalModule from "./modules/portal/index.js";
import administrationModule from "./modules/administration/index.js";
import financeModule from "./modules/finance/index.js";
import communicationModule from "./modules/communication/index.js";
import { paymentWebhookRoutes } from "./modules/finance/payments/index.js";

/* API v1, mounted at /api/v1. Every route needs a valid token,
   and every successful write is recorded in the audit trail. */
const v1 = createRouter();

/* Public endpoints (no token): verified by other means, e.g. webhook signatures */
v1.use("/public/payments", paymentWebhookRoutes);

v1.use(authenticate);
v1.use(auditTrail);

v1.use("/users", usersModule);
v1.use("/academics", academicsModule);
v1.use("/me", portalModule);
v1.use("/administration", administrationModule);
v1.use("/finance", financeModule);
v1.use("/communication", communicationModule);

export default v1;
