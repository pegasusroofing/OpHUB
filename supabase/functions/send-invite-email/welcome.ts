// The OpHUB welcome email: a new company's first admin invited by the platform owner (Andy, 19 Nov 2026: "this is the
// company email sign up link, it needs refreshing to be all OpHub and remove rtb etc and make it look nice please").
// All OpHUB: its logo and blue, no person's name, replies to sales@operativehub.co.uk, and the three steps to get
// going. Invites a company sends its own people keep that company's name and logo (index.ts).
const esc = (s: unknown) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const OPHUB_SALES = 'sales@operativehub.co.uk';
const BLUE = '#4E8FD1', INK = '#101114', SLATE = '#5B6270', LINE = '#E4E8EE';

export function welcomeSubject(company: string) {
  return `Welcome to OpHUB - set up ${company || 'your company'}`;
}

export function welcomeHtml(o: { company: string; link: string; expires: string }) {
  const company = esc(o.company || 'your company');
  const step = (n: number, title: string, text: string) => `
          <tr><td style="padding:0 0 14px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="vertical-align:top;width:34px;"><div style="width:26px;height:26px;border-radius:13px;background:${BLUE};color:#fff;font-size:13px;font-weight:700;line-height:26px;text-align:center;">${n}</div></td>
              <td style="vertical-align:top;"><div style="font-size:15px;font-weight:700;color:${INK};line-height:1.4;">${title}</div><div style="font-size:14px;color:${SLATE};line-height:1.5;">${text}</div></td>
            </tr></table>
          </td></tr>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to OpHUB</title></head>
<body style="margin:0;padding:0;background:#EEF2F7;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F7;padding:32px 14px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 28px rgba(16,17,20,0.08);">
      <tr><td style="height:6px;background:${BLUE};font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td align="center" style="padding:26px 28px 6px;"><img src="https://operativehub.co.uk/assets/ophub-logo.png" alt="OpHUB" width="170" height="170" style="display:block;width:170px;height:170px;margin:-26px auto -38px;"></td></tr>
      <tr><td align="center" style="padding:0 32px 6px;">
        <div style="font-size:26px;font-weight:800;color:${INK};line-height:1.25;">Welcome to OpHUB</div>
        <div style="font-size:16px;color:${SLATE};line-height:1.5;margin-top:8px;">You've been invited to set up <strong style="color:${INK};">${company}</strong> on OpHUB.</div>
      </td></tr>
      <tr><td style="padding:22px 32px 4px;">
        <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:${INK};">OpHUB brings your sites and your office together: check-ins, RAMS and toolbox talks, schedules of work, materials, snagging, messages and finance, on the phone and on the laptop.</p>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK};">As ${company}'s first admin, here's how to get going:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${step(1, 'Create your account', 'Press the button below and choose your password.')}
          ${step(2, 'Add your logo and colours', 'So the app and its documents carry your company\'s look.')}
          ${step(3, 'Invite your team', 'Operatives, project managers and office staff, from the Admin Centre.')}
        </table>
      </td></tr>
      <tr><td align="center" style="padding:10px 32px 8px;">
        <a href="${esc(o.link)}" style="display:inline-block;background:${BLUE};color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 30px;border-radius:10px;">Set Up My Account</a>
        <div style="font-size:13px;color:${SLATE};margin-top:12px;">This link works once and expires ${esc(o.expires)}.</div>
      </td></tr>
      <tr><td style="padding:16px 32px 6px;">
        <div style="border-top:1px solid ${LINE};padding-top:16px;font-size:13px;line-height:1.6;color:${SLATE};">If the button doesn't work, copy this link into your browser:<br><span style="color:${INK};word-break:break-all;">${esc(o.link)}</span></div>
      </td></tr>
      <tr><td style="padding:10px 32px 24px;">
        <div style="font-size:13px;line-height:1.6;color:${SLATE};">Questions? Email <a href="mailto:${OPHUB_SALES}" style="color:${BLUE};text-decoration:none;font-weight:600;">${OPHUB_SALES}</a> and we'll help you get started. If you weren't expecting this invite, you can ignore this email.</div>
      </td></tr>
      <tr><td align="center" style="background:#F6F8FB;padding:16px 28px;border-top:1px solid ${LINE};">
        <div style="font-size:12px;color:${SLATE};font-weight:600;">OpHUB &middot; <a href="https://operativehub.co.uk" style="color:${SLATE};text-decoration:none;">operativehub.co.uk</a></div>
        <div style="font-size:11px;color:#8A919C;margin-top:4px;">Operative Hub is a trading name of Pegasus Roofing &amp; Construction Ltd</div>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function welcomeText(o: { company: string; link: string; expires: string }) {
  const c = o.company || 'your company';
  return `Welcome to OpHUB\n\nYou've been invited to set up ${c} on OpHUB: check-ins, RAMS and toolbox talks, schedules of work, materials, snagging, messages and finance, on the phone and on the laptop.\n\nAs ${c}'s first admin:\n1. Create your account - open the link below and choose your password.\n2. Add your logo and colours.\n3. Invite your team from the Admin Centre.\n\nSet up your account: ${o.link}\nThis link works once and expires ${o.expires}.\n\nQuestions? Email ${OPHUB_SALES}.\n\nOpHUB - operativehub.co.uk\nOperative Hub is a trading name of Pegasus Roofing & Construction Ltd`;
}
