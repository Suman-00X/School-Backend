/* Messages captured by the `memory` email/SMS drivers (tests) */
export const outbox = {
  email: [],
  sms: [],
  clear() {
    this.email.length = 0;
    this.sms.length = 0;
  }
};
