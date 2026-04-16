const bars = [
    { barId: 'bar-entrepreneur',  pctId: 'pct-entrepreneur',  outId: 'outside-entrepreneur',  value: 72 },
    { barId: 'bar-aspiring',      pctId: 'pct-aspiring',      outId: 'outside-aspiring',      value: 28 },
  ];

  requestAnimationFrame(() => {
    setTimeout(() => {
      bars.forEach(b => {
        const bar     = document.getElementById(b.barId);
        const pctEl   = document.getElementById(b.pctId);
        const outside = document.getElementById(b.outId);
        bar.style.width = b.value + '%';
       
        if (b.value >= 20) {
          pctEl.textContent = b.value + '%';
          outside.style.display = 'none';
        } else {
          pctEl.textContent = '';
          outside.style.display = 'inline';
        }
      });
    }, 120);
  });

  const logoutModal  = document.getElementById('logout-modal');
  document.getElementById('logout-nav-btn').addEventListener('click', () => {
    logoutModal.classList.add('open');
  });
  document.getElementById('cancel-logout').addEventListener('click', () => {
    logoutModal.classList.remove('open');
  });
  document.getElementById('confirm-logout').addEventListener('click', () => {
    logoutModal.classList.remove('open');
    alert('You have been logged out.');
  });

  document.getElementById('add-data-btn').addEventListener('click', () => {
    alert('Add data — connect your backend here.');
  });
  document.getElementById('edit-data-btn').addEventListener('click', () => {
    alert('Edit data — connect your backend here.');
  });
  document.getElementById('delete-data-btn').addEventListener('click', () => {
    alert('Delete data — connect your backend here.');
  });