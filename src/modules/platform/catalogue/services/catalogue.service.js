import { SCHOOL_MODULES } from "../../shared/constants/schoolModules.constants.js";

export const catalogueService = {
  /* Every module a school can be given; core ones are always on */
  list: () => SCHOOL_MODULES.map(({ key, label, description, core = false }) => ({ key, label, description, core }))
};
