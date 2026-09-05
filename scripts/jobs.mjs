export const JOBS = [
  { id: "pdf", label: "PDF and documents", re: /\b(pdf|acrobat|foxit|docusign|e-?sign|fill and sign)\b/i },
  { id: "adblock", label: "Block ads", re: /\b(adblock|ad blocker|block ads|ublock|adguard)\b/i },
  { id: "vpn", label: "VPN and proxy", re: /\b(vpn|proxy protection|proxy veepn)\b/i },
  { id: "password", label: "Password managers", re: /\b(password manager|lastpass|1password|bitwarden|credential management)\b/i },
  { id: "sso", label: "Work sign-in", re: /\b(single sign|sso|okta|oneclick|classlink|work or school)\b/i },
  { id: "remote", label: "Remote desktop", re: /\b(remote desktop|remote control|chromoting)\b/i },
  { id: "meet", label: "Meetings and calls", re: /\b(zoom|webex|google meet|teams meeting|schedule .*meeting)\b/i },
  { id: "drive", label: "Open Drive files", re: /\b(google drive|drive files|launcher for drive)\b/i },
  { id: "crypto", label: "Crypto wallets", re: /\b(metamask|crypto wallet|web3|ethereum)\b/i },
  { id: "print", label: "Print and printers", re: /\b(printer|print job|mobility print)\b/i },
  { id: "script", label: "User scripts", re: /\b(tampermonkey|userscript|greasemonkey|violentmonkey)\b/i },
  { id: "automate", label: "Automation", re: /\b(power automate|rpa|web automation|if this then)\b/i },
  { id: "dlp", label: "Data protection", re: /\b(purview|dlp|data leak|endpoint verification|sensitive data)\b/i },
  { id: "record", label: "Screen record", re: /\b(screen record|screencast|loom|capture video)\b/i },
  { id: "notes", label: "Notes and clips", re: /\b(google keep|note taking|notepad|clipper)\b/i },
  { id: "bookmarks", label: "Bookmarks", re: /\b(bookmark)\b/i },
  { id: "grammar", label: "Writing help", re: /\b(grammarly|grammar|writing assistant|spell ?check)\b/i },
  { id: "download", label: "Downloaders", re: /\b(download(er)?|idm |video downloader)\b/i },
  { id: "shopping", label: "Coupons and shop", re: /\b(coupon|cashback|honey|capital one shopping)\b/i },
  { id: "safety", label: "Browser safety", re: /\b(webadvisor|browser safety|malwarebytes|safe brows)\b/i },
  { id: "tabs", label: "Tab managers", re: /\b(tab manager|tab group|session manager|too many tabs)\b/i },
  { id: "email", label: "Email", re: /\b(gmail|outlook|inbox|email client|mail merge)\b/i },
  { id: "calendar", label: "Calendar", re: /\b(google calendar|outlook calendar)\b/i },
  { id: "translate", label: "Translate", re: /\b(translat)\b/i },
  { id: "git", label: "Git and repos", re: /\b(github|gitlab|bitbucket|pull request|repository)\b/i },
  { id: "checklist", label: "Checklists", re: /\b(checklist|to-?do list|definition of done)\b/i },
  { id: "gantt", label: "Plans and Gantt", re: /\b(gantt|portfolio|bigpicture|work breakdown|roadmap)\b/i },
  { id: "time", label: "Time tracking", re: /\b(time track|timesheet|clockwork|billable hour)\b/i },
  { id: "whiteboard", label: "Whiteboards", re: /\b(miro|whiteboard|figjam|lucidspark)\b/i },
  { id: "sheets", label: "Sheets and grids", re: /\b(spreadsheet|jxl|inline edit|excel)\b/i },
  { id: "jira-mail", label: "Email from Jira", re: /\b(email this issue|send (and receive )?e-?mails?)\b/i },
];

