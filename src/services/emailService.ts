import nodemailer from "nodemailer";

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export const isSmtpConfigured = (): boolean => {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD
  );
};

export const sendTransactionalEmail = async (options: EmailOptions): Promise<boolean> => {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const secure = process.env.SMTP_SECURE === "true"; // true for 465, false for other ports
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const fromEmail = process.env.SMTP_FROM_EMAIL || "noreply@uaipertim.com.br";
  const fromName = process.env.SMTP_FROM_NAME || "UaiPertim";

  if (!host || !user || !pass) {
    console.warn("SMTP email credentials are not fully configured on the server.");
    return false;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email successfully sent to ${options.to}`);
    return true;
  } catch (error) {
    console.error("Error sending email via Nodemailer:", error);
    throw error;
  }
};
