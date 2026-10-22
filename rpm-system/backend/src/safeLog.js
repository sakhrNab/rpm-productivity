// One console call = one log line.
//
// Docker splits a container's stdout/stderr on "\n", and the security collector trusts a log line
// that STARTS with `SECURITY_EVENT {json}`. So if the app logs a user-supplied string that holds a
// raw newline (an OAuth `error_description`, a webhook field, an error message built from a request),
// the text after the newline becomes a log line of its own and can forge an event — or fool any
// other tool that reads these logs.
//
// installSafeConsole() wraps console.log/info/warn/error/debug/trace once, at startup: the arguments
// are formatted exactly as Node would format them (util.format), then every control character in the
// result is escaped (\n -> "\\n", \r -> "\\r", others -> "\\uXXXX"; tab is kept). Multi-line output
// such as an error stack therefore stays on one line. The escapes are valid JSON escapes, so the
// app's own `SECURITY_EVENT {json}` line (already JSON-encoded, so already one line) is written
// unchanged and still parses.

const util = require('util');

// Every C0 control except TAB, plus DEL, NEL and the Unicode line/paragraph separators.
const CONTROL = /[\x00-\x08\x0a-\x1f\x7f\x85\u2028\u2029]/g;
const escapeChar = (c) => (c === '\n' ? '\\n' : c === '\r' ? '\\r' : `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

function escapeControl(s) {
  return String(s).replace(CONTROL, escapeChar);
}

const METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace'];
const INSTALLED = Symbol.for('rpm.safeConsole');

function installSafeConsole(con = console) {
  if (con[INSTALLED]) return con;
  for (const m of METHODS) {
    const orig = con[m];
    if (typeof orig !== 'function') continue;
    con[m] = function safeConsoleMethod(...args) {
      if (args.length === 0) return orig.call(con);
      return orig.call(con, escapeControl(util.format(...args)));
    };
  }
  Object.defineProperty(con, INSTALLED, { value: true });
  return con;
}

module.exports = { installSafeConsole, escapeControl };
