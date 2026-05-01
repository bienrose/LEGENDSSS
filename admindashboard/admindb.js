/**
 * Admin Dashboard JavaScript
 * Handles all dynamic data fetching and CRUD operations
 */

const API_BASE = '/api/admin';

// Current state
let currentMode = null;
let currentTable = 'businesses';
let selectedRecord = null;
let pendingDelete = null;
let barangayList = [];

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadDashboardStats();
    loadBarangayList();
    initEventListeners();
    initNavTabs();
});

async function checkAuth() {
    try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();
        
        if (!data.authenticated || !data.isAdmin) {
            window.location.href = '/';
            return;
        }
        
        if (data.user) {
            document.querySelector('.sidebar-name').textContent = data.user.fullname || 'Admin';
        }
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = '/';
    }
}

function initNavTabs() {
    const navItems = document.querySelectorAll('.nav-item[data-view]');
    const views = {
        report: document.getElementById('view-report'),
        users: document.getElementById('view-users')
    };

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;

            // Update active state
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            // Show/hide views
            Object.keys(views).forEach(key => {
                if (views[key]) views[key].style.display = key === view ? 'flex' : 'none';
            });
        });
    });
}

async function loadDashboardStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const data = await response.json();
        
        document.getElementById('total-users').textContent = data.totalUsers.toLocaleString();
        updateChart(data.entrepreneurPct, data.aspiringPct, data.entrepreneurCount, data.aspiringCount);
    } catch (error) {
        console.error('Error loading stats:', error);
        document.getElementById('total-users').textContent = '--';
    }
}

async function loadBarangayList() {
    try {
        const response = await fetch(`${API_BASE}/barangays`);
        const data = await response.json();
        barangayList = data.barangays || [];
    } catch (error) {
        console.error('Error loading barangays:', error);
        barangayList = [];
    }
}

function updateChart(entrepreneurPct, aspiringPct, entrepreneurCount, aspiringCount) {
    const bars = [
        { barId: 'bar-entrepreneur', pctId: 'pct-entrepreneur', outId: 'outside-entrepreneur', value: entrepreneurPct, count: entrepreneurCount },
        { barId: 'bar-aspiring', pctId: 'pct-aspiring', outId: 'outside-aspiring', value: aspiringPct, count: aspiringCount }
    ];
    
    requestAnimationFrame(() => {
        setTimeout(() => {
            bars.forEach(b => {
                const bar = document.getElementById(b.barId);
                const pctEl = document.getElementById(b.pctId);
                const outside = document.getElementById(b.outId);
                
                if (!bar) return;
                
                bar.style.width = b.value + '%';
                
                const displayText = b.count !== undefined ? b.count.toLocaleString() : b.value + '%';
                
                if (b.value >= 20) {
                    if (pctEl) pctEl.textContent = displayText;
                    if (outside) outside.style.display = 'none';
                } else {
                    if (pctEl) pctEl.textContent = '';
                    if (outside) {
                        outside.style.display = 'inline';
                        outside.textContent = displayText;
                    }
                }
            });
        }, 120);
    });
}

function initEventListeners() {
    document.getElementById('add-data-btn').addEventListener('click', () => openModal('add'));
    document.getElementById('edit-data-btn').addEventListener('click', () => openModal('edit'));
    document.getElementById('delete-data-btn').addEventListener('click', () => openModal('delete'));
    
    document.getElementById('logout-nav-btn').addEventListener('click', () => {
        document.getElementById('logout-modal').classList.add('open');
    });
    document.getElementById('cancel-logout').addEventListener('click', () => {
        document.getElementById('logout-modal').classList.remove('open');
    });
    document.getElementById('confirm-logout').addEventListener('click', async () => {
        try {
            await fetch('/api/logout', { method: 'POST' });
        } catch (e) {}
        window.location.href = '/';
    });
    
    document.getElementById('crud-close').addEventListener('click', closeCrudModal);
    document.getElementById('crud-cancel').addEventListener('click', closeCrudModal);
    
    document.querySelectorAll('.modal-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    document.getElementById('crud-search-btn').addEventListener('click', performSearch);
    document.getElementById('crud-search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
    
    document.getElementById('crud-form').addEventListener('submit', handleFormSubmit);
    
    document.getElementById('delete-cancel').addEventListener('click', () => {
        document.getElementById('delete-confirm-modal').classList.remove('open');
        pendingDelete = null;
    });
    document.getElementById('delete-confirm').addEventListener('click', confirmDelete);
    
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('open');
            }
        });
    });
}

