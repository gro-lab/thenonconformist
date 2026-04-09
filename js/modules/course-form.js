// js/modules/course-form.js
// Photography course & Timișoara walk sign-up form — Formspree integration
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom } from '../dom-elements.js';

const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xojpzavq';

let abortController = null;

// ==================== Open / Close ====================

export const openCourseForm = () => {
  const modal = document.getElementById('course-form-modal');
  if (!modal) return;
  history.pushState({ page: 'course-form' }, '', window.location.href);
  store.set('isCourseFormOpen', true);
  modal.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
  // Reset to initial state each time
  showStep('form');
};

export const closeCourseForm = () => {
  const modal = document.getElementById('course-form-modal');
  if (!modal) return;
  modal.setAttribute('hidden', '');
  document.body.style.overflow = 'auto';
  store.set('isCourseFormOpen', false);
};

// ==================== Step toggling ====================

const showStep = (step) => {
  const formStep    = document.getElementById('cf-step-form');
  const successStep = document.getElementById('cf-step-success');
  const errorStep   = document.getElementById('cf-step-error');
  if (!formStep) return;

  formStep.hidden    = step !== 'form';
  successStep.hidden = step !== 'success';
  errorStep.hidden   = step !== 'error';

  if (step === 'form') {
    document.getElementById('cf-form')?.reset();
    setSubmitting(false);
  }
};

const setSubmitting = (submitting) => {
  const btn    = document.getElementById('cf-submit-btn');
  const spinner = document.getElementById('cf-spinner');
  if (!btn) return;
  btn.disabled = submitting;
  if (spinner) spinner.hidden = !submitting;
  btn.querySelector('.cf-btn-label').textContent = submitting ? 'Sending…' : 'Sign Me Up';
};

// ==================== Form submission ====================

const handleSubmit = async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));

  setSubmitting(true);

  try {
    const res = await fetch(FORMSPREE_ENDPOINT, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      showStep('success');
    } else {
      showStep('error');
    }
  } catch (_) {
    showStep('error');
  }
};

// ==================== Init ====================

export const initCourseForm = () => {
  console.log('📸 Initializing course form module…');

  if (abortController) abortController.abort();
  abortController = new AbortController();
  const { signal } = abortController;

  // Trigger link in site description
  document.getElementById('course-signup-link')
    ?.addEventListener('click', (e) => { e.preventDefault(); openCourseForm(); }, { signal });

  const modal = document.getElementById('course-form-modal');
  if (!modal) return;

  // Close button
  document.getElementById('cf-close')
    ?.addEventListener('click', () => history.back(), { signal });

  // Click outside to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) history.back();
  }, { signal });

  // Form submission
  document.getElementById('cf-form')
    ?.addEventListener('submit', handleSubmit, { signal });

  // Try again button
  document.getElementById('cf-try-again')
    ?.addEventListener('click', () => showStep('form'), { signal });

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && store.get('isCourseFormOpen')) history.back();
  }, { signal });
};

export const destroyCourseForm = () => {
  abortController?.abort();
  abortController = null;
};
