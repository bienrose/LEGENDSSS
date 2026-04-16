const editBtn = document.getElementById('edit-btn');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');
const backBtn = document.getElementById('back-btn');

const fullnameInput = document.getElementById('fullname');
const emailInput = document.getElementById('email');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const affiliationSelect = document.getElementById('affiliation');

let isEditing = false;
let originalData = {};

async function loadUserData() {
    try {
        console.log('Fetching user profile...');
        const response = await fetch('/api/user-profile', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers.get('content-type'));

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log('Response data:', data);

        if (data.success && data.user) {
            const user = data.user;
            fullnameInput.value = user.fullname || '';
            emailInput.value = user.email || '';
            usernameInput.value = user.username || '';
            affiliationSelect.value = user.affiliation || '';
            passwordInput.value = '';

            originalData = {
                fullname: user.fullname || '',
                email: user.email || '',
                username: user.username || '',
                affiliation: user.affiliation || ''
            };
            console.log('Profile loaded successfully');
        } else {
            console.error('API Response error:', data);
            alert('Error: ' + (data.message || 'Failed to load profile'));
        }
    } catch (err) {
        console.error('Error loading profile:', err);
        alert('Error loading profile: ' + err.message);
    }
}

function enableEditing() {
    isEditing = true;
    fullnameInput.removeAttribute('readonly');
    emailInput.removeAttribute('readonly');
    usernameInput.removeAttribute('readonly');
    passwordInput.removeAttribute('readonly');
    affiliationSelect.removeAttribute('disabled');

    fullnameInput.classList.add('editable');
    emailInput.classList.add('editable');
    usernameInput.classList.add('editable');
    passwordInput.classList.add('editable');
    affiliationSelect.classList.add('editable');

    editBtn.style.display = 'none';
    saveBtn.style.display = 'inline-block';
    cancelBtn.style.display = 'inline-block';
}

function disableEditing() {
    isEditing = false;
    fullnameInput.setAttribute('readonly', 'readonly');
    emailInput.setAttribute('readonly', 'readonly');
    usernameInput.setAttribute('readonly', 'readonly');
    passwordInput.setAttribute('readonly', 'readonly');
    affiliationSelect.setAttribute('disabled', 'disabled');

    fullnameInput.classList.remove('editable');
    emailInput.classList.remove('editable');
    usernameInput.classList.remove('editable');
    passwordInput.classList.remove('editable');
    affiliationSelect.classList.remove('editable');

    editBtn.style.display = 'inline-block';
    saveBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
}

async function saveUserData() {
    try {
        const userData = {
            fullname: fullnameInput.value.trim(),
            email: emailInput.value.trim(),
            username: usernameInput.value.trim(),
            password: passwordInput.value,
            affiliation: affiliationSelect.value
        };

        if (!userData.fullname || !userData.email || !userData.username || !userData.affiliation) {
            alert('Please fill in all required fields');
            return;
        }

        const response = await fetch('/api/user-profile', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(userData)
        });

        const data = await response.json();

        if (data.success) {
            alert('Profile updated successfully!');
            disableEditing();
            await loadUserData();
        } else {
            alert('Error: ' + (data.message || 'Failed to update profile'));
        }
    } catch (err) {
        console.error('Error saving profile:', err);
        alert('Error saving profile: ' + err.message);
    }
}

function cancelEditing() {
    fullnameInput.value = originalData.fullname;
    emailInput.value = originalData.email;
    usernameInput.value = originalData.username;
    affiliationSelect.value = originalData.affiliation;
    passwordInput.value = '';
    disableEditing();
}

editBtn.addEventListener('click', enableEditing);
saveBtn.addEventListener('click', saveUserData);
cancelBtn.addEventListener('click', cancelEditing);

backBtn.addEventListener('click', () => {
    window.location.href = '/dashboard/dashboard.html';
});

document.addEventListener('DOMContentLoaded', loadUserData);