import { createRepository } from "../../../../common/database/repository.js";
import { financeSettings } from "../models/financeSettings.schema.js";

export const financeSettingsRepository = createRepository({ table: financeSettings, queryKey: "financeSettings" });
