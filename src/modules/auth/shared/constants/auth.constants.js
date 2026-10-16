/* Single-use links sent by email */
export const TOKEN_PURPOSES = ["INVITE", "RESET"];

export const TOKEN_TTL_HOURS = { INVITE: 7 * 24, RESET: 1 };

/* Same message for an unknown school, unknown email or wrong password: no account probing */
export const BAD_CREDENTIALS = "The school code, email or password is incorrect";
