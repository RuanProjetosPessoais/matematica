(() => {
  "use strict";

  const $  = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  const cards        = $$('.card');
  const categories   = $$('.category');
  const search       = $('#search');
  const noResults    = $('#noResults');
  const noResultsQry = $('#noResultsQuery');
  const toast        = $('#toast');

  /* ---------- contadores ---------- */
  const total = cards.length;
  const ready = cards.filter(c => c.classList.contains('ready')).length;
  $('#readyCount').textContent = ready;
  $('#totalCount').textContent = total;

  /* ---------- busca ---------- */
  function filter(){
    const q = search.value.trim().toLowerCase();

    if (!q){
      cards.forEach(c => c.classList.remove('hidden'));
      categories.forEach(c => c.classList.remove('hidden'));
      noResults.classList.add('hidden');
      return;
    }

    let anyVisible = false;

    cards.forEach(card => {
      const text  = card.textContent.toLowerCase();
      const match = text.includes(q);
      card.classList.toggle('hidden', !match);
      if (match) anyVisible = true;
    });

    categories.forEach(cat => {
      const visibleInCat = cat.querySelectorAll('.card:not(.hidden)').length > 0;
      cat.classList.toggle('hidden', !visibleInCat);
    });

    noResults.classList.toggle('hidden', anyVisible);
    if (!anyVisible) noResultsQry.textContent = q;
  }

  search.addEventListener('input', filter);

  /* ---------- toast ---------- */
  let toastTimer = null;
  function showToast(msg){
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  /* ---------- cards "em breve" ---------- */
  $$('.card.soon').forEach(card => {
    const name = card.dataset.name ||
                 card.querySelector('h3')?.textContent ||
                 'Este módulo';

    card.addEventListener('click', () => {
      showToast(`⏳ "${name}" chega em breve!`);
    });

    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        showToast(`⏳ "${name}" chega em breve!`);
      }
    });
  });

  /* ---------- atalho: "/" foca a busca ---------- */
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== search){
      e.preventDefault();
      search.focus();
    }
  });
})();