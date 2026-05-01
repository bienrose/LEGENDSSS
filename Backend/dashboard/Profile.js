const editBtn         = document.getElementById('edit-btn');
const saveBtn         = document.getElementById('save-btn');
const cancelBtn       = document.getElementById('cancel-btn');
const logoutBtn       = document.getElementById('logout-btn');

const fullnameInput   = document.getElementById('fullname');
const emailInput      = document.getElementById('email');
const usernameInput   = document.getElementById('username');
const passwordInput   = document.getElementById('password');
const affiliationSelect = document.getElementById('affiliation');
const industrySelect  = document.getElementById('industry');
const industrySpecificInput = document.getElementById('industry_specific');

const navProfile  = document.getElementById('nav-profile');
const navReports  = document.getElementById('nav-reports');
const profileSection = document.getElementById('profile-section');
const reportsSection = document.getElementById('reports-section');
const pageTitle   = document.getElementById('page-title');

let isEditing = false;
let originalData = {};
let currentUserRole = null;

function hasSwal() {
  return typeof window.Swal === 'function' || (window.Swal && typeof window.Swal.fire === 'function');
}

function swalFire(opts) {
  if (window.Swal?.fire) return window.Swal.fire(opts);
  return Promise.resolve();
}

// ─── LOAD ────────────────────────────────────────────────────────────────────

async function loadUserData() {
  try {
    const response = await fetch('/api/user-profile', {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (data.success && data.user) {
      const user = data.user;

      fullnameInput.value   = user.fullname  || '';
      emailInput.value      = user.email     || '';
      usernameInput.value   = user.username  || '';
      passwordInput.value   = '';
      affiliationSelect.value = user.affiliation || '';
      industrySelect.value  = user.industry  || '';
      industrySpecificInput.value = user.industry_specific || '';

      currentUserRole = user.role || 'user';

      originalData = {
        fullname:          user.fullname          || '',
        email:             user.email             || '',
        username:          user.username          || '',
        affiliation:       user.affiliation       || '',
        industry:          user.industry          || '',
        industry_specific: user.industry_specific || '',
        role:              user.role              || 'user'
      };
    } else {
      if (hasSwal()) await swalFire({ icon: 'error', title: 'Error', text: data.message || 'Failed to load profile' });
      else alert('Error: ' + (data.message || 'Failed to load profile'));
    }
  } catch (err) {
    if (hasSwal()) await swalFire({ icon: 'error', title: 'Error', text: 'Error loading profile: ' + err.message });
    else alert('Error loading profile: ' + err.message);
  }
}

// ─── ENABLE / DISABLE EDITING ────────────────────────────────────────────────

function enableEditing() {
  isEditing = true;

  fullnameInput.removeAttribute('readonly');
  emailInput.removeAttribute('readonly');
  usernameInput.removeAttribute('readonly');
  passwordInput.removeAttribute('readonly');
  affiliationSelect.removeAttribute('disabled');
  industrySelect.removeAttribute('disabled');
  industrySpecificInput.removeAttribute('readonly');

  [fullnameInput, emailInput, usernameInput, passwordInput,
   affiliationSelect, industrySelect, industrySpecificInput]
    .forEach(el => el.classList.add('editable'));

  editBtn.style.display   = 'none';
  saveBtn.style.display   = 'inline-block';
  cancelBtn.style.display = 'inline-block';
}

function disableEditing() {
  isEditing = false;

  fullnameInput.setAttribute('readonly', 'readonly');
  emailInput.setAttribute('readonly', 'readonly');
  usernameInput.setAttribute('readonly', 'readonly');
  passwordInput.setAttribute('readonly', 'readonly');
  affiliationSelect.setAttribute('disabled', 'disabled');
  industrySelect.setAttribute('disabled', 'disabled');
  industrySpecificInput.setAttribute('readonly', 'readonly');

  [fullnameInput, emailInput, usernameInput, passwordInput,
   affiliationSelect, industrySelect, industrySpecificInput]
    .forEach(el => el.classList.remove('editable'));

  editBtn.style.display   = 'inline-block';
  saveBtn.style.display   = 'none';
  cancelBtn.style.display = 'none';
}

// ─── SAVE ────────────────────────────────────────────────────────────────────

async function saveUserData() {
  try {
    const userData = {
      fullname:          fullnameInput.value.trim(),
      email:             emailInput.value.trim(),
      username:          usernameInput.value.trim(),
      password:          passwordInput.value,
      affiliation:       affiliationSelect.value,
      industry:          industrySelect.value,
      industry_specific: industrySpecificInput.value.trim(),
      role:              currentUserRole
    };

    if (!userData.fullname || !userData.email || !userData.username || !userData.affiliation) {
      if (hasSwal()) await swalFire({ icon: 'warning', title: 'Missing fields', text: 'Please fill in all required fields.' });
      else alert('Please fill in all required fields');
      return;
    }

    const response = await fetch('/api/user-profile', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(userData)
    });

    const data = await response.json();

    if (data.success) {
      if (hasSwal()) {
        await swalFire({ icon: 'success', title: 'Saved!', text: 'Profile updated successfully.', timer: 1400, showConfirmButton: false });
      } else {
        alert('Profile updated successfully!');
      }
      disableEditing();
      await loadUserData();
    } else {
      if (hasSwal()) await swalFire({ icon: 'error', title: 'Save failed', text: data.message || 'Failed to update profile' });
      else alert('Error: ' + (data.message || 'Failed to update profile'));
    }
  } catch (err) {
    if (hasSwal()) await swalFire({ icon: 'error', title: 'Error', text: 'Error saving profile: ' + err.message });
    else alert('Error saving profile: ' + err.message);
  }
}

// ─── CANCEL ──────────────────────────────────────────────────────────────────

function cancelEditing() {
  fullnameInput.value             = originalData.fullname;
  emailInput.value                = originalData.email;
  usernameInput.value             = originalData.username;
  affiliationSelect.value         = originalData.affiliation;
  industrySelect.value            = originalData.industry;
  industrySpecificInput.value     = originalData.industry_specific;
  passwordInput.value             = '';
  disableEditing();
}

// ─── NAV ─────────────────────────────────────────────────────────────────────

function showSection(which) {
  if (which === 'reports') {
    navProfile.classList.remove('active');
    navReports.classList.add('active');
    profileSection.classList.add('hidden');
    reportsSection.classList.remove('hidden');
    pageTitle.textContent = 'Report Module';
    if (typeof window.renderReports === 'function') window.renderReports();
  } else {
    navReports.classList.remove('active');
    navProfile.classList.add('active');
    reportsSection.classList.add('hidden');
    profileSection.classList.remove('hidden');
    pageTitle.textContent = 'My Profile';
  }
}

// ─── EVENTS ──────────────────────────────────────────────────────────────────

editBtn?.addEventListener('click', enableEditing);
saveBtn?.addEventListener('click', saveUserData);
cancelBtn?.addEventListener('click', cancelEditing);

navProfile?.addEventListener('click', () => showSection('profile'));
navReports?.addEventListener('click', () => showSection('reports'));

logoutBtn?.addEventListener('click', () => { window.location.href = '/dashboard'; });

document.addEventListener('DOMContentLoaded', async () => {
  await loadUserData();
  showSection('profile');
});