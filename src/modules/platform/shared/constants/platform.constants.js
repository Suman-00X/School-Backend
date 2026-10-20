/* Operator sessions: a signed token, no refresh. A disabled operator's token stops working
   on the next request (the operator is read on every request). */
export const OPERATOR_SESSION_HOURS = 8;

export const OPERATOR_TOKEN_TYPE = "platform";

export const BAD_OPERATOR_CREDENTIALS = "The email or password is incorrect";