function openModal(mode) {
    currentMode = mode;
    const modal = document.getElementById('crud-modal');
    const title = document.getElementById('crud-modal-title');
    const searchSection = document.getElementById('crud-search-section');
    const resultsSection = document.getElementById('crud-results');
    const form = document.getElementById('crud-form');
    const initialActions = document.getElementById('crud-initial-actions');
    
    const titles = {
        'add': 'Add New Data',
        'edit': 'Edit Existing Data',
        'delete': 'Delete Data'
    };
    title.textContent = titles[mode];
    
    currentTable = 'businesses';
    selectedRecord = null;
    document.querySelectorAll('.modal-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === 'businesses');
    });
    
    if (mode === 'add') {
        searchSection.style.display = 'none';
        resultsSection.style.display = 'none';
        form.style.display = 'block';
        initialActions.style.display = 'none';
        renderForm();
    } else {
        searchSection.style.display = 'flex';
        resultsSection.style.display = 'block';
        form.style.display = 'none';
        initialActions.style.display = 'flex';
        document.getElementById('crud-search-input').value = '';
        
        const filterSelect = document.getElementById('crud-filter-barangay');
        if (mode === 'edit') {
            filterSelect.style.display = 'inline-block';
            populateBarangayFilter();
        } else {
            filterSelect.style.display = 'none';
        }
    }
    
    modal.classList.add('open');
}

function closeCrudModal() {
    document.getElementById('crud-modal').classList.remove('open');
    currentMode = null;
    selectedRecord = null;
}

function switchTab(table) {
    currentTable = table;
    document.querySelectorAll('.modal-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === table);
    });
    
    if (currentMode !== 'add') {
        document.getElementById('crud-search-input').value = '';
        document.getElementById('crud-results').style.display = 'none';
    } else {
        renderForm();
    }
}

function populateBarangayFilter() {
    const select = document.getElementById('crud-filter-barangay');
    select.innerHTML = '<option value="">All Barangays</option>';
    barangayList.forEach(b => {
        const option = document.createElement('option');
        option.value = b;
        option.textContent = b;
        select.appendChild(option);
    });
}

async function performSearch() {
    const searchTerm = document.getElementById('crud-search-input').value.trim();
    const barangayFilter = document.getElementById('crud-filter-barangay')?.value || '';
    
    let url = `${API_BASE}/${currentTable}`;
    let params = new URLSearchParams();
    
    if (currentTable === 'businesses') {
        params.append('limit', '50');
        if (searchTerm) params.append('search', searchTerm);
        if (barangayFilter) params.append('barangay', barangayFilter);
    }
    
    try {
        const response = await fetch(`${url}?${params.toString()}`);
        const data = await response.json();
        
        const results = currentTable === 'businesses' ? data.data : data.data;
        displaySearchResults(results);
    } catch (error) {
        console.error('Search error:', error);
        alert('Error searching. Please try again.');
    }
}

function displaySearchResults(results) {
    const resultsSection = document.getElementById('crud-results');
    const thead = document.getElementById('crud-table-header');
    const tbody = document.getElementById('crud-table-body');
    
    if (!results || results.length === 0) {
        tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;padding:20px;">No results found</td></tr>';
        resultsSection.style.display = 'block';
        return;
    }
    
    if (currentTable === 'businesses') {
        thead.innerHTML = `
            <th>ID</th>
            <th>Business Name</th>
            <th>Line of Business</th>
            <th>Category</th>
            <th>Barangay</th>
            <th>Street</th>
            <th>Address</th>
            <th>Latitude</th>
            <th>Longitude</th>
            <th>Population</th>
            <th>Density</th>
            <th>Income Min</th>
            <th>Income Max</th>
            <th>Actions</th>
        `;
        
        tbody.innerHTML = results.map(b => `
            <tr>
                <td>${b.id}</td>
                <td>${escapeHtml(b.business_trade_name || '--')}</td>
                <td>${escapeHtml(b.line_of_business || '--')}</td>
                <td>${escapeHtml(b.category || '--')}</td>
                <td>${escapeHtml(b.barangay || '--')}</td>
                <td>${escapeHtml(b.street || '--')}</td>
                <td>${escapeHtml((b.business_address || '').substring(0, 30))}${b.business_address && b.business_address.length > 30 ? '...' : ''}</td>
                <td>${b.lat || '--'}</td>
                <td>${b.lon || '--'}</td>
                <td>${b.population ? b.population.toLocaleString() : '--'}</td>
                <td>${b.population_density || '--'}</td>
                <td>${b.avg_income_min ? '₱' + b.avg_income_min.toLocaleString() : '--'}</td>
                <td>${b.avg_income_max ? '₱' + b.avg_income_max.toLocaleString() : '--'}</td>
                <td class="action-cell">
                    ${currentMode === 'edit' 
                        ? `<button class="edit-btn" onclick="editRecord(${b.id})">Edit</button>` 
                        : ''}
                    ${currentMode === 'delete' 
                        ? `<button class="delete-btn" onclick="deleteRecord(${b.id}, '${escapeHtml(b.business_trade_name || 'this business')}')">Delete</button>` 
                        : ''}
                </td>
            </tr>
        `).join('');
    } else {
        thead.innerHTML = `
            <th>ID</th>
            <th>Barangay</th>
            <th>Population</th>
            <th>Density</th>
            <th>Age Group</th>
            <th>Income Min</th>
            <th>Income Max</th>
            <th>Gender</th>
            <th>Actions</th>
        `;
        
        tbody.innerHTML = results.map(d => `
            <tr>
                <td>${d.id}</td>
                <td>${escapeHtml(d.barangay_name || '--')}</td>
                <td>${d.population ? d.population.toLocaleString() : '--'}</td>
                <td>${d.population_density || '--'}</td>
                <td>${escapeHtml(d.highest_age_group || '--')}</td>
                <td>${d.avg_income_min ? '₱' + d.avg_income_min.toLocaleString() : '--'}</td>
                <td>${d.avg_income_max ? '₱' + d.avg_income_max.toLocaleString() : '--'}</td>
                <td>${escapeHtml(d.gender_distribution || '--')}</td>
                <td class="action-cell">
                    ${currentMode === 'edit' 
                        ? `<button class="edit-btn" onclick="editRecord(${d.id})">Edit</button>` 
                        : ''}
                    ${currentMode === 'delete' 
                        ? `<button class="delete-btn" onclick="deleteRecord(${d.id}, '${escapeHtml(d.barangay_name || 'this barangay')}')">Delete</button>` 
                        : ''}
                </td>
            </tr>
        `).join('');
    }
    
    resultsSection.style.display = 'block';
}

