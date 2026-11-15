// Public endpoint: Stripe calls this directly, with no Supabase JWT --
// verify_jwt is deliberately off. Authenticity is instead verified via
// Stripe's own signature check (constructEventAsync below), which is the
// correct auth mechanism for a webhook. Do not remove that check.
import Stripe from 'npm:stripe';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

function escapeHtml(s: unknown){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));
}

// Best-effort welcome/invite email for whoever just paid, sent the moment
// the invites row is created -- this is the ONLY automatic email the founding
// admin gets. Previously nothing emailed them at all: signup-success.html
// only redirects their own browser tab straight to the join screen, so
// closing the tab / switching devices / a page error left them with no way
// back in. Deliberately non-blocking and wrapped so a Resend outage never
// fails the webhook response Stripe is waiting on.
async function sendFoundingInviteEmail(companyName: string, email: string | null, inviteId: string, expiresAtIso: string, isFinance = false) {
  if (!email) { console.log('sendFoundingInviteEmail: no email on session, skipping'); return; }
  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) { console.log('sendFoundingInviteEmail: RESEND_API_KEY not set, skipping'); return; }
    const FROM_EMAIL = Deno.env.get('INVITES_FROM_EMAIL') || Deno.env.get('ORDERS_FROM_EMAIL') || 'invites@ophub.app';
    const brand = '#4E8FD1';
    const logoUrl = 'https://operativehub.co.uk/assets/ophub-mark.png';
    // Must point at app.html, NOT the bare domain root -- the root path
    // serves the marketing homepage (a plain static page with no router),
    // so a "/#/join/..." link there silently does nothing when clicked.
    const inviteLink = `https://operativehub.co.uk/app.html#/join/${inviteId}`;
    const expiresLabel = new Date(expiresAtIso).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
    const product = isFinance ? 'OpHUB Finance' : 'OpHUB';
    const subject = `Welcome to ${product} — set up your ${companyName} account`;
    const whatItIs = isFinance
      ? 'the app for your jobs\' money: invoices, applications, certificates, retention, purchase orders, supplier invoices, labour and CIS'
      : 'the app your team will use for site check-ins, RAMS &amp; toolbox talks, schedules of work, materials, snagging and messaging, all in one place';

    const text = `Hi,\n\nThanks for subscribing to ${product}. Your organization, ${companyName}, is ready.\n\nTap the link below to set up your account and get started:\n${inviteLink}\n\nThis link works once and expires ${expiresLabel}.\n\nIf you weren't expecting this, you can ignore this email.`;

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#EFEDE6;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFEDE6;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:${brand};padding:32px 28px;text-align:center;">
            <img src="${logoUrl}" alt="OpHUB" width="52" height="52" style="border-radius:10px;background:#fff;object-fit:contain;padding:4px;display:inline-block;margin-bottom:14px;">
            <div style="color:#ffffff;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.85;">OpHUB</div>
            <div style="color:#ffffff;font-size:23px;font-weight:800;margin-top:4px;">Welcome to ${product}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:30px 28px 8px;">
            <p style="margin:0 0 16px;font-size:15px;color:#101114;">Hi,</p>
            <p style="margin:0 0 22px;font-size:14.5px;color:#3A3B3E;line-height:1.6;">Thanks for subscribing to ${product}. Your organization, <b>${escapeHtml(companyName)}</b>, is ready &mdash; ${whatItIs}.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
              <tr>
                <td align="center">
                  <a href="${inviteLink}" style="display:inline-block;background:${brand};color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;padding:14px 34px;border-radius:10px;letter-spacing:.01em;">Set Up Your Account</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 6px;font-size:12.5px;color:#8A8D93;line-height:1.5;">Or copy and paste this link into your browser:</p>
            <p style="margin:0 0 20px;font-size:12px;color:${brand};word-break:break-all;">${inviteLink}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#FCEFEF;border:1.5px solid #E8B4B4;border-radius:8px;padding:12px 16px;">
                  <div style="font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#A33636;">This link works once</div>
                  <div style="font-size:13.5px;color:#7A1F1F;margin-top:2px;">Expires ${escapeHtml(expiresLabel)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px 28px;">
            <p style="margin:0;font-size:13px;color:#8A8D93;line-height:1.6;">Questions? Just reply to this email. If you weren't expecting this invite, you can safely ignore it.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#F5F4EF;padding:16px 28px;text-align:center;">
            <span style="font-size:11px;color:#9A978C;letter-spacing:.05em;">Sent via OpHUB &middot; operativehub.co.uk</span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [email], subject, text, html }),
    });
    if (!emailRes.ok) {
      console.error('sendFoundingInviteEmail: Resend error', await emailRes.text());
    }
  } catch (e) {
    console.error('sendFoundingInviteEmail failed', e);
  }
}

