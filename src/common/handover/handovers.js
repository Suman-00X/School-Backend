/* Records a person is responsible for in a module (a hostel's warden, a desk's in-charge),
   passed on when someone hands over their work (administration/access handovers).
   A module implements a handler and the application registers it at start-up, so the
   framework never imports module code:

     registerHandover("hostel", {
       kind: "hostelWardens",
       label: "Hostels (warden)",
       reassign: (ctx, { fromUserId, toUser }, { dbc }) => [{ id, name }, ...]
     });

   reassign() runs inside the handover's transaction (dbc), moves every record where fromUserId
   is the responsible person to toUser (an active employee account: refuse with unprocessable()
   if they cannot take it), and returns what it moved. It only ever changes who is responsible
   now: who-did-what history (createdBy, recordedBy, approvedBy, issuedBy...) is never rewritten. */

const handlers = new Map();

export const registerHandover = (module, handler) => {
  if (!handler?.kind || !handler.label || typeof handler.reassign !== "function") {
    throw new Error(`registerHandover(${module}): expects { kind, label, reassign }`);
  }
  const registered = handlers.get(module) ?? [];
  if (registered.some(existing => existing.kind === handler.kind)) {
    throw new Error(`Handover ${module}.${handler.kind} is registered twice`);
  }
  handlers.set(module, [...registered, handler]);
};

/* -> the module's handlers, in registration order */
export const handoversOf = module => handlers.get(module) ?? [];
