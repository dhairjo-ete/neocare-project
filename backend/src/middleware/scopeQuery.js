// Attaches a Mongo filter object (req.scope) that every controller uses when
// querying hospital-scoped collections (wards, incubators, patients, vitals, alerts).
//
// - system_admin: no restriction, sees everything (optionally narrowed by ?hospitalId=).
// - hospital_admin: locked to their own hospitalId.
// - nurse: locked to their own hospitalId, and further to their wardId if one is set.
function scopeQuery(req, res, next) {
  if (req.user.role === "system_admin") {
    req.scope = req.query.hospitalId ? { hospitalId: req.query.hospitalId } : {};
    return next();
  }

  req.scope = { hospitalId: req.user.hospitalId };
  if (req.user.role === "nurse" && req.user.wardId) {
    req.scope.wardId = req.user.wardId;
  }
  next();
}

module.exports = scopeQuery;
