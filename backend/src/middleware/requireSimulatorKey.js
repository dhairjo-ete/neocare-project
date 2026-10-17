// Authenticates the Python simulator as a service, not a human user.
// Deliberately separate from verifyToken/JWT: a machine that needs to poll
// this endpoint continuously and indefinitely shouldn't depend on a 7-day
// user login token that silently expires and breaks patient-vitals gating.
function requireSimulatorKey(req, res, next) {
  const providedKey = req.headers["x-simulator-key"];
  const expectedKey = process.env.SIMULATOR_API_KEY;

  if (!expectedKey) {
    // Fail loudly in the backend logs - a misconfigured server should not
    // silently let an unauthenticated simulator through, nor silently
    // block a correctly configured one with no explanation.
    console.error("[simulator-auth] SIMULATOR_API_KEY is not set in backend .env");
    return res.status(500).json({ error: "Simulator authentication is not configured on the server" });
  }

  if (!providedKey || providedKey !== expectedKey) {
    return res.status(401).json({ error: "Invalid or missing simulator API key" });
  }

  next();
}

module.exports = requireSimulatorKey;
