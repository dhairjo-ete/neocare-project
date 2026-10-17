// backend/scripts/repair-orphaned-hospital-links.js
//
// Finds hospital_admin / doctor / nurse accounts whose hospitalId points at
// a Hospital document that no longer exists (most commonly: the hospital
// was deleted and re-registered with the same name but a new _id during
// testing). Run with no arguments to DIAGNOSE only — it prints every broken
// account plus the current list of real hospitals, and changes nothing.
// Run again with --email and --hospital to actually fix one account.
//
// Usage:
//   node backend/scripts/repair-orphaned-hospital-links.js
//   node backend/scripts/repair-orphaned-hospital-links.js --email=admin@dmc.com --hospital="Dinajpur Medical College"
//
// Run from the backend/ directory (or anywhere, paths below are relative to
// this file) so it picks up the same .env the server uses.

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const User = require("../src/models/User");
const Hospital = require("../src/models/Hospital");

function parseArg(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  if (!arg) return null;
  let value = arg.slice(prefix.length);
  // allow --hospital="Quoted Name" from shells that don't strip quotes
  value = value.replace(/^"(.*)"$/, "$1");
  return value;
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set — check backend/.env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const hospitals = await Hospital.find();
  const validHospitalIds = new Set(hospitals.map((h) => String(h._id)));

  const staffRoles = ["hospital_admin", "doctor", "nurse"];
  const staff = await User.find({ role: { $in: staffRoles }, hospitalId: { $ne: null } });
  const orphaned = staff.filter((u) => !validHospitalIds.has(String(u.hospitalId)));

  const email = parseArg("email");
  const hospitalName = parseArg("hospital");

  if (email && hospitalName) {
    const target = hospitals.find((h) => h.name.toLowerCase() === hospitalName.toLowerCase());
    const user = staff.find((u) => u.email.toLowerCase() === email.toLowerCase());

    if (!target) {
      console.log(`No hospital found named "${hospitalName}". Exact spelling required. Current hospitals:`);
      hospitals.forEach((h) => console.log(`  - ${h.name}`));
    } else if (!user) {
      console.log(`No hospital_admin/doctor/nurse account found with email "${email}".`);
    } else {
      const before = user.hospitalId;
      user.hospitalId = target._id;
      await user.save();
      console.log(`Fixed: ${user.name} <${user.email}> — hospitalId ${before} -> ${target._id} ("${target.name}")`);
    }
    await mongoose.disconnect();
    return;
  }

  // Diagnostic mode (no --email/--hospital given)
  if (!orphaned.length) {
    console.log("No orphaned hospital links found — every staff account's hospitalId resolves to a real hospital.");
  } else {
    console.log(`Found ${orphaned.length} orphaned account(s):\n`);
    orphaned.forEach((u) => {
      console.log(`  ${u.role.padEnd(14)} ${u.name.padEnd(25)} <${u.email}>  dangling hospitalId: ${u.hospitalId}`);
    });
    console.log(`\nCurrent hospitals in the system:`);
    hospitals.forEach((h) => console.log(`  - ${h.name}  (${h._id})`));
    console.log(`\nTo fix one, run:`);
    console.log(`  node backend/scripts/repair-orphaned-hospital-links.js --email=<their email> --hospital="<exact hospital name>"`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
