import { BrevoClient } from '@getbrevo/brevo';
import { formatPrice } from '../src/utils/format';

let brevoClient: BrevoClient | null = null;
let cachedApiKey: string | undefined = undefined;

// Safe error logger that classifies Brevo API errors without exposing API keys or secrets
function logSafeBrevoError(error: any, toEmail: string): string {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const rawMessage = error?.message || String(error);
  const statusCode = error?.statusCode || error?.status || error?.response?.status;
  const body = error?.body || error?.response?.data;

  // Sanitize message to strip API key if it appears anywhere in output
  let safeMessage = rawMessage.split('\n')[0];
  if (apiKey && apiKey.length > 4) {
    safeMessage = safeMessage.split(apiKey).join('[REDACTED_API_KEY]');
  }

  let safeBodyStr = '';
  if (body) {
    const rawBody = typeof body === 'object' ? JSON.stringify(body) : String(body);
    safeBodyStr = apiKey && apiKey.length > 4 ? rawBody.split(apiKey).join('[REDACTED_API_KEY]') : rawBody;
  }

  let failureCategory = 'General Brevo API Failure';
  let userFriendlyError = 'Failed to send verification email via Brevo. Please try again later.';

  if (statusCode === 401 || (body && typeof body === 'object' && (body as any).code === 'unauthorized')) {
    failureCategory = 'Authentication Failed (Check BREVO_API_KEY)';
    userFriendlyError = 'Email authentication failed: Invalid or missing Brevo API key.';
  } else if (statusCode === 400) {
    failureCategory = 'Bad Request / Unverified Sender (Check BREVO_SENDER_EMAIL)';
    userFriendlyError = 'Brevo rejected email request. Ensure BREVO_SENDER_EMAIL is a verified sender in your Brevo account.';
  } else if (statusCode === 402) {
    failureCategory = 'Quota / Payment Required';
    userFriendlyError = 'Brevo email quota reached or subscription plan required.';
  } else if (statusCode === 429) {
    failureCategory = 'Rate Limit Exceeded';
    userFriendlyError = 'Brevo request rate limit exceeded. Please wait a moment and try again.';
  } else if (
    safeMessage.toLowerCase().includes('timeout') ||
    safeMessage.toLowerCase().includes('enotfound') ||
    safeMessage.toLowerCase().includes('econnrefused')
  ) {
    failureCategory = 'Network / Connection Timeout';
    userFriendlyError = 'Connection to Brevo API timed out. Please try again.';
  }

  // Mask recipient address for privacy (e.g. j***g@gmail.com)
  const maskedTo = toEmail.replace(/^([^@]{1,2})[^@]*(@.*)$/, '$1***$2');
  console.error(`[Brevo Email Service - ${failureCategory}] Recipient: ${maskedTo} | HTTP: ${statusCode || 'UNKNOWN'} | Details: ${safeMessage}${safeBodyStr ? ` | Response: ${safeBodyStr}` : ''}`);

  return userFriendlyError;
}

