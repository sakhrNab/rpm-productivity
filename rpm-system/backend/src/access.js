// Who may spend the owner's money / create accounts. Both are closed unless named, so a stranger who
// finds the sign-up form can't burn the server-side AI keys or relay email.
//
//   SERVER_KEY_EMAILS     comma list of accounts allowed to fall back to the server's ANTHROPIC/OPENAI/
//                         DEEPSEEK/ZHIPU keys. Unset = nobody (everyone brings their own key in Settings).
//   REGISTRATION_EMAILS   comma list of emails that may create an account. Unset = sign-ups closed.
//   REGISTRATION_OPEN     "true" re-opens public sign-up (not recommended while server keys/SMTP exist).
//
// Existing accounts are never affected: this only gates *creating* accounts and the env-key fallback.

const parse = (v) => String(v || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const norm = (e) => String(e || '').trim().toLowerCase();

const canUseServerKeys = (email) => parse(process.env.SERVER_KEY_EMAILS).includes(norm(email));
const registrationAllowed = (email) =>
  String(process.env.REGISTRATION_OPEN || '').toLowerCase() === 'true' || parse(process.env.REGISTRATION_EMAILS).includes(norm(email));

module.exports = { canUseServerKeys, registrationAllowed };
