/* academics/substitutions: covering an absent teacher's lessons on a date (a substitute,
   an activity, or leisure); an unplanned lesson is a leisure period */
export { default as substitutionRoutes } from "./routes/substitution.routes.js";
export {
  substitutionService,
  SUBSTITUTION_ASSIGNED,
  SUBSTITUTION_CANCELLED
} from "./services/substitution.service.js";
