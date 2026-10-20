/* System admins (the people who own the platform) sign in to the admin console with a
   session cookie: httpOnly (page scripts cannot read it), SameSite=Strict, sent only to
   /api/v1/platform. It lasts a working day; signing out ends every session of that admin. */
export const SESSION_HOURS = 8;

export const SESSION_COOKIE = "system_admin_session";

export const SESSION_COOKIE_PATH = "/api/v1/platform";

export const SESSION_TOKEN_TYPE = "platform";

export const BAD_CREDENTIALS = "The email or password is incorrect";

export const SESSION_ENDED = "Your session has ended. Please sign in again.";
