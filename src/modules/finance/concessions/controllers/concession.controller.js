import { createCrudController } from "../../../../common/crud/crudController.js";
import { created, ok, paginated } from "../../../../common/http/responses.js";
import { concessionService } from "../services/concession.service.js";

const crud = createCrudController(concessionService, {
  singular: "Concession",
  plural: "Concessions",
  idParam: "concessionId"
});

const number = value => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(value);

/* "Sibling (10%)", "Merit (5,000.00 a year)" */
const describe = ({ name, concessionType, value }) =>
  `${name} (${concessionType === "PERCENT" ? `${value}%` : `${number(value)} a year`})`;

const recalculated = invoices =>
  invoices.length ? `. ${invoices.length} unpaid invoice(s) recalculated: ${invoices.join(", ")}` : "";

export const concessionController = {
  ...crud,

  grant: async (req, res) => {
    const grant = await concessionService.grant(req.context, req.body);
    return created(
      res,
      grant,
      `${describe(grant.concession)} granted to ${grant.studentName}${recalculated(grant.recalculatedInvoices)}`
    );
  },

  listGrants: async (req, res) =>
    paginated(
      res,
      await concessionService.listGrants(req.context, req.query),
      "Concession grants retrieved successfully"
    ),

  revoke: async (req, res) => {
    const grant = await concessionService.revoke(req.context, req.params.grantId);
    return ok(
      res,
      grant,
      `${grant.concession.name} revoked for ${grant.studentName}${recalculated(grant.recalculatedInvoices)}`
    );
  }
};