export function getBrevoClient(): BrevoClient | null {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  if (brevoClient && cachedApiKey === apiKey) {
    return brevoClient;
  }

  try {
    brevoClient = new BrevoClient({ apiKey });
    cachedApiKey = apiKey;
    return brevoClient;
  } catch (err) {
    console.error('[Brevo Email Service] Error initializing BrevoClient:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function sendVerificationEmail(
  toEmail: string,
  code: string,
  purpose: string = 'signup'
): Promise<{ sent: boolean; messageId?: string; previewCode: string; error?: string }> {
  const isReset = purpose === 'reset' || purpose === 'forgot-password';
  console.log(`\n==============================================`);
  console.log(`🔐 [GIP'S KITCHEN ${isReset ? 'PASSWORD RESET' : 'AUTH'} CODE FOR: ${toEmail}]`);
  console.log(`✨ VERIFICATION CODE: ${code}`);
  console.log(`⏳ Valid for 10 minutes.`);
  console.log(`==============================================\n`);

  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || 'Gips Kitchen';

  if (!apiKey) {
    const errorMsg = 'BREVO_API_KEY is not configured in environment variables.';
    console.warn(`[Brevo Email Service] ${errorMsg}`);
    return { sent: false, previewCode: code, error: errorMsg };
  }

  if (!senderEmail) {
    const errorMsg = 'BREVO_SENDER_EMAIL is not configured in environment variables.';
    console.warn(`[Brevo Email Service] ${errorMsg}`);
    return { sent: false, previewCode: code, error: errorMsg };
  }

  const client = getBrevoClient();
  if (!client) {
    const errorMsg = 'Failed to initialize Brevo email client.';
    return { sent: false, previewCode: code, error: errorMsg };
  }

  const startTime = Date.now();

  try {
    const subTitle = isReset ? 'Food & Drinks • Password Recovery' : 'Food & Drinks • Account Verification';
    const introText = isReset
      ? 'Here is your 6-digit verification code to reset your password:'
      : 'Here is your 6-digit verification code to complete your registration:';
    const emailSubject = isReset
      ? `${code} is your Gip's Kitchen password reset code`
      : `${code} is your Gip's Kitchen verification code`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f7f7;">
        <div style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e5e5e5; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          
          <!-- Header with brand color -->
          <div style="background-color: #1a1a1a; padding: 28px 24px; text-align: center; border-bottom: 3px solid #ff5500;">
            <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 900; letter-spacing: 1px;">
              GIP'S <span style="color: #ff5500;">KITCHEN</span>
            </h1>
            <p style="color: #a3a3a3; margin: 6px 0 0; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 600;">
              ${subTitle}
            </p>
          </div>

          <!-- Main Content -->
          <div style="padding: 32px 24px; text-align: center;">
            <p style="color: #333333; font-size: 15px; margin: 0 0 16px; font-weight: 500;">
              ${introText}
            </p>

            <!-- Code Box -->
            <div style="background-color: #fff8f5; border: 2px dashed #ff5500; border-radius: 12px; padding: 20px; margin: 20px 0; display: inline-block; min-width: 220px;">
              <span style="font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #ff5500; font-family: 'Courier New', Courier, monospace; display: block;">
                ${code}
              </span>
            </div>

            <p style="color: #737373; font-size: 13px; margin: 16px 0 0; line-height: 1.5;">
              ⏱️ This code will expire in <strong>10 minutes</strong>.<br>
              For your security, never share this code with anyone.
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color: #fafafa; padding: 18px 24px; text-align: center; border-top: 1px solid #eeeeee;">
            <p style="color: #a3a3a3; font-size: 11px; margin: 0; line-height: 1.4;">
              If you didn't request this verification code, you can safely ignore this email.<br>
              © ${new Date().getFullYear()} Gip's Kitchen Food & Drinks. All rights reserved.
            </p>
          </div>

        </div>
      </body>
      </html>
    `;

    const textContent = `Your Gip's Kitchen verification code is: ${code}. It expires in 10 minutes. If you did not request this, please ignore this email.`;

    const response = await client.transactionalEmails.sendTransacEmail({
      sender: {
        name: senderName,
        email: senderEmail
      },
      to: [{ email: toEmail }],
      subject: emailSubject,
      textContent,
      htmlContent
    });

    const elapsed = Date.now() - startTime;
    const messageId = response?.messageId || (Array.isArray(response?.messageIds) ? response.messageIds[0] : undefined);

    // Only report that the email was successfully sent after Brevo's API accepts the request successfully
    if (messageId || response) {
      console.log(`[Brevo Email Service] Verification email accepted by Brevo for ${toEmail} in ${elapsed}ms. MessageId: ${messageId || 'OK'}`);
      return { sent: true, messageId, previewCode: code };
    } else {
      console.warn(`[Brevo Email Service] Brevo API responded without messageId confirmation.`);
      return { sent: false, previewCode: code, error: 'Brevo API did not return delivery confirmation.' };
    }
  } catch (err: any) {
    const errorMsg = logSafeBrevoError(err, toEmail);
    return { sent: false, previewCode: code, error: errorMsg };
  }
}

export function extractCustomerEmail(order: any): string | null {
  if (!order) return null;
  const candidates = [
    order.customer?.email,
    order.userEmail,
    order.email,
    order.customerEmail
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (
        trimmed.includes('@') &&
        !trimmed.toLowerCase().includes('anonymous') &&
        !trimmed.toLowerCase().includes('pos@gipskitchen')
      ) {
        return trimmed;
      }
    }
  }
  return null;
}

export async function sendOrderStatusEmail(
  order: any,
  status: 'Processing' | 'Ready for Pickup'
): Promise<{ sent: boolean; messageId?: string; error?: string }> {
  // Defensive check: Do not send email for Cooking or any other status
  if (status !== 'Processing' && status !== 'Ready for Pickup') {
    return { sent: false, error: `No email notification configured for status: ${status}` };
  }

  const toEmail = extractCustomerEmail(order);
  if (!toEmail) {
    console.log(`[Order Email Service] No registered customer email found for Order #${order.id}. Notification skipped.`);
    return { sent: false, error: 'No registered customer email found' };
  }

  console.log(`\n==============================================`);
  console.log(`📧 [GIP'S KITCHEN ORDER STATUS NOTIFICATION]`);
  console.log(`📦 Order: #${order.id}`);
  console.log(`🎯 Status: ${status}`);
  console.log(`👤 Customer: ${order.customer?.name || order.userName || 'Customer'} (${toEmail})`);
  console.log(`==============================================\n`);

  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || 'Gips Kitchen';

  if (!apiKey || !senderEmail) {
    const errorMsg = 'BREVO_API_KEY or BREVO_SENDER_EMAIL is not configured in environment variables.';
    console.warn(`[Order Email Service] ${errorMsg}`);
    return { sent: false, error: errorMsg };
  }

  const client = getBrevoClient();
  if (!client) {
    const errorMsg = 'Failed to initialize Brevo email client.';
    return { sent: false, error: errorMsg };
  }

  const customerName = order.customer?.name || order.userName || 'Valued Customer';
  const orderId = order.id;
  const items = Array.isArray(order.items) ? order.items : [];
  const formattedTotal = formatPrice(order.total || 0);

  const itemsHtml = items.map((item: any) => `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px; font-weight: 600;">
        ${item.name || 'Item'}
        <span style="color: #64748b; font-weight: normal; font-size: 13px;"> × ${item.quantity || 1}</span>
      </td>
      <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: 700; text-align: right;">
        ${formatPrice((Number(item.price) || 0) * (Number(item.quantity) || 1))}
      </td>
    </tr>
  `).join('');

  const itemsText = items.map((item: any) => 
    `- ${item.name || 'Item'} x${item.quantity || 1}: ${formatPrice((Number(item.price) || 0) * (Number(item.quantity) || 1))}`
  ).join('\n');

  let emailSubject = '';
  let statusBadgeHtml = '';
  let statusHeadline = '';
  let statusMessageHtml = '';
  let statusActionBoxHtml = '';
  let statusTextSummary = '';

  if (status === 'Processing') {
    emailSubject = `Your Gip's Kitchen Order #${orderId} is Confirmed & Being Processed`;
    statusBadgeHtml = `
      <div style="display: inline-block; background-color: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe; border-radius: 9999px; padding: 6px 18px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px;">
        Order Confirmed & Processing
      </div>
    `;
    statusHeadline = 'Your Order Has Been Confirmed!';
    statusMessageHtml = `
      <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        Hi <strong>${customerName}</strong>,
      </p>
      <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        Great news! Your order <strong>#${orderId}</strong> has been confirmed by our store and is now being processed by our kitchen team.
      </p>
    `;
    statusActionBoxHtml = `
      <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 14px 18px; border-radius: 8px; margin: 20px 0; text-align: left;">
        <p style="color: #166534; font-size: 13px; font-weight: 600; margin: 0; line-height: 1.5;">
          👨‍🍳 <strong>Kitchen Status:</strong> Your order has entered our kitchen queue and will be prepared fresh. We will send you another email as soon as your order is ready for pickup!
        </p>
      </div>
    `;
    statusTextSummary = `Your order #${orderId} has been confirmed by Gip's Kitchen and is now being processed. We will send you another email when it is ready for pickup.`;
  } else if (status === 'Ready for Pickup') {
    emailSubject = `Ready for Pickup! Your Gip's Kitchen Order #${orderId} is Ready`;
    statusBadgeHtml = `
      <div style="display: inline-block; background-color: #faf5ff; color: #7e22ce; border: 1px solid #e9d5ff; border-radius: 9999px; padding: 6px 18px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px;">
        Ready for Pickup 🛍️
      </div>
    `;
    statusHeadline = 'Your Order is Ready for Pickup!';
    statusMessageHtml = `
      <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        Hi <strong>${customerName}</strong>,
      </p>
      <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        Your order <strong>#${orderId}</strong> has been freshly prepared, packed, and is now ready for you to pick up at Gip's Kitchen!
      </p>
    `;
    statusActionBoxHtml = `
      <div style="background-color: #faf5ff; border: 2px dashed #9333ea; border-radius: 12px; padding: 18px 20px; margin: 20px 0; text-align: center;">
        <span style="font-size: 32px; display: block; margin-bottom: 6px;">🛍️</span>
        <p style="color: #6b21a8; font-size: 16px; font-weight: 900; margin: 0 0 6px;">Available at Pickup Counter</p>
        <p style="color: #4c1d95; font-size: 13px; line-height: 1.5; margin: 0;">
          Please present your Order ID: <strong style="font-size: 15px; letter-spacing: 0.5px;">#${orderId}</strong> or your name (<strong>${customerName}</strong>) to our staff upon pickup.
        </p>
      </div>
    `;
    statusTextSummary = `Your order #${orderId} is ready for pickup at Gip's Kitchen! Please present your Order ID #${orderId} or your name (${customerName}) when claiming your items.`;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 24px 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f7f7;">
      <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e5e5e5; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
        
        <!-- Header with brand color -->
        <div style="background-color: #1a1a1a; padding: 28px 24px; text-align: center; border-bottom: 3px solid #ff5500;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 900; letter-spacing: 1px;">
            GIP'S <span style="color: #ff5500;">KITCHEN</span>
          </h1>
          <p style="color: #a3a3a3; margin: 6px 0 0; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 600;">
            Food & Drinks • Order Status Notification
          </p>
        </div>

        <!-- Main Body -->
        <div style="padding: 32px 24px; text-align: center;">
          ${statusBadgeHtml}
          <h2 style="color: #0f172a; margin: 0 0 16px; font-size: 22px; font-weight: 900; letter-spacing: -0.5px;">
            ${statusHeadline}
          </h2>

          <div style="text-align: left;">
            ${statusMessageHtml}
          </div>

          ${statusActionBoxHtml}

          <!-- Order Summary Details -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 24px 0 16px; text-align: left;">
            <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 12px;">
              <span style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Order Details &bull; #${orderId}</span>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
              ${itemsHtml}
            </table>

            <div style="border-top: 2px solid #e2e8f0; padding-top: 10px; text-align: right;">
              <span style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; margin-right: 12px;">Total Amount</span>
              <span style="font-size: 20px; font-weight: 900; color: #0f172a;">${formattedTotal}</span>
            </div>
          </div>

          <p style="color: #64748b; font-size: 13px; margin: 20px 0 0; line-height: 1.5;">
            Thank you for ordering with Gip's Kitchen! For any inquiries, you can reach out through your account dashboard.
          </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #fafafa; padding: 18px 24px; text-align: center; border-top: 1px solid #eeeeee;">
          <p style="color: #a3a3a3; font-size: 11px; margin: 0; line-height: 1.5;">
            This email was sent to ${toEmail} regarding your order #${orderId}.<br>
            © ${new Date().getFullYear()} Gip's Kitchen Food & Drinks. All rights reserved.
          </p>
        </div>

      </div>
    </body>
    </html>
  `;

  const textContent = `GIP'S KITCHEN - ORDER STATUS NOTIFICATION\n\n${statusHeadline}\n\nHi ${customerName},\n${statusTextSummary}\n\nORDER DETAILS (#${orderId}):\n${itemsText}\nTotal: ${formattedTotal}\n\nThank you for ordering with Gip's Kitchen!`;

  try {
    const startTime = Date.now();
    const response = await client.transactionalEmails.sendTransacEmail({
      sender: {
        name: senderName,
        email: senderEmail
      },
      to: [{ email: toEmail }],
      subject: emailSubject,
      textContent,
      htmlContent
    });

    const elapsed = Date.now() - startTime;
    const messageId = response?.messageId || (Array.isArray(response?.messageIds) ? response.messageIds[0] : undefined);

    if (messageId || response) {
      console.log(`[Order Email Service] ${status} email successfully accepted by Brevo for ${toEmail} (Order #${orderId}) in ${elapsed}ms. MessageId: ${messageId || 'OK'}`);
      return { sent: true, messageId };
    } else {
      console.warn(`[Order Email Service] Brevo API responded without messageId confirmation.`);
      return { sent: false, error: 'Brevo API did not return delivery confirmation.' };
    }
  } catch (err: any) {
    const errorMsg = logSafeBrevoError(err, toEmail);
    console.error(`[Order Email Service] Error delivering ${status} email to ${toEmail}:`, errorMsg);
    return { sent: false, error: errorMsg };
  }
}
