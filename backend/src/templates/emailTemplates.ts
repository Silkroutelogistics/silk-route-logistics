/**
 * SRL Branded Email Templates
 * Navy #0D1B2A header, Gold #C8963E accents
 */

function wrapper(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
        <!-- Header -->
        <tr>
          <td style="background:#0D1B2A;padding:24px 32px;text-align:center">
            <h1 style="margin:0;color:#C8963E;font-size:22px;font-weight:700;letter-spacing:0.5px">Silk Route Logistics</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center">
            <p style="margin:0;font-size:12px;color:#94a3b8">Silk Route Logistics &middot; Moving Freight, Building Futures</p>
            <p style="margin:4px 0 0;font-size:11px;color:#cbd5e1">This is an automated message. Please do not reply directly.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(text: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td>
    <a href="${url}" style="display:inline-block;padding:12px 28px;background:#C8963E;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">${text}</a>
  </td></tr></table>`;
}

export function introductionEmail(recipientName: string, senderName: string, companyName: string): string {
  return wrapper(`
    <h2 style="margin:0 0 16px;color:#0D1B2A;font-size:20px">Hello ${recipientName},</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px">
      My name is <strong>${senderName}</strong> and I'm an Account Executive at <strong>Silk Route Logistics</strong>.
      I wanted to introduce myself and share how we can support <strong>${companyName}</strong>'s freight needs.
    </p>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px">
      We specialize in full truckload and LTL shipping across all 48 states, with a focus on reliable, transparent service
      backed by real-time tracking and a dedicated point of contact.
    </p>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 8px">
      I'd love to schedule a quick call to learn more about your shipping requirements. Would you have 15 minutes this week?
    </p>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:24px 0 0">
      Best regards,<br><strong style="color:#0D1B2A">${senderName}</strong><br>
      <span style="color:#94a3b8;font-size:13px">Account Executive, Silk Route Logistics</span>
    </p>
  `);
}

export function followUpEmail(recipientName: string, senderName: string, context: string): string {
  return wrapper(`
    <h2 style="margin:0 0 16px;color:#0D1B2A;font-size:20px">Hi ${recipientName},</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px">
      I wanted to follow up on our previous conversation${context ? ' regarding ' + context : ''}. I hope all is going well.
    </p>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px">
      At Silk Route Logistics, we're committed to providing exceptional freight service. If your shipping needs have evolved
      or you're looking for competitive rates, I'd be happy to put together a proposal.
    </p>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 8px">
      Please don't hesitate to reach out — I'm here to help.
    </p>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:24px 0 0">
      Regards,<br><strong style="color:#0D1B2A">${senderName}</strong><br>
      <span style="color:#94a3b8;font-size:13px">Account Executive, Silk Route Logistics</span>
    </p>
  `);
}

export function rateQuoteEmail(recipientName: string, senderName: string, lanes: string, rate: string): string {
  return wrapper(`
    <h2 style="margin:0 0 16px;color:#0D1B2A;font-size:20px">Rate Quote for ${recipientName}</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px">
      Thank you for the opportunity to quote on your freight. Here are the details:
    </p>
    <table width="100%" cellpadding="12" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin:16px 0">
      <tr>
        <td style="font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0"><strong>Lane(s)</strong></td>
        <td style="font-size:14px;color:#0D1B2A;border-bottom:1px solid #e2e8f0;font-weight:600">${lanes}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#64748b"><strong>Rate</strong></td>
        <td style="font-size:18px;color:#C8963E;font-weight:700">${rate}</td>
      </tr>
    </table>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px">
      This quote is valid for 48 hours. Rates may vary based on market conditions, equipment availability, and specific load requirements.
    </p>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:24px 0 0">
      <strong style="color:#0D1B2A">${senderName}</strong><br>
      <span style="color:#94a3b8;font-size:13px">Account Executive, Silk Route Logistics</span>
    </p>
  `);
}

export function loadConfirmationEmail(recipientName: string, loadRef: string, origin: string, dest: string, pickup: string, delivery: string, rate: string): string {
  return wrapper(`
    <h2 style="margin:0 0 16px;color:#0D1B2A;font-size:20px">Load Confirmation</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px">
      Hi ${recipientName}, your load has been confirmed. Here are the details:
    </p>
    <table width="100%" cellpadding="10" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin:16px 0;font-size:14px">
      <tr><td style="color:#64748b;border-bottom:1px solid #e2e8f0;width:120px"><strong>Reference</strong></td><td style="color:#0D1B2A;border-bottom:1px solid #e2e8f0;font-weight:700">${loadRef}</td></tr>
      <tr><td style="color:#64748b;border-bottom:1px solid #e2e8f0"><strong>Origin</strong></td><td style="color:#0D1B2A;border-bottom:1px solid #e2e8f0">${origin}</td></tr>
      <tr><td style="color:#64748b;border-bottom:1px solid #e2e8f0"><strong>Destination</strong></td><td style="color:#0D1B2A;border-bottom:1px solid #e2e8f0">${dest}</td></tr>
      <tr><td style="color:#64748b;border-bottom:1px solid #e2e8f0"><strong>Pickup</strong></td><td style="color:#0D1B2A;border-bottom:1px solid #e2e8f0">${pickup}</td></tr>
      <tr><td style="color:#64748b;border-bottom:1px solid #e2e8f0"><strong>Delivery</strong></td><td style="color:#0D1B2A;border-bottom:1px solid #e2e8f0">${delivery}</td></tr>
      <tr><td style="color:#64748b"><strong>Rate</strong></td><td style="color:#C8963E;font-weight:700;font-size:16px">${rate}</td></tr>
    </table>
    ${button("View Load Details", "https://silkroutelogistics.ai/ae/loads.html")}
  `);
}

export function invoiceEmail(recipientName: string, invoiceNumber: string, amount: string, dueDate: string): string {
  return wrapper(`
    <h2 style="margin:0 0 16px;color:#0D1B2A;font-size:20px">Invoice ${invoiceNumber}</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px">
      Hi ${recipientName}, please find your invoice details below:
    </p>
    <table width="100%" cellpadding="12" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin:16px 0">
      <tr><td style="color:#64748b;border-bottom:1px solid #e2e8f0"><strong>Invoice #</strong></td><td style="color:#0D1B2A;border-bottom:1px solid #e2e8f0;font-weight:700">${invoiceNumber}</td></tr>
      <tr><td style="color:#64748b;border-bottom:1px solid #e2e8f0"><strong>Amount</strong></td><td style="color:#C8963E;font-weight:700;font-size:18px">${amount}</td></tr>
      <tr><td style="color:#64748b"><strong>Due Date</strong></td><td style="color:#0D1B2A;font-weight:600">${dueDate}</td></tr>
    </table>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 8px">
      Please remit payment by the due date. Contact us if you have any questions.
    </p>
    ${button("View Invoice", "https://silkroutelogistics.ai/invoices")}
  `);
}

export function thankYouEmail(recipientName: string, senderName: string, reason: string): string {
  return wrapper(`
    <h2 style="margin:0 0 16px;color:#0D1B2A;font-size:20px">Thank You, ${recipientName}!</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px">
      ${reason || 'Thank you for your business with Silk Route Logistics. We truly value our partnership.'}
    </p>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px">
      We look forward to continuing to serve your freight needs and building a long-term relationship.
    </p>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:24px 0 0">
      Warm regards,<br><strong style="color:#0D1B2A">${senderName}</strong><br>
      <span style="color:#94a3b8;font-size:13px">Silk Route Logistics</span>
    </p>
  `);
}

export const TEMPLATE_MAP: Record<string, (...args: string[]) => string> = {
  introduction: introductionEmail,
  follow_up: followUpEmail,
  rate_quote: rateQuoteEmail,
  load_confirmation: loadConfirmationEmail,
  invoice: invoiceEmail,
  thank_you: thankYouEmail,
};
