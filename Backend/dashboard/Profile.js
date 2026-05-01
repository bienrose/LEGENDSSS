const editBtn=document.getElementById('edit-btn');
const saveBtn=document.getElementById('save-btn');
const cancelBtn=document.getElementById('cancel-btn');
const logoutBtn=document.getElementById('logout-btn');

const fullnameInput=document.getElementById('fullname');
const emailInput=document.getElementById('email');
const usernameInput=document.getElementById('username');
const passwordInput=document.getElementById('password');
const affiliationSelect=document.getElementById('affiliation');

const navProfile=document.getElementById('nav-profile');
const navReports=document.getElementById('nav-reports');
const profileSection=document.getElementById('profile-section');
const reportsSection=document.getElementById('reports-section');
const pageTitle=document.getElementById('page-title');

let isEditing=false;
let originalData={};
let currentUserRole=null;

async function loadUserData(){
  try{
    const response=await fetch('/api/user-profile',{method:'GET',credentials:'include',headers:{'Accept':'application/json'}});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    if(data.success&&data.user){
      const user=data.user;
      fullnameInput.value=user.fullname||'';
      emailInput.value=user.email||'';
      usernameInput.value=user.username||'';
      affiliationSelect.value=user.affiliation||'';
      passwordInput.value='';
      currentUserRole=user.role||'user';
      originalData={fullname:user.fullname||'',email:user.email||'',username:user.username||'',affiliation:user.affiliation||'',role:user.role||'user'};
    }else{
      alert('Error: '+(data.message||'Failed to load profile'));
    }
  }catch(err){
    alert('Error loading profile: '+err.message);
  }
}

function enableEditing(){
  isEditing=true;
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
  editBtn.style.display='none';
  saveBtn.style.display='inline-block';
  cancelBtn.style.display='inline-block';
}

function disableEditing(){
  isEditing=false;
  fullnameInput.setAttribute('readonly','readonly');
  emailInput.setAttribute('readonly','readonly');
  usernameInput.setAttribute('readonly','readonly');
  passwordInput.setAttribute('readonly','readonly');
  affiliationSelect.setAttribute('disabled','disabled');
  fullnameInput.classList.remove('editable');
  emailInput.classList.remove('editable');
  usernameInput.classList.remove('editable');
  passwordInput.classList.remove('editable');
  affiliationSelect.classList.remove('editable');
  editBtn.style.display='inline-block';
  saveBtn.style.display='none';
  cancelBtn.style.display='none';
}

async function saveUserData(){
  try{
    const userData={fullname:fullnameInput.value.trim(),email:emailInput.value.trim(),username:usernameInput.value.trim(),password:passwordInput.value,affiliation:affiliationSelect.value,role:currentUserRole};
    if(!userData.fullname||!userData.email||!userData.username||!userData.affiliation){alert('Please fill in all required fields');return;}
    const response=await fetch('/api/user-profile',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(userData)});
    const data=await response.json();
    if(data.success){
      alert('Profile updated successfully!');
      disableEditing();
      await loadUserData();
    }else{
      alert('Error: '+(data.message||'Failed to update profile'));
    }
  }catch(err){
    alert('Error saving profile: '+err.message);
  }
}

function cancelEditing(){
  fullnameInput.value=originalData.fullname;
  emailInput.value=originalData.email;
  usernameInput.value=originalData.username;
  affiliationSelect.value=originalData.affiliation;
  passwordInput.value='';
  disableEditing();
}

function showSection(which){
  if(which==='reports'){
    navProfile.classList.remove('active');
    navReports.classList.add('active');
    profileSection.classList.add('hidden');
    reportsSection.classList.remove('hidden');
    pageTitle.textContent='Report Module';
    if(typeof window.renderReports==='function') window.renderReports();
  }else{
    navReports.classList.remove('active');
    navProfile.classList.add('active');
    reportsSection.classList.add('hidden');
    profileSection.classList.remove('hidden');
    pageTitle.textContent='My Profile';
  }
}

editBtn?.addEventListener('click',enableEditing);
saveBtn?.addEventListener('click',saveUserData);
cancelBtn?.addEventListener('click',cancelEditing);

navProfile?.addEventListener('click',()=>showSection('profile'));
navReports?.addEventListener('click',()=>showSection('reports'));

logoutBtn?.addEventListener('click',()=>{window.location.href='/dashboard/dashboard.html';});

document.addEventListener('DOMContentLoaded',async()=>{await loadUserData();showSection('profile');});