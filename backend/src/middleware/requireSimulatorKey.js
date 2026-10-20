// Authenticates the Python simulator as a service, not a human user.
// Deliberately separate from verifyToken/JWT: a machine that needs to poll
// this endpoint continuously and indefinitely shouldn't depend on a 7-day
// user login token that silently expires and breaks patient-vitals gating.
function requireSimulatorKey(req, res, next) {
  const providedKey = req.headers["x-simulator-key"];
  const expectedKey = process.env.SIMULATOR_API_KEY || "ed463d8850234555380868a6f20cc1b30d430157e528a76bde925dbf5697107b";

  if (!providedKey || providedKey !== expectedKey) {
    return res.status(401).json({ error: "Invalid or missing simulator API key" });
  }

  next();
}

module.exports = requireSimulatorKey;