const CLAIMS = [
  { label: "Edit files", re: /\b(edit|annotate|markup)\b/i },
  { label: "Sign documents", re: /\b(sign|e-sign|fill)\b/i },
  { label: "Convert files", re: /\b(convert|compress|export)\b/i },
  { label: "Block ads", re: /\b(block ads|adblock|remove ads)\b/i },
  { label: "Hide YouTube ads", re: /\byoutube\b/i },
  { label: "Encrypt traffic", re: /\b(encrypt|secure tunnel|vpn)\b/i },
  { label: "Save passwords", re: /\b(password|credential|autofill|auto-fill)\b/i },
  { label: "Sync across devices", re: /\b(sync|across (all )?devices|cloud sync)\b/i },
  { label: "Work sign-in", re: /\b(sso|single sign|work or school|okta)\b/i },
  { label: "Remote control", re: /\b(remote|control another)\b/i },
  { label: "Open local apps", re: /\b(open .*files|local app|installed on your computer)\b/i },
  { label: "Keyboard shortcuts", re: /\b(shortcut|hotkey)\b/i },
  { label: "Screen record", re: /\b(record|capture)\b/i },
  { label: "Share links", re: /\b(share|invite)\b/i },
  { label: "Offline use", re: /\boffline\b/i },
  { label: "Dark mode", re: /\bdark mode\b/i },
  { label: "Two-factor", re: /\b(2fa|two-factor|otp)\b/i },
  { label: "Time tracking", re: /\b(time track|timesheet|hours)\b/i },
  { label: "Checklists", re: /\b(checklist|to-?do|definition of done)\b/i },
  { label: "Gantt / plan", re: /\b(gantt|roadmap|portfolio)\b/i },
  { label: "Git sync", re: /\b(commit|branch|pull request|repository)\b/i },
  { label: "Email in / out", re: /\b(send (and receive )?e-?mail|email)\b/i },
  { label: "Calendar", re: /\bcalendar\b/i },
  { label: "Automation", re: /\b(automat|workflow|trigger)\b/i },
  { label: "Privacy / DLP", re: /\b(privacy|dlp|data leak|sensitive)\b/i },
];

const OTHER = { id: "other", label: "Other tools" };

export function jobOf(name, description) {
  const text = `${name || ""} ${description || ""}`;
  for (const job of JOBS) {
    if (job.re.test(text)) return job;
  }
  return OTHER;
}

function commonClaims(rows) {
  const sample = rows.slice(0, 40);
  const hits = [];
  for (const claim of CLAIMS) {
    let n = 0;
    for (const row of sample) {
      const text = `${row.name || ""} ${row.description || ""}`;
      if (claim.re.test(text)) n += 1;
    }
    if (n >= 2) hits.push({ label: claim.label, n });
  }
  return hits.sort((a, b) => b.n - a.n).slice(0, 6);
}

export function groupListings(rows) {
  const buckets = new Map();
  for (const row of rows) {
    const job = jobOf(row.name, row.description);
    const cur = buckets.get(job.id) || {
      id: job.id,
      label: job.label,
      n: 0,
      demand: 0,
      ratingSum: 0,
      rated: 0,
      rows: [],
    };
    cur.n += 1;
    cur.demand += Number(row.demand) || 0;
    if (row.rating != null && row.rating !== "") {
      cur.ratingSum += Number(row.rating);
      cur.rated += 1;
    }
    cur.rows.push(row);
    buckets.set(job.id, cur);
  }

  const ranked = [...buckets.values()].sort((a, b) => b.demand - a.demand);
  const named = ranked.filter((b) => b.id !== "other").slice(0, 11);
  const other = ranked.find((b) => b.id === "other");
  const out = other && other.n >= 5 ? named.concat([other]) : named;

  return out.map((b) => {
    const examples = [...b.rows].sort((a, c) => (c.demand || 0) - (a.demand || 0));
    return {
      id: b.id,
      label: b.label,
      n: b.n,
      demand: b.demand,
      avg_rating: b.rated ? b.ratingSum / b.rated : null,
      features: commonClaims(examples).map((f) => f.label),
      examples: examples.slice(0, 3).map((r) => r.name),
      ids: examples.slice(0, 80).map((r) => r.listing_id),
    };
  });
}
