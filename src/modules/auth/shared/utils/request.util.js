/* Who is signing in from where (kept on the session for "your devices") */
export const clientInfo = req => ({
  userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
  ipAddress: req.ip ?? null
});
