import env from "../../../../common/config/env.config.js";

/* Links point at the web app, which posts the token back to /auth/password-resets */
const link = (path, token, schoolCode) =>
  `${env.webAppUrl.replace(/\/$/, "")}/${path}?token=${encodeURIComponent(token)}&school=${encodeURIComponent(schoolCode)}`;

export const authEmails = {
  invite: ({ user, school, token, hours }) => ({
    to: user.email,
    subject: `Your ${school.name} account`,
    text: [
      `Hello ${user.firstName},`,
      "",
      `${school.name} has created an account for you. Set your password to sign in:`,
      link("set-password", token, school.code),
      "",
      `School code: ${school.code}`,
      `Email: ${user.email}`,
      "",
      `This link works once and expires in ${Math.round(hours / 24)} days.`
    ].join("\n")
  }),

  reset: ({ user, school, token, hours }) => ({
    to: user.email,
    subject: `Reset your ${school.name} password`,
    text: [
      `Hello ${user.firstName},`,
      "",
      "We received a request to reset your password. Choose a new one here:",
      link("reset-password", token, school.code),
      "",
      `This link works once and expires in ${hours} hour(s). If you did not ask for this, ignore this email; your password stays the same.`
    ].join("\n")
  }),
  emailChanged: ({ user, school, oldEmail, newEmail }) => ({
    to: oldEmail,
    subject: `The email on your ${school.name} account was changed`,
    text: [
      `Hello ${user.firstName},`,
      "",
      `The sign-in email of your ${school.name} account was changed from ${oldEmail} to ${newEmail}, and every device was signed out.`,
      "If you did not ask the school for this, contact the school office right away."
    ].join("\n")
  })
};
