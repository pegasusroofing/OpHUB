// "Email this to…": a PM / admin from the company, me, or another address, then "CC me a copy?"
// when it goes to someone else (670 sendCertEmailFor: team member picker, custom address, CC me).
import { chooseAction, confirmAsk, promptText } from '@/components/toast';

type Member = { name: string; email: string | null; role: string; is_estimator?: boolean | null };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function pickRecipient(title: string, team: Member[], myEmail: string | null): Promise<{ to: string; cc?: string } | null | 'bad'> {
  const pms = team.filter((p) => (p.role === 'pm' || p.role === 'admin') && p.email && p.email !== myEmail && !(p.role === 'pm' && p.is_estimator));
  const k = await chooseAction(title, [
    ...(myEmail ? [{ key: myEmail, label: `Me (${myEmail})` }] : []),
    ...pms.map((p) => ({ key: p.email as string, label: `${p.name} (${p.email})` })),
    { key: '__other', label: '✉ Another address…' },
  ]);
  if (!k) return null;
  let to = k;
  if (k === '__other') { to = ((await promptText(title, '', { placeholder: 'name@company.co.uk' })) || '').trim(); if (!to) return null; if (!EMAIL.test(to)) return 'bad'; }
  const cc = myEmail && to !== myEmail && (await confirmAsk('CC me a copy?', 'Yes', 'No')) ? myEmail : undefined;
  return { to, cc };
}