Deno.serve(async (req: Request) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret);
  } catch (err) {
    console.error('Signature verification failed', err);
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyName = (session.metadata?.company_name as string) || 'New Company';
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const email = session.customer_details?.email || session.customer_email || null;
        // Drives both the subscriptions row AND organizations.plan_tier, which
        // is what actually gates features client-side (e.g. GPS check-in).
        // 'finance' = OpHUB Finance on its own: a database trigger on
        // organizations turns the project-management side off for that plan,
        // and the founding admin gets Finance switched on when they join.
        const tier = (session.metadata?.tier as string) || null;
        const validTier = tier && ['starter', 'growth', 'enterprise', 'finance'].includes(tier) ? tier : 'enterprise';

        // Find or create the organization tied to this Stripe customer.
        let orgId: string;
        const { data: existingOrg } = await supabase
          .from('organizations').select('id').eq('stripe_customer_id', customerId).maybeSingle();
        if (existingOrg) {
          orgId = existingOrg.id;
          // Keep plan_tier in sync if they've re-subscribed under a new plan.
          await supabase.from('organizations').update({ plan_tier: validTier }).eq('id', orgId);
        } else {
          const { data: newOrg, error } = await supabase
            .from('organizations').insert({ name: companyName, stripe_customer_id: customerId, plan_tier: validTier }).select('id').single();
          if (error) throw error;
          orgId = newOrg.id;
        }

        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await supabase.from('subscriptions').upsert({
          org_id: orgId,
          stripe_subscription_id: sub.id,
          status: sub.status,
          plan: tier,
          current_period_end: new Date((sub as any).current_period_end * 1000).toISOString(),
        }, { onConflict: 'stripe_subscription_id' });

        // Founding company-admin invite for whoever just paid. 'admin' is the
        // top of the per-company hierarchy (admin > pm > operative) and is the
        // only role that can promote others to admin or remove a pm. This is
        // the one place an 'admin' invite is ever created -- only reachable via
        // this service_role-authenticated webhook, never by an authenticated
        // user (the "pm create operative invites" RLS policy on invites only
        // ever allows role='operative').
        const { data: invite, error: inviteErr } = await supabase.from('invites').insert({
          org_id: orgId,
          email,
          role: 'admin',
          expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        }).select('id, expires_at').single();
        if (inviteErr) throw inviteErr;

        await supabase.from('checkout_sessions').upsert({
          stripe_checkout_session_id: session.id,
          status: 'completed',
          invite_id: invite.id,
        }, { onConflict: 'stripe_checkout_session_id' });

        // Send the actual invite email now, rather than relying solely on
        // signup-success.html redirecting the payer's own browser tab --
        // that in-tab redirect still happens too and is fine/faster when it
        // works, but previously it was the ONLY path in, so closing the tab,
        // switching devices, or a page error left the paying customer with
        // no way back in. Best-effort/non-blocking: never throws, never
        // delays or fails the webhook response Stripe is waiting on.
        await sendFoundingInviteEmail(companyName, email, invite.id, invite.expires_at as string, validTier === 'finance');
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await supabase.from('subscriptions').update({
          status: sub.status,
          current_period_end: new Date((sub as any).current_period_end * 1000).toISOString(),
        }).eq('stripe_subscription_id', sub.id);
        break;
      }
      default:
        break; // ignore anything else
    }
  } catch (e) {
    console.error('Handler error', e);
    return new Response('Handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
});
