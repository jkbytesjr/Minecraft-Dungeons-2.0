import { ADMIN_SESSION_TOKEN, checkAdminLogin, parseCommand, type ParsedCommand } from '../systems/admin';

const SESSION_KEY = 'voxel-dungeon:admin';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

function readSession(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === ADMIN_SESSION_TOKEN;
  } catch {
    return false;
  }
}

/**
 * Hidden admin login plus a command console. Nothing about it is shown until
 * the secret trigger is used; after logging in, ` (backtick) toggles the console
 * for the rest of the browser tab's session.
 */
export class AdminConsole {
  /** Runs a command and returns the text to print. */
  exec: (cmd: ParsedCommand) => string = () => '';
  onLoginChange: (loggedIn: boolean) => void = () => {};
  private readonly login: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly log: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private loggedIn = readSession();
  private failures = 0;
  private lockedUntil = 0;
  private readonly history: string[] = [];
  private historyIndex = -1;

  constructor(root: HTMLElement) {
    this.login = document.createElement('div');
    this.login.className = 'admin-login hidden';
    this.login.innerHTML = `
      <form class="admin-box" autocomplete="off">
        <h2>Restricted</h2>
        <input name="user" placeholder="Username" autocomplete="off" spellcheck="false" />
        <input name="pass" type="password" placeholder="Password" autocomplete="off" />
        <p class="admin-error"></p>
        <div class="admin-row">
          <button type="button" class="menu-btn small" data-act="cancel">Cancel</button>
          <button type="submit" class="menu-btn small menu-primary">Log in</button>
        </div>
      </form>`;
    this.panel = document.createElement('div');
    this.panel.className = 'admin-console hidden';
    this.panel.innerHTML = `
      <div class="admin-head"><b>ADMIN CONSOLE</b><span>type <code>help</code> · Esc or \` to close</span></div>
      <div class="admin-log"></div>
      <input class="admin-input" placeholder="command…" autocomplete="off" spellcheck="false" />`;
    root.append(this.login, this.panel);
    this.log = this.panel.querySelector('.admin-log')!;
    this.input = this.panel.querySelector('.admin-input')!;

    const form = this.login.querySelector('form')!;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.tryLogin();
    });
    this.login.querySelector('[data-act="cancel"]')!.addEventListener('click', () => this.closeLogin());
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeLogin();
    });
    this.input.addEventListener('keydown', (e) => this.onConsoleKey(e));
    // Secret anywhere-shortcut: Ctrl+Alt+Shift+A (Ctrl+Option+Shift+A on a Mac).
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.altKey && e.shiftKey && e.code === 'KeyA') {
        e.preventDefault();
        this.requestAccess();
      } else if (e.code === 'Backquote' && this.loggedIn && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        this.toggleConsole();
      }
    });
  }

  get isLoggedIn(): boolean {
    return this.loggedIn;
  }

  /** Login dialog or console on screen (the game pauses). */
  get open(): boolean {
    return !this.login.classList.contains('hidden') || !this.panel.classList.contains('hidden');
  }

  /** The secret trigger: open the console if logged in, otherwise the login dialog. */
  requestAccess(): void {
    if (this.loggedIn) {
      this.toggleConsole(true);
      return;
    }
    this.login.classList.remove('hidden');
    this.login.querySelector<HTMLParagraphElement>('.admin-error')!.textContent = '';
    this.login.querySelector<HTMLInputElement>('input[name="user"]')!.focus();
  }

  toggleConsole(show = this.panel.classList.contains('hidden')): void {
    this.panel.classList.toggle('hidden', !show);
    if (show) {
      if (!this.log.childElementCount) this.print('Logged in. Type help for commands.', 'info');
      this.input.focus();
    } else {
      this.input.blur();
    }
  }

  logout(): void {
    this.loggedIn = false;
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Nothing stored.
    }
    this.toggleConsole(false);
    this.onLoginChange(false);
  }

  private closeLogin(): void {
    this.login.classList.add('hidden');
    (document.activeElement as HTMLElement | null)?.blur();
  }

  private tryLogin(): void {
    const err = this.login.querySelector<HTMLParagraphElement>('.admin-error')!;
    const now = Date.now();
    if (now < this.lockedUntil) {
      err.textContent = `Too many attempts. Try again in ${Math.ceil((this.lockedUntil - now) / 1000)}s.`;
      return;
    }
    const user = this.login.querySelector<HTMLInputElement>('input[name="user"]')!;
    const pass = this.login.querySelector<HTMLInputElement>('input[name="pass"]')!;
    const ok = checkAdminLogin(user.value, pass.value);
    pass.value = '';
    if (!ok) {
      this.failures++;
      if (this.failures >= MAX_ATTEMPTS) {
        this.failures = 0;
        this.lockedUntil = now + LOCKOUT_MS;
        err.textContent = 'Too many attempts. Locked for 30s.';
      } else err.textContent = 'Wrong username or password.';
      return;
    }
    this.failures = 0;
    this.loggedIn = true;
    try {
      window.sessionStorage.setItem(SESSION_KEY, ADMIN_SESSION_TOKEN);
    } catch {
      // Session just won't survive a reload.
    }
    user.value = '';
    this.closeLogin();
    this.onLoginChange(true);
    this.toggleConsole(true);
  }

  private onConsoleKey(e: KeyboardEvent): void {
    e.stopPropagation();
    if (e.key === 'Escape' || e.code === 'Backquote') {
      e.preventDefault();
      this.toggleConsole(false);
    } else if (e.key === 'Enter') {
      const line = this.input.value;
      this.input.value = '';
      this.run(line);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!this.history.length) return;
      this.historyIndex = Math.max(0, Math.min(this.history.length, this.historyIndex + (e.key === 'ArrowUp' ? -1 : 1)));
      this.input.value = this.history[this.historyIndex] ?? '';
    }
  }

  /** Execute a command line (also used by tests). */
  run(line: string): string {
    const cmd = parseCommand(line);
    if (!cmd) return '';
    this.history.push(line.trim());
    this.historyIndex = this.history.length;
    this.print(`> ${line.trim()}`, 'cmd');
    if (!this.loggedIn) return this.print('Not logged in.', 'err');
    if (cmd.name === 'logout') {
      this.logout();
      return 'Logged out.';
    }
    let out: string;
    try {
      out = this.exec(cmd);
    } catch (err) {
      out = `Error: ${(err as Error).message}`;
    }
    return this.print(out, out.startsWith('Unknown') || out.startsWith('Usage') || out.startsWith('Error') ? 'err' : 'ok');
  }

  private print(text: string, kind: 'cmd' | 'ok' | 'err' | 'info'): string {
    const line = document.createElement('div');
    line.className = `admin-line ${kind}`;
    line.textContent = text;
    this.log.appendChild(line);
    while (this.log.childElementCount > 200) this.log.firstElementChild!.remove();
    this.log.scrollTop = this.log.scrollHeight;
    return text;
  }
}