async function editRecord(id) {
    try {
        const response = await fetch(`${API_BASE}/${currentTable}/${id}`);
        const data = await response.json();
        
        selectedRecord = currentTable === 'businesses' ? data.business : data.demographic;
        
        document.getElementById('crud-results').style.display = 'none';
        document.getElementById('crud-search-section').style.display = 'none';
        document.getElementById('crud-form').style.display = 'block';
        document.getElementById('crud-initial-actions').style.display = 'none';
        document.getElementById('crud-modal-title').textContent = `Edit ${currentTable === 'businesses' ? 'Business' : 'Demographic'}`;
        
        renderForm(selectedRecord);
    } catch (error) {
        console.error('Error fetching record:', error);
        alert('Error loading record. Please try again.');
    }
}

function deleteRecord(id, name) {
    pendingDelete = { id, table: currentTable, name };
    document.getElementById('delete-confirm-message').textContent = 
        `Are you sure you want to delete "${name}"? This action cannot be undone.`;
    document.getElementById('delete-confirm-modal').classList.add('open');
}

async function confirmDelete() {
    if (!pendingDelete) return;
    
    const { id, table } = pendingDelete;
    
    try {
        const response = await fetch(`${API_BASE}/${table}/${id}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (data.success) {
            alert('Record deleted successfully!');
            document.getElementById('delete-confirm-modal').classList.remove('open');
            closeCrudModal();
        } else {
            alert('Error: ' + (data.message || 'Unable to delete'));
        }
    } catch (error) {
        console.error('Delete error:', error);
        alert('Error deleting record. Please try again.');
    }
    
    pendingDelete = null;
}

function renderForm(data = null) {
    const fieldsContainer = document.getElementById('crud-form-fields');
    
    let html = '';
    
    if (currentTable === 'businesses') {
        html = `
            <div class="form-field full-width">
                <label>Business Trade Name *</label>
                <input type="text" name="business_trade_name" value="${escapeHtml(data?.business_trade_name || '')}" required>
            </div>
            <div class="form-field">
                <label>Category</label>
                <select name="category">
                    <option value="">-- Select --</option>
                    <option value="Food & Beverage" ${data?.category === 'Food & Beverage' ? 'selected' : ''}>Food & Beverage</option>
                    <option value="Retail & Trading" ${data?.category === 'Retail & Trading' ? 'selected' : ''}>Retail & Trading</option>
                    <option value="Wholesale & Import" ${data?.category === 'Wholesale & Import' ? 'selected' : ''}>Wholesale & Import</option>
                    <option value="Manufacturing" ${data?.category === 'Manufacturing' ? 'selected' : ''}>Manufacturing</option>
                    <option value="IT & Software" ${data?.category === 'IT & Software' ? 'selected' : ''}>IT & Software</option>
                    <option value="BPO & Call Center" ${data?.category === 'BPO & Call Center' ? 'selected' : ''}>BPO & Call Center</option>
                    <option value="Construction" ${data?.category === 'Construction' ? 'selected' : ''}>Construction</option>
                    <option value="Finance & Banking" ${data?.category === 'Finance & Banking' ? 'selected' : ''}>Finance & Banking</option>
                    <option value="Real Estate" ${data?.category === 'Real Estate' ? 'selected' : ''}>Real Estate</option>
                    <option value="Education" ${data?.category === 'Education' ? 'selected' : ''}>Education</option>
                    <option value="Healthcare" ${data?.category === 'Healthcare' ? 'selected' : ''}>Healthcare</option>
                    <option value="Logistics & Transport" ${data?.category === 'Logistics & Transport' ? 'selected' : ''}>Logistics & Transport</option>
                    <option value="Hospitality" ${data?.category === 'Hospitality' ? 'selected' : ''}>Hospitality</option>
                    <option value="Beauty & Wellness" ${data?.category === 'Beauty & Wellness' ? 'selected' : ''}>Beauty & Wellness</option>
                    <option value="Entertainment & Leisure" ${data?.category === 'Entertainment & Leisure' ? 'selected' : ''}>Entertainment & Leisure</option>
                    <option value="Other" ${data?.category === 'Other' ? 'selected' : ''}>Other</option>
                </select>
            </div>
            <div class="form-field">
                <label>Line of Business</label>
                <input type="text" name="line_of_business" value="${escapeHtml(data?.line_of_business || '')}">
            </div>
            <div class="form-field">
                <label>Barangay *</label>
                <select name="barangay" required>
                    <option value="">-- Select --</option>
                    ${barangayList.map(b => `<option value="${b}" ${data?.barangay === b ? 'selected' : ''}>${b}</option>`).join('')}
                </select>
            </div>
            <div class="form-field">
                <label>Street</label>
                <input type="text" name="street" value="${escapeHtml(data?.street || '')}">
            </div>
            <div class="form-field full-width">
                <label>Business Address</label>
                <textarea name="business_address">${escapeHtml(data?.business_address || '')}</textarea>
            </div>
            <div class="form-field">
                <label>Latitude</label>
                <input type="number" step="0.00000001" name="lat" value="${data?.lat || ''}" placeholder="e.g., 14.579400">
            </div>
            <div class="form-field">
                <label>Longitude</label>
                <input type="number" step="0.00000001" name="lon" value="${data?.lon || ''}" placeholder="e.g., 121.062000">
            </div>
        `;
    } else {
        html = `
            <div class="form-field full-width">
                <label>Barangay Name *</label>
                <input type="text" name="barangay_name" value="${escapeHtml(data?.barangay_name || '')}" required>
            </div>
            <div class="form-field">
                <label>Population</label>
                <input type="number" name="population" value="${data?.population || ''}">
            </div>
            <div class="form-field">
                <label>Population Density</label>
                <input type="number" step="0.01" name="population_density" value="${data?.population_density || ''}">
            </div>
            <div class="form-field">
                <label>Highest Age Group</label>
                <input type="text" name="highest_age_group" placeholder="e.g., 15-24, 25-54, 55+" value="${escapeHtml(data?.highest_age_group || '')}">
            </div>
            <div class="form-field">
                <label>Avg Income Min (₱)</label>
                <input type="number" name="avg_income_min" value="${data?.avg_income_min || ''}">
            </div>
            <div class="form-field">
                <label>Avg Income Max (₱)</label>
                <input type="number" name="avg_income_max" value="${data?.avg_income_max || ''}">
            </div>
            <div class="form-field">
                <label>Gender Distribution</label>
                <select name="gender_distribution">
                    <option value="">-- Select --</option>
                    <option value="Female" ${data?.gender_distribution === 'Female' ? 'selected' : ''}>Female</option>
                    <option value="Male" ${data?.gender_distribution === 'Male' ? 'selected' : ''}>Male</option>
                </select>
            </div>
        `;
    }
    
    fieldsContainer.innerHTML = html;
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    Object.keys(data).forEach(key => {
        if (data[key] === '') delete data[key];
    });
    
    let url = `${API_BASE}/${currentTable}`;
    let method = 'POST';
    
    if (selectedRecord) {
        url += `/${selectedRecord.id}`;
        method = 'PUT';
    }
    
    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert(selectedRecord ? 'Record updated successfully!' : 'Record added successfully!');
            closeCrudModal();
        } else {
            alert('Error: ' + (result.message || 'Operation failed'));
        }
    } catch (error) {
        console.error('Submit error:', error);
        alert('Error saving data. Please try again.');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.editRecord = editRecord;
window.deleteRecord = deleteRecord;