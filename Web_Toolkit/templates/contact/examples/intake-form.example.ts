// ./Web_Toolkit/templates/contact/examples/intake-form.example.ts
/**
 * Example client for a multi-section intake form (pairs with lib/handle-intake.ts). Copy to src/scripts/intake-form.ts (form-draft.ts next to it) and adapt the
 * selectors, DRAFT_EXCLUDED and FIELD_ID names to your markup. It is the script behind imyourboyroy.com/inquire/.
 * Behaviour: auto-growing textareas, a local draft, honest submit states, retry and a prefilled
 * mailto fallback. Works on top of a real <form method="post" action="/api/submit-form">, so without this script
 * the browser posts natively and the server answers with a result page.
 *
 * Contract with the server (src/lib/contact/handle-inquiry.ts): JSON { ok, id, code, error, fieldErrors, retryAfter }.
 * The draft is deleted ONLY after { ok: true } from the server. Every failure keeps all answers in place and offers
 * Retry plus an email link. The submission id is created once per attempt series so a retry is recognisable.
 */
import { DAY_MS, buildMailtoHref, createDraftStore, createSubmissionId, type DraftValues, type StorageLike } from './form-draft';

const FIELD_ID = { id: 'submission_id', elapsed: 'form_elapsed', honeypot: 'website_confirm', turnstile: 'cf-turnstile-response' } as const;
const INTERNAL = new Set<string>(Object.values(FIELD_ID));

/** Never written to the saved draft: links and free text that can hold private material, plus contact numbers. */
const DRAFT_EXCLUDED = ['assets', 'inspiration', 'social-other', 'current-website', 'google-biz', 'linkedin', 'phone', ...Object.values(FIELD_ID)];

const REQUEST_TIMEOUT_MS = 20000;
const SAVE_DEBOUNCE_MS = 700;
const DRAFT_TTL_MS = 7 * DAY_MS;
const RESET_AFTER_SUCCESS_MS = 3000;
const RESTORED_ELAPSED_BONUS_MS = 60000;

interface ApiResult {
  ok?: boolean;
  id?: string;
  code?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  retryAfter?: number;
}

function getStorage(): StorageLike | null {
  try {
    const storage = window.localStorage;
    const probe = '__iyb_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function setup(form: HTMLFormElement): void {
  const q = <T extends HTMLElement>(selector: string): T | null => form.querySelector<T>(selector);
  const status = q<HTMLElement>('[data-form-status]');
  const submitButton = q<HTMLButtonElement>('.submit-btn');
  const recovery = q<HTMLElement>('[data-form-recovery]');
  const retryButton = q<HTMLButtonElement>('[data-form-retry]');
  const mailtoLink = q<HTMLAnchorElement>('[data-form-mailto]');
  const draftRow = q<HTMLElement>('[data-form-draft]');
  const draftNote = q<HTMLElement>('[data-form-draft-note]');
  const clearDraftButton = q<HTMLButtonElement>('[data-form-draft-clear]');
  const idField = q<HTMLInputElement>(`input[name="${FIELD_ID.id}"]`);
  const elapsedField = q<HTMLInputElement>(`input[name="${FIELD_ID.elapsed}"]`);
  const turnstileHolder = q<HTMLElement>('[data-inquiry-turnstile]');
  const fallbackAddress = form.dataset.fallbackEmail ?? '';
  const idleLabel = submitButton?.querySelector<HTMLElement>('[data-submit-label]') ?? null;
  const originalLabel = idleLabel?.textContent?.trim() ?? 'Submit Inquiry';

  const store = createDraftStore({ key: 'iyb:inquiry-draft', version: 1, ttlMs: DRAFT_TTL_MS, excluded: DRAFT_EXCLUDED, storage: getStorage() });

  let submissionId = createSubmissionId();
  let busy = false;
  let restored = false;
  let saveTimer: number | undefined;
  let saveEnabled = true;

  /* ---------------------------------------------------------------- helpers */

  const setStatus = (message: string, state: 'pending' | 'success' | 'error' | '', focus = false): void => {
    if (!status) return;
    if (state) status.dataset.state = state;
    else delete status.dataset.state;
    status.textContent = '';
    // Emptying first makes a repeated message announce again. A timer (not rAF) so a hidden tab still updates.
    window.setTimeout(() => {
      status.textContent = message;
      if (focus && message) status.focus({ preventScroll: false });
    }, 40);
  };

  const setLabel = (text: string): void => {
    if (idleLabel) idleLabel.textContent = text;
  };

  const labelFor = (name: string): string => {
    const field = form.elements.namedItem(name);
    const first = field instanceof RadioNodeList ? field[0] : field;
    if (first instanceof HTMLElement && first.id) {
      const label = form.querySelector<HTMLElement>(`label[for="${first.id}"]`);
      const text = label?.textContent?.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
      if (text) return text;
    }
    return name.replace(/-/g, ' ');
  };

  const collect = (): Array<[string, string]> => {
    const rows: Array<[string, string]> = [];
    for (const [name, value] of new FormData(form).entries()) {
      if (typeof value === 'string' && !INTERNAL.has(name)) rows.push([name, value]);
    }
    return rows;
  };

  const draftValues = (): DraftValues => {
    const values: DraftValues = {};
    for (const [name, value] of collect()) {
      const current = values[name];
      if (current === undefined) values[name] = value;
      else values[name] = Array.isArray(current) ? [...current, value] : [current, value];
    }
    return values;
  };

  const growTextareas = (): void => {
    form.querySelectorAll<HTMLTextAreaElement>('.auto-grow').forEach((area) => {
      area.style.height = 'auto';
      if (area.value) area.style.height = `${area.scrollHeight}px`;
    });
  };

  const clearFieldErrors = (): void => {
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  };

  /* ------------------------------------------------------------------ draft */

  const showDraftRow = (note: string): void => {
    if (!draftRow || !store.available) return;
    draftRow.hidden = false;
    if (draftNote) draftNote.textContent = note;
  };

  const saveNow = (): void => {
    if (!saveEnabled || !store.available) return;
    window.clearTimeout(saveTimer);
    if (store.save(draftValues())) {
      if (store.load()) showDraftRow('Draft saved on this device.');
      else if (draftRow) draftRow.hidden = true;
    }
  };

  const scheduleSave = (): void => {
    if (!saveEnabled || !store.available) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, SAVE_DEBOUNCE_MS);
  };

  const restoreDraft = (): void => {
    const draft = store.load();
    if (!draft) return;
    let any = false;
    for (const [name, value] of Object.entries(draft.values)) {
      const field = form.elements.namedItem(name);
      if (!field || DRAFT_EXCLUDED.includes(name)) continue;
      if (field instanceof HTMLSelectElement) {
        const wanted = Array.isArray(value) ? value[0] : value;
        if (wanted !== undefined && Array.from(field.options).some((option) => option.value === wanted && !option.disabled)) {
          field.value = wanted;
          any = true;
        }
      } else if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        if (field.type === 'checkbox' || field.type === 'radio') continue;
        field.value = Array.isArray(value) ? (value[0] ?? '') : value;
        any = true;
      }
    }
    if (!any) return;
    restored = true;
    const details = form.querySelector<HTMLDetailsElement>('details.form-more-details');
    if (details && !details.open && Array.from(details.querySelectorAll<HTMLInputElement>('input, select, textarea')).some((el) => el.value && !(el instanceof HTMLSelectElement))) {
      details.open = true;
    }
    growTextareas();
    const when = new Date(draft.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    showDraftRow(`Restored your saved draft from ${when}. It lives on this device only.`);
  };

  clearDraftButton?.addEventListener('click', () => {
    window.clearTimeout(saveTimer);
    store.clear();
    if (draftRow) draftRow.hidden = true;
    setStatus('Saved draft cleared from this device. What is on the page now stays until you reload.', '');
  });

  /* ------------------------------------------------------------- turnstile */

  let turnstileToken = '';
  let turnstileWidget: string | undefined;
  let turnstileStarted = false;
  type TurnstileApi = { render(el: HTMLElement, options: Record<string, unknown>): string; reset(id?: string): void };
  const turnstileApi = (): TurnstileApi | undefined => (window as unknown as { turnstile?: TurnstileApi }).turnstile;

  const startTurnstile = (): void => {
    if (!turnstileHolder || turnstileStarted) return;
    turnstileStarted = true;
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      const api = turnstileApi();
      if (!api) return;
      turnstileWidget = api.render(turnstileHolder, {
        sitekey: turnstileHolder.dataset.sitekey,
        action: turnstileHolder.dataset.action,
        theme: 'auto',
        callback: (value: string) => {
          turnstileToken = value;
        },
        'expired-callback': () => {
          turnstileToken = '';
        },
        'error-callback': () => {
          turnstileToken = '';
          setStatus('The spam check could not load. Reload the page or use the email link.', 'error');
        }
      });
    };
    script.onerror = () => {
      turnstileStarted = false;
      setStatus('The spam check could not load. Reload the page or use the email link.', 'error');
    };
    document.head.appendChild(script);
  };

  // Loads on first focus of the form only, never at page load.
  if (turnstileHolder) form.addEventListener('focusin', startTurnstile, { once: true });

  /* --------------------------------------------------------------- failure */

  const refreshMailto = (): void => {
    if (!mailtoLink || !fallbackAddress) return;
    const rows = collect().map(([name, value]) => [labelFor(name), value] as const);
    mailtoLink.href = buildMailtoHref({
      address: fallbackAddress,
      subject: `Inquiry ${submissionId}`,
      intro: `Reference: ${submissionId}\nI tried the inquiry form on imyourboyroy.com and sending failed.`,
      rows
    });
  };

  const showRecovery = (retryable: boolean): void => {
    if (!recovery) return;
    refreshMailto();
    recovery.hidden = false;
    if (retryButton) retryButton.hidden = !retryable;
  };

  const hideRecovery = (): void => {
    if (recovery) recovery.hidden = true;
  };

  const showFieldErrors = (errors: Record<string, string>): void => {
    clearFieldErrors();
    const labels: string[] = [];
    let first: HTMLElement | null = null;
    for (const [name, message] of Object.entries(errors)) {
      const field = form.elements.namedItem(name);
      const target = field instanceof RadioNodeList ? (field[0] as HTMLElement | undefined) : field;
      if (!(target instanceof HTMLElement)) continue;
      target.setAttribute('aria-invalid', 'true');
      labels.push(`${labelFor(name)}: ${message}`);
      first ??= target;
    }
    const details = first?.closest('details');
    if (details && !details.open) details.open = true;
    setStatus(labels.length > 0 ? `Please check these answers. ${labels.join(' ')}` : 'Please check your answers and try again.', 'error');
    first?.focus();
  };

  /* ---------------------------------------------------------------- submit */

  const finishSuccess = (result: ApiResult): void => {
    window.clearTimeout(saveTimer);
    saveEnabled = false;
    store.clear();
    if (draftRow) draftRow.hidden = true;
    hideRecovery();
    const ref = result.id ?? submissionId;
    submitButton?.classList.add('submit-btn--success');
    setLabel('Inquiry sent');
    setStatus(`Thanks. Your inquiry was handed to the mail system and I will follow up by email. Reference ${ref}.`, 'success', true);
    window.setTimeout(() => {
      form.reset();
      growTextareas();
      submissionId = createSubmissionId();
      if (idField) idField.value = submissionId;
      submitButton?.classList.remove('submit-btn--success');
      setLabel(originalLabel);
      if (submitButton) submitButton.disabled = false;
      saveEnabled = true;
      restored = false;
    }, RESET_AFTER_SUCCESS_MS);
  };

  const finishFailure = (result: ApiResult | null, httpStatus: number, networkFailure: boolean): void => {
    if (submitButton) submitButton.disabled = false;
    setLabel('Try again');
    if (result?.fieldErrors) {
      hideRecovery();
      showFieldErrors(result.fieldErrors);
      return;
    }
    const ref = result?.id ?? submissionId;
    let message: string;
    if (networkFailure) message = 'The connection failed, so your inquiry was not sent. Your answers are still here.';
    else if (httpStatus === 429) message = `Too many attempts. Wait ${result?.retryAfter ?? 60} seconds, then retry. Your answers are still here.`;
    else if (httpStatus === 413) message = 'That inquiry is too large to send. Shorten the longest answers, or send it by email. Your answers are still here.';
    else message = `${result?.error ?? 'The inquiry could not be sent.'} Your answers are still here.`;
    setStatus(`${message} Reference ${ref}.`, 'error', true);
    showRecovery(httpStatus !== 413);
  };

  const send = async (): Promise<void> => {
    if (busy) return;
    if (turnstileHolder && !turnstileToken) {
      startTurnstile();
      setStatus('Please wait for the spam check to finish, then send again.', 'error');
      return;
    }
    busy = true;
    form.setAttribute('aria-busy', 'true');
    clearFieldErrors();
    hideRecovery();
    if (submitButton) submitButton.disabled = true;
    setLabel('Sending...');
    setStatus('Sending your inquiry.', 'pending');

    if (idField) idField.value = submissionId;
    if (elapsedField) elapsedField.value = String(Math.round(performance.now() + (restored ? RESTORED_ELAPSED_BONUS_MS : 0)));
    const data = new FormData(form);
    if (turnstileToken) data.set(FIELD_ID.turnstile, turnstileToken);

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let result: ApiResult | null = null;
    let httpStatus = 0;
    let networkFailure = false;
    try {
      const response = await fetch(form.action, { method: 'POST', body: data, headers: { Accept: 'application/json' }, signal: controller.signal });
      httpStatus = response.status;
      result = (await response.json().catch(() => null)) as ApiResult | null;
      if (response.ok && result?.ok === true) {
        finishSuccess(result);
        return;
      }
    } catch {
      networkFailure = true;
    } finally {
      window.clearTimeout(timer);
      busy = false;
      form.removeAttribute('aria-busy');
      if (turnstileWidget !== undefined) {
        turnstileToken = '';
        turnstileApi()?.reset(turnstileWidget);
      }
    }
    finishFailure(result, httpStatus, networkFailure);
  };

  /* ---------------------------------------------------------------- events */

  form.querySelectorAll<HTMLTextAreaElement>('.auto-grow').forEach((textarea) => {
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    });
  });

  form.addEventListener('input', (event) => {
    const target = event.target;
    if (target instanceof HTMLElement) target.removeAttribute('aria-invalid');
    scheduleSave();
  });
  form.addEventListener('change', scheduleSave);
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void send();
  });
  retryButton?.addEventListener('click', () => form.requestSubmit());

  if (idField) idField.value = submissionId;
  restoreDraft();
}

const form = document.getElementById('intakeForm');
if (form instanceof HTMLFormElement) setup(form);
