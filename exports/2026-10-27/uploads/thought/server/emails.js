// The five drip emails as plain text plus a minimal HTML body. Designs live in "Map Graph - Emails.dc.html".
const BRAND = 'Map Graph';
export const TEMPLATES = {
  welcome: { subject: "You're on the list", text: (m) => `Hi${m.name ? ' ' + m.name : ''},\n\nYou're on the ${BRAND} early-access list at position ${m.position}.\n\nMove up: share your link. Each friend who joins moves you ahead by ten places.\n${m.referralUrl}\n\nMap Graph is two engines that run side by side: Thoughts grows ideas from a seed, Atlas maps any field into nested levels. Both keep working in a background tab.\n` },
  nurture1: { subject: 'Shake out thoughts in plain words', text: (m) => 'Try this once you have access: describe a shake the way you would say it. "14 wild ideas around the weakest facts, tangled with links". Each shake becomes a numbered revision you can step back through.\n\nYour link: ' + m.referralUrl },
  nurture2: { subject: 'Map a field you know', text: (m) => 'Atlas ships with starting maps for laws, recipes, DNA sequences, coins, homes, companies, libraries and patents. The samples use invented names, and anything the engine adds for you is marked unverified until you confirm it.\n\nYour link: ' + m.referralUrl },
  upgrade: { subject: 'Founding membership is open', text: (m) => 'Founding members get early access first and a say in what we build next. Registering interest costs nothing and takes no payment.\n\n' + m.upgradeUrl },
  lastcall: { subject: 'Last call for founding places', text: (m) => 'Founding places close soon. If you want one, register interest here: ' + m.upgradeUrl },
};
export const render = (tpl, m) => { const t = TEMPLATES[tpl]; return { subject: t.subject, text: t.text(m), html: '<div style="font:15px/1.6 system-ui,sans-serif;max-width:560px">' + t.text(m).replace(/\n/g, '<br>') + '</div>' }; };
