const nodemailer = require("nodemailer");
const crypto = require("crypto");

function generateVerificationToken() {
  return crypto.randomBytes(32).toString("hex");
}

function getFrontendUrl() {
  if (process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes("localhost")) {
    return process.env.FRONTEND_URL.trim().replace(/\/+$/, "");
  }
  if (process.env.NODE_ENV === "production") {
    return "https://neocaretelemetry.netlify.app";
  }
  return (process.env.FRONTEND_URL || "http://localhost:5173").trim().replace(/\/+$/, "");
}

async function sendVerificationEmail({ toEmail, recipientName, role, hospitalName, token }) {
  const frontendUrl = getFrontendUrl();
  const verifyUrl = `${frontendUrl}/verify-email?token=${token}`;

  console.log("\n=======================================================");
  console.log(`[EMAIL SERVICE] Preparing Email Verification for ${toEmail}`);
  console.log(`[RECIPIENT] ${recipientName} (${role.toUpperCase()})`);
  if (hospitalName) console.log(`[HOSPITAL] ${hospitalName}`);
  console.log(`[VERIFY LINK] ${verifyUrl}`);

  const smtpHost = process.env.SMTP_HOST ? process.env.SMTP_HOST.trim() : null;
  const smtpUser = process.env.SMTP_USER ? process.env.SMTP_USER.trim() : null;
  const smtpPass = process.env.SMTP_PASS ? process.env.SMTP_PASS.trim() : null;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpSecure = process.env.SMTP_SECURE === "true" || smtpPort === 465;

  let transporter;
  let fromAddress;

  try {
    if (smtpHost && smtpUser && smtpPass) {
      console.log(`[SMTP CONFIG] Host: ${smtpHost}:${smtpPort} | User: ${smtpUser}`);
      
      const transportConfig = {
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      };

      if (smtpHost.includes("gmail")) {
        transportConfig.service = "gmail";
      }

      transporter = nodemailer.createTransport(transportConfig);
      fromAddress = process.env.SMTP_FROM || `"NeoCare Platform" <${smtpUser}>`;
    } else {
      console.log("[SMTP CONFIG] No custom SMTP configured. Using Ethereal dev test account...");
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      fromAddress = `"NeoCare Platform" <${testAccount.user}>`;
    }

    const subject = role === "hospital_admin"
      ? `[NeoCare] Verify Your Hospital Admin Account — ${hospitalName || 'NeoCare'}`
      : `[NeoCare] Verify Your Email Address — ${hospitalName || 'NeoCare'}`;

    const senderText = role === "hospital_admin"
      ? "NeoCare System Administrator"
      : `${hospitalName || "Hospital Admin"} via NeoCare`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <h2 style="color: #0f172a; margin-top: 0;">Welcome to NeoCare Platform</h2>
        <p style="color: #475569; font-size: 15px;">Hello <strong>${recipientName}</strong>,</p>
        <p style="color: #475569; font-size: 15px;">
          You have registered as a <strong>${role.replace('_', ' ').toUpperCase()}</strong> ${hospitalName ? `for <strong>${hospitalName}</strong>` : ''}.
        </p>
        <p style="color: #475569; font-size: 15px;">
          Please click the button below to verify your email address and initiate account activation:
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${verifyUrl}" style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block;">Verify Email Account</a>
        </div>
        ${['doctor', 'nurse'].includes(role) ? `
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px 14px; margin: 18px 0; font-size: 13px; color: #334155; line-height: 1.5;">
            <strong>First-Time Login Note:</strong> You do not need to create a password now. Your Medical / Nursing License Number will serve as your initial login password. Once your account is approved by your Hospital In-Charge, sign in using your email and license number; you will then be prompted to set your personal permanent password.
          </div>
        ` : ''}
        <p style="color: #64748b; font-size: 13px; word-break: break-all;">
          Or copy and paste this link in your browser:<br/>
          <a href="${verifyUrl}" style="color: #0284c7;">${verifyUrl}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">Sent by ${senderText} • NeoCare IoT Neonatal Monitoring</p>
      </div>
    `;

    const info = await transporter.sendMail({
      from: fromAddress,
      to: toEmail,
      subject,
      html: htmlBody,
    });

    console.log(`[EMAIL SENT SUCCESS] Message ID: ${info.messageId}`);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`[ETHEREAL PREVIEW URL] ${previewUrl}`);
    }
    console.log("=======================================================\n");

    return { success: true, emailSent: true, verifyUrl, previewUrl, messageId: info.messageId };
  } catch (err) {
    console.error("[EMAIL SERVICE ERROR] Failed to send email:", err.message);
    if (err.code === "EAUTH") {
      console.error("[SMTP ERROR TROUBLESHOOTING] Authentication failed! If using Gmail, ensure you are using an App Password (not your account password) and that 2FA is enabled.");
    }
    console.log("=======================================================\n");

    return { success: false, emailSent: false, verifyUrl, error: err.message };
  }
}

async function sendStaffWelcomeEmail({ toEmail, recipientName, role, hospitalName, temporaryPassword }) {
  const frontendUrl = getFrontendUrl();
  const loginUrl = `${frontendUrl}/login`;
  const roleLabel = role === "doctor" ? "Attending Physician / Doctor" : "Clinical Duty Nurse";

  console.log("\n=======================================================");
  console.log(`[EMAIL SERVICE] Sending Staff Welcome & Credentials to ${toEmail}`);
  console.log(`[RECIPIENT] ${recipientName} (${role.toUpperCase()})`);
  if (hospitalName) console.log(`[HOSPITAL] ${hospitalName}`);
  console.log(`[LOGIN URL] ${loginUrl}`);
  console.log(`[TEMPORARY PASSWORD] ${temporaryPassword}`);

  const smtpHost = process.env.SMTP_HOST ? process.env.SMTP_HOST.trim() : null;
  const smtpUser = process.env.SMTP_USER ? process.env.SMTP_USER.trim() : null;
  const smtpPass = process.env.SMTP_PASS ? process.env.SMTP_PASS.trim() : null;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpSecure = process.env.SMTP_SECURE === "true" || smtpPort === 465;

  let transporter;
  let fromAddress;

  try {
    if (smtpHost && smtpUser && smtpPass) {
      const transportConfig = {
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      };
      if (smtpHost.includes("gmail")) {
        transportConfig.service = "gmail";
      }
      transporter = nodemailer.createTransport(transportConfig);
      fromAddress = process.env.SMTP_FROM || `"NeoCare Platform" <${smtpUser}>`;
    } else {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      fromAddress = `"NeoCare Platform" <${testAccount.user}>`;
    }

    const subject = `Welcome to NeoCare NICU - Your Clinical Staff Account at ${hospitalName}`;
    const htmlBody = `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
        <div style="border-bottom: 2px solid #e11d48; padding-bottom: 12px; margin-bottom: 20px;">
          <h2 style="color: #0f172a; margin: 0; font-size: 20px;">NeoCare Neonatal Telemetry System</h2>
          <p style="color: #64748b; font-size: 13px; margin: 4px 0 0;">Specialized Clinical Inpatient Management</p>
        </div>
        <p style="color: #334155; font-size: 15px; line-height: 1.5;">Hello <strong>${recipientName}</strong>,</p>
        <p style="color: #334155; font-size: 14px; line-height: 1.5;">
          Your clinical staff account as an <strong>${roleLabel}</strong> has been registered and approved by your Hospital In-Charge at <strong>${hospitalName}</strong>.
        </p>
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 16px; margin: 20px 0;">
          <h4 style="margin: 0 0 10px; color: #0f172a; font-size: 14px;">Your Official Login Credentials:</h4>
          <p style="margin: 4px 0; font-size: 13.5px; color: #334155;"><strong>Login Portal:</strong> Staff (Doctor / Nurse)</p>
          <p style="margin: 4px 0; font-size: 13.5px; color: #334155;"><strong>Login Email:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${toEmail}</code></p>
          <p style="margin: 4px 0; font-size: 13.5px; color: #334155;"><strong>Initial Temporary Password:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; color: #0284c7; font-weight: bold;">${temporaryPassword}</code> (Medical / Nursing License No.)</p>
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${loginUrl}" style="background-color: #0284c7; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
            Sign in to NeoCare Portal
          </a>
        </div>
        <p style="color: #64748b; font-size: 12.5px; line-height: 1.5;">
          <strong>Security Notice:</strong> Your Medical License Number serves as your initial password for first-time login. Immediately upon signing in, you will be prompted to set your personal permanent password for future logins.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">Sent by NeoCare Platform • ${hospitalName}</p>
      </div>
    `;

    const info = await transporter.sendMail({
      from: fromAddress,
      to: toEmail,
      subject,
      html: htmlBody,
    });

    console.log(`[STAFF WELCOME EMAIL SENT] Message ID: ${info.messageId}`);
    return { success: true, emailSent: true, messageId: info.messageId };
  } catch (err) {
    console.error("[STAFF WELCOME EMAIL ERROR] Failed to send email:", err.message);
    return { success: false, emailSent: false, error: err.message };
  }
}

module.exports = { generateVerificationToken, sendVerificationEmail, sendStaffWelcomeEmail };
