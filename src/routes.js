import { createRouter } from "./common/http/router.js";
import { authenticate } from "./common/auth/authenticate.middleware.js";
import { auditTrail, registerAuditActor } from "./common/audit/audit.middleware.js";
import { tenantContext } from "./common/tenancy/tenantContext.middleware.js";
import { registerGrantsResolver } from "./common/auth/grants.js";
import { registerHandover } from "./common/handover/handovers.js";
import usersModule from "./modules/users/index.js";
import academicsModule from "./modules/academics/index.js";
import portalModule from "./modules/portal/index.js";
import administrationModule from "./modules/administration/index.js";
import financeModule from "./modules/finance/index.js";
import communicationModule from "./modules/communication/index.js";
import reportsModule from "./modules/reports/index.js";
import filesModule from "./modules/files/index.js";
import hostelModule from "./modules/hostel/index.js";
import libraryModule from "./modules/library/index.js";
import hrModule from "./modules/hr/index.js";
import transportModule from "./modules/transport/index.js";
import inventoryModule from "./modules/inventory/index.js";
import { authRoutes, publicAuthRoutes } from "./modules/auth/index.js";
import { paymentWebhookRoutes } from "./modules/finance/payments/index.js";
import { accessGrants } from "./modules/administration/access/index.js";
import { accountService } from "./modules/users/accounts/index.js";
import { wardenHandover } from "./modules/hostel/hostels/index.js";
import agentToolRoutes from "./common/agent-tools/agentTools.routes.js";
import mcpRoutes from "./common/agent-tools/mcp.routes.js";
/* Registers every module's agent tools */
import "./agentTools.js";

/* authorize() also honours operator roles and module ownership (administration/access) */
registerGrantsResolver(accessGrants.resolve);

/* Handovers (administration/access) also pass on the records a person is responsible for */
registerHandover("hostel", wardenHandover);

/* Audit entries keep a snapshot of who acted */
registerAuditActor(ctx => accountService.actorOf(ctx, ctx.userId));

/* API v1, mounted at /api/v1. Every route needs a valid token,
   and every successful write is recorded in the audit trail. */
const v1 = createRouter();

/* Public endpoints (no token): verified by other means, e.g. webhook signatures */
v1.use("/public/payments", paymentWebhookRoutes);
v1.use("/auth", publicAuthRoutes);

v1.use(authenticate);
/* Database per school: everything below runs in the signed-in user's school databases */
v1.use(tenantContext);
v1.use(auditTrail);

v1.use("/auth", authRoutes);
v1.use("/users", usersModule);
v1.use("/academics", academicsModule);
v1.use("/me", portalModule);
v1.use("/administration", administrationModule);
v1.use("/finance", financeModule);
v1.use("/communication", communicationModule);
v1.use("/reports", reportsModule);
v1.use("/files", filesModule);
v1.use("/hostel", hostelModule);
v1.use("/library", libraryModule);
v1.use("/hr", hrModule);
v1.use("/transport", transportModule);
v1.use("/inventory", inventoryModule);

/* AI agents: the modules' tools over REST and MCP, as the signed-in user */
v1.use("/agent-tools", agentToolRoutes);
v1.use("/mcp", mcpRoutes);

export default v1;
