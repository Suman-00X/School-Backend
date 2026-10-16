import { createCrudController } from "../../../../common/crud/crudController.js";
import { vendorService } from "../services/vendor.service.js";

export const vendorController = createCrudController(vendorService, {
  singular: "Vendor",
  plural: "Vendors",
  idParam: "vendorId"
});
