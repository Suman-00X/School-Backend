/* Display helpers shared by the transport submodules */

export const fullName = person => (person ? [person.firstName, person.lastName].filter(Boolean).join(" ") : "");

/* "07:30:00" -> "07:30" */
export const hhmm = time => (time ? String(time).slice(0, 5) : null);

/* Route R1 (or the name when a route has no code) */
export const routeLabel = route => `Route ${route.code ?? route.name}`;

/* "Class 1-A" */
export const classSection = section => (section ? `${section.class?.className ?? ""}-${section.sectionName}` : null);
