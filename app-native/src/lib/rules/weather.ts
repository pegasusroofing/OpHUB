// A job's weather in words, and the rain delay email that goes with it. Pure, so it can be tested on its own.
const CODES: [number[], string, string][] = [
  [[0], 'Clear', '☀️'], [[1, 2], 'Partly cloudy', '⛅'], [[3], 'Cloudy', '☁️'], [[45, 48], 'Fog', '🌫️'],
  [[51, 53, 55, 56, 57], 'Drizzle', '🌦️'], [[61, 63, 80, 81], 'Rain', '🌧️'], [[65, 82, 66, 67], 'Heavy rain', '🌧️'],
  [[71, 73, 75, 77, 85, 86], 'Snow', '🌨️'], [[95, 96, 99], 'Thunderstorm', '⛈️'],
];
export const weatherWords = (code: number | null | undefined) => {
  const c = CODES.find(([k]) => k.includes(Number(code)));
  return c ? { text: c[1], icon: c[2] } : { text: 'Weather', icon: '🌤️' };
};
export const longDate = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export function rainDelayEmail(job: { name?: string | null; job_number?: string | null; address?: string | null; client_contact_name?: string | null; client_name?: string | null }, sender: string, company: string, when: string) {
  const who = (job.client_contact_name || job.client_name || '').trim();
  const place = [job.job_number, job.name].filter(Boolean).join(' ');
  return {
    subject: `Rain delay: ${place} – ${when}`,
    message: `Dear ${who || 'Sir / Madam'},\n\nDue to the adverse weather today, ${when}, we are not in attendance at ${job.address || job.name || 'site'}. We will need to add additional time to the programme to allow for this.\n\nWe will return to site as soon as conditions allow.\n\nKind regards,\n${sender}\n${company}`,
  };
}
