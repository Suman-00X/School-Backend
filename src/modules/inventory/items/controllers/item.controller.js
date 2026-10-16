import { createCrudController } from "../../../../common/crud/crudController.js";
import { itemService } from "../services/item.service.js";

export const itemController = createCrudController(itemService, {
  singular: "Item",
  plural: "Items",
  idParam: "itemId"
});
