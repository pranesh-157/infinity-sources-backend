const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();
setGlobalOptions({ maxInstances: 10 });

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

exports.sendAdminOrderEmail = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");

  const userDoc = await admin.firestore().collection("users").doc(uid).get();
  if (!userDoc.exists) throw new HttpsError("permission-denied", "User profile not found.");

  const order = request.data?.order;
  if (!order || !order.id) throw new HttpsError("invalid-argument", "Valid order payload required.");

  const to = process.env.ADMIN_ORDER_EMAIL || "sanjay_nagarajan@icloud.com";
  const subject = `New order ${order.id} from ${order?.customer?.name || "Customer"}`;
  const body = order?.emailSummary?.body || JSON.stringify(order, null, 2);
  const transporter = getTransport();

  await admin.firestore().collection("emails").add({
    to,
    subject,
    body,
    orderId: order.id,
    fromUid: uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (!transporter) {
    logger.warn("SMTP not configured. Email stored only in Firestore.");
    return { ok: true, delivered: false, reason: "SMTP not configured" };
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text: body,
  });

  return { ok: true, delivered: true };
});
