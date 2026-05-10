/**
 * Admin Dashboard JavaScript
 * Handles all dynamic data fetching and CRUD operations
 */

const API_BASE = '/api/admin';

let currentMode = null;
let currentTable = 'businesses';
let selectedRecord = null;
let pendingDelete = null;
let barangayList = [];

// ─── REPORT FILTERS (multi-select) ───────────────────────────────────────────
let reportTypeFilters = new Set(['search', 'recommendation', 'saved']); // all selected by default
let reportUserFilter = 'all';
let reportDateFrom = null;
let reportDateTo = null;
let allUsers = [];

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadDashboardStats();
    loadBarangayList();
    initEventListeners();
    initNavTabs();
    loadReportHistory();
    loadAllUsers();
    initModernDatePicker();
    initExportModal();
});

async function checkAuth() {
    try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();
        if (!data.authenticated || !data.isAdmin) { window.location.href = '/'; return; }
        if (data.user) document.querySelector('.sidebar-name').textContent = data.user.fullname || 'Admin';
    } catch { window.location.href = '/'; }
}

function initNavTabs() {
    const navItems = document.querySelectorAll('.nav-item[data-view]');
    const views = {
        report: document.getElementById('view-report'),
        users: document.getElementById('view-users'),
        profile: document.getElementById('view-profile')
    };
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            Object.keys(views).forEach(key => {
                if (views[key]) views[key].style.display = key === view ? 'flex' : 'none';
            });
            if (view === 'profile') loadAdminProfile();
        });
    });
}

// ─── LOAD ALL USERS ───────────────────────────────────────────────────────────
async function loadAllUsers() {
    try {
        const res = await fetch('/api/admin/users');
        const data = await res.json();
        if (data.success) { allUsers = data.users || []; populateUserFilter(); }
    } catch (err) { console.warn('Could not load users:', err); }
}

function populateUserFilter() {
    const container = document.getElementById('user-filter-chips');
    if (!container) return;
    container.innerHTML = `
        <div class="user-search-wrap">
            <input type="text" id="user-search-input" class="user-search-input" placeholder="Search users..." autocomplete="off">
            <div id="user-search-dropdown" class="user-search-dropdown hidden"></div>
        </div>
        <div id="selected-user-chip" class="selected-user-chip hidden">
            <span id="selected-user-label"></span>
            <button onclick="clearUserFilter()" class="chip-clear-btn" title="Clear">×</button>
        </div>
    `;
    const input = document.getElementById('user-search-input');
    const dropdown = document.getElementById('user-search-dropdown');

    input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        if (!q) { dropdown.classList.add('hidden'); return; }
        const matches = allUsers.filter(u =>
            (u.fullname || '').toLowerCase().includes(q) ||
            (u.username || '').toLowerCase().includes(q)
        ).slice(0, 8);
        if (!matches.length) { dropdown.innerHTML = '<div class="user-dd-item no-match">No users found</div>'; dropdown.classList.remove('hidden'); return; }
        dropdown.innerHTML = matches.map(u => `
            <div class="user-dd-item" onclick="selectUser('${u.id}', '${escapeHtml(u.fullname)} (@${escapeHtml(u.username)})')">
                <span class="user-dd-name">${escapeHtml(u.fullname)}</span>
                <span class="user-dd-username">@${escapeHtml(u.username)}</span>
            </div>
        `).join('');
        dropdown.classList.remove('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.user-search-wrap')) dropdown.classList.add('hidden');
    });
}

function selectUser(id, label) {
    reportUserFilter = id;
    const chip = document.getElementById('selected-user-chip');
    const lbl = document.getElementById('selected-user-label');
    const input = document.getElementById('user-search-input');
    const dropdown = document.getElementById('user-search-dropdown');
    if (chip) chip.classList.remove('hidden');
    if (lbl) lbl.textContent = label;
    if (input) input.value = '';
    if (dropdown) dropdown.classList.add('hidden');
    if (window._allReportRows) renderReportList(window._allReportRows);
}

function clearUserFilter() {
    reportUserFilter = 'all';
    const chip = document.getElementById('selected-user-chip');
    if (chip) chip.classList.add('hidden');
    if (window._allReportRows) renderReportList(window._allReportRows);
}

// ─── MODERN DATE PICKER ───────────────────────────────────────────────────────
function initModernDatePicker() {
    const container = document.getElementById('modern-date-picker');
    if (!container) return;

    container.innerHTML = `
        <div class="mdp-wrap">
            <div class="mdp-field" id="mdp-from-field" onclick="toggleDatePanel('from')">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="14" height="14" rx="2"/><path d="M3 8h14M7 2v4M13 2v4"/></svg>
                <span id="mdp-from-label">From</span>
                <svg class="mdp-caret" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 1l4 4 4-4"/></svg>
            </div>
            <span class="mdp-sep">→</span>
            <div class="mdp-field" id="mdp-to-field" onclick="toggleDatePanel('to')">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="14" height="14" rx="2"/><path d="M3 8h14M7 2v4M13 2v4"/></svg>
                <span id="mdp-to-label">To</span>
                <svg class="mdp-caret" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 1l4 4 4-4"/></svg>
            </div>
            <button class="mdp-clear-btn" onclick="clearModernDates()" title="Clear dates">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3l10 10M13 3L3 13"/></svg>
            </button>
        </div>
        <div id="mdp-panel" class="mdp-panel hidden">
            <div class="mdp-panel-header">
                <button class="mdp-nav" onclick="changeMonth(-1)">&#8249;</button>
                <span id="mdp-month-label" class="mdp-month-label"></span>
                <button class="mdp-nav" onclick="changeMonth(1)">&#8250;</button>
            </div>
            <div class="mdp-weekdays">
                <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
            </div>
            <div id="mdp-days" class="mdp-days"></div>
            <div class="mdp-actions">
                <button class="mdp-apply" onclick="applyDateRange()">Apply</button>
                <button class="mdp-cancel" onclick="closeDatePanel()">Cancel</button>
            </div>
        </div>
    `;

    injectDatePickerStyles();
}

let mdpState = {
    selecting: null,
    viewYear: new Date().getFullYear(),
    viewMonth: new Date().getMonth(),
    from: null,
    to: null,
    tempFrom: null,
    tempTo: null
};

function toggleDatePanel(which) {
    const panel = document.getElementById('mdp-panel');
    if (!panel) return;
    if (!panel.classList.contains('hidden') && mdpState.selecting === which) {
        closeDatePanel(); return;
    }
    mdpState.selecting = which;
    mdpState.tempFrom = mdpState.from;
    mdpState.tempTo = mdpState.to;
    mdpState.viewYear = new Date().getFullYear();
    mdpState.viewMonth = new Date().getMonth();
    if (mdpState.from) { const d = new Date(mdpState.from); mdpState.viewYear = d.getFullYear(); mdpState.viewMonth = d.getMonth(); }
    panel.classList.remove('hidden');
    renderCalendar();
}

function closeDatePanel() {
    const panel = document.getElementById('mdp-panel');
    if (panel) panel.classList.add('hidden');
    mdpState.selecting = null;
}

function changeMonth(delta) {
    mdpState.viewMonth += delta;
    if (mdpState.viewMonth > 11) { mdpState.viewMonth = 0; mdpState.viewYear++; }
    if (mdpState.viewMonth < 0) { mdpState.viewMonth = 11; mdpState.viewYear--; }
    renderCalendar();
}

function renderCalendar() {
    const label = document.getElementById('mdp-month-label');
    const daysEl = document.getElementById('mdp-days');
    if (!label || !daysEl) return;

    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    label.textContent = `${months[mdpState.viewMonth]} ${mdpState.viewYear}`;

    const first = new Date(mdpState.viewYear, mdpState.viewMonth, 1);
    const daysInMonth = new Date(mdpState.viewYear, mdpState.viewMonth + 1, 0).getDate();
    const startDay = first.getDay();

    const fromDate = mdpState.tempFrom ? new Date(mdpState.tempFrom) : null;
    const toDate = mdpState.tempTo ? new Date(mdpState.tempTo) : null;

    let html = '';
    for (let i = 0; i < startDay; i++) html += '<span class="mdp-day empty"></span>';

    for (let d = 1; d <= daysInMonth; d++) {
        const thisDate = new Date(mdpState.viewYear, mdpState.viewMonth, d);
        const ymd = `${mdpState.viewYear}-${String(mdpState.viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        let cls = 'mdp-day';
        const isFrom = fromDate && thisDate.toDateString() === fromDate.toDateString();
        const isTo = toDate && thisDate.toDateString() === toDate.toDateString();
        const inRange = fromDate && toDate && thisDate > fromDate && thisDate < toDate;
        if (isFrom) cls += ' is-from';
        if (isTo) cls += ' is-to';
        if (inRange) cls += ' in-range';
        if (isFrom || isTo) cls += ' selected';
        html += `<span class="${cls}" data-date="${ymd}" onclick="selectDay('${ymd}')">${d}</span>`;
    }
    daysEl.innerHTML = html;
}

function selectDay(ymd) {
    if (mdpState.selecting === 'from') {
        mdpState.tempFrom = ymd;
        if (mdpState.tempTo && ymd > mdpState.tempTo) mdpState.tempTo = null;
    } else if (mdpState.selecting === 'to') {
        if (mdpState.tempFrom && ymd < mdpState.tempFrom) { mdpState.tempFrom = ymd; mdpState.tempTo = null; }
        else mdpState.tempTo = ymd;
    }
    renderCalendar();
    updateDateFieldLabels();
}

function updateDateFieldLabels() {
    const fromLbl = document.getElementById('mdp-from-label');
    const toLbl = document.getElementById('mdp-to-label');
    if (fromLbl) fromLbl.textContent = mdpState.tempFrom ? formatShortDate(mdpState.tempFrom) : 'From';
    if (toLbl) toLbl.textContent = mdpState.tempTo ? formatShortDate(mdpState.tempTo) : 'To';

    const fromField = document.getElementById('mdp-from-field');
    const toField = document.getElementById('mdp-to-field');
    if (fromField) fromField.classList.toggle('has-value', !!mdpState.tempFrom);
    if (toField) toField.classList.toggle('has-value', !!mdpState.tempTo);
}

function applyDateRange() {
    mdpState.from = mdpState.tempFrom;
    mdpState.to = mdpState.tempTo;
    reportDateFrom = mdpState.from || null;
    reportDateTo = mdpState.to || null;
    updateDateFieldLabels();
    closeDatePanel();
    if (window._allReportRows) renderReportList(window._allReportRows);
}

function clearModernDates() {
    mdpState.from = null; mdpState.to = null;
    mdpState.tempFrom = null; mdpState.tempTo = null;
    reportDateFrom = null; reportDateTo = null;
    updateDateFieldLabels();
    closeDatePanel();
    if (window._allReportRows) renderReportList(window._allReportRows);
}

function formatShortDate(ymd) {
    if (!ymd) return '';
    const [y, m, d] = ymd.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m)-1]} ${parseInt(d)}, ${y}`;
}

function injectDatePickerStyles() {
    if (document.getElementById('mdp-styles')) return;
    const s = document.createElement('style');
    s.id = 'mdp-styles';
    s.textContent = `
        .mdp-wrap { display:flex; align-items:center; gap:8px; flex-wrap:wrap; position:relative; }
        .mdp-field {
            display:flex; align-items:center; gap:7px;
            padding:7px 12px; border-radius:10px;
            border:1.5px solid #dde3ee; background:#f8fafd;
            cursor:pointer; transition:all .18s; min-width:120px;
            font-size:13px; color:#7a8fa8; font-weight:500; user-select:none;
        }
        .mdp-field svg { width:15px; height:15px; flex-shrink:0; stroke:#7a8fa8; }
        .mdp-field:hover { border-color:#378ADD; background:#fff; color:#1a3a5c; }
        .mdp-field.has-value { border-color:#1a3a5c; background:#e8f0f8; color:#1a3a5c; font-weight:600; }
        .mdp-field.has-value svg { stroke:#1a3a5c; }
        .mdp-caret { width:10px!important; height:10px!important; margin-left:auto; }
        .mdp-sep { color:#aab8c8; font-size:16px; font-weight:300; }
        .mdp-clear-btn {
            width:30px; height:30px; border-radius:50%; border:1.5px solid #e2e8ef;
            background:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center;
            transition:all .15s; flex-shrink:0;
        }
        .mdp-clear-btn svg { width:12px; height:12px; stroke:#aaa; }
        .mdp-clear-btn:hover { border-color:#e74c3c; background:#fdecea; }
        .mdp-clear-btn:hover svg { stroke:#e74c3c; }
        .mdp-panel {
            position:absolute; top:calc(100% + 10px); left:0; z-index:9999;
            background:#fff; border-radius:16px; padding:20px;
            box-shadow:0 8px 40px rgba(26,58,92,0.18), 0 2px 8px rgba(0,0,0,0.08);
            border:1px solid #e8eef5; width:290px;
            animation:mdpFadeIn .18s ease;
        }
        @keyframes mdpFadeIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        .mdp-panel.hidden { display:none; }
        .mdp-panel-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
        .mdp-month-label { font-size:14px; font-weight:700; color:#1a3a5c; }
        .mdp-nav {
            width:28px; height:28px; border-radius:8px; border:none;
            background:#f0f4fa; color:#1a3a5c; font-size:18px; cursor:pointer;
            display:flex; align-items:center; justify-content:center; line-height:1;
            transition:background .15s; padding:0;
        }
        .mdp-nav:hover { background:#dde8f5; }
        .mdp-weekdays { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; margin-bottom:6px; }
        .mdp-weekdays span { text-align:center; font-size:11px; font-weight:600; color:#aab8c8; padding:4px 0; }
        .mdp-days { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; }
        .mdp-day {
            aspect-ratio:1; display:flex; align-items:center; justify-content:center;
            border-radius:8px; font-size:13px; cursor:pointer; transition:all .12s;
            color:#1a3a5c; font-weight:500;
        }
        .mdp-day:not(.empty):hover { background:#e8f0fb; }
        .mdp-day.empty { pointer-events:none; }
        .mdp-day.selected { background:#1a3a5c; color:#fff; font-weight:700; }
        .mdp-day.is-from { border-radius:8px 0 0 8px; }
        .mdp-day.is-to { border-radius:0 8px 8px 0; }
        .mdp-day.in-range { background:#dce8f7; border-radius:0; color:#1a3a5c; }
        .mdp-day.is-from.is-to { border-radius:8px; }
        .mdp-actions { display:flex; gap:8px; margin-top:14px; }
        .mdp-apply {
            flex:1; padding:9px; background:#1a3a5c; color:#fff; border:none;
            border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; transition:background .15s;
        }
        .mdp-apply:hover { background:#378ADD; }
        .mdp-cancel {
            flex:1; padding:9px; background:#f0f4fa; color:#1a3a5c; border:none;
            border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; transition:background .15s;
        }
        .mdp-cancel:hover { background:#dde8f5; }

        .user-search-wrap { position:relative; }
        .user-search-input {
            padding:8px 14px; border:1.5px solid #dde3ee; border-radius:10px;
            font-size:13px; color:#1a3a5c; background:#f8fafd; outline:none;
            transition:border-color .18s; width:200px;
        }
        .user-search-input:focus { border-color:#378ADD; background:#fff; }
        .user-search-dropdown {
            position:absolute; top:calc(100%+6px); left:0; z-index:9999;
            background:#fff; border:1.5px solid #dde3ee; border-radius:12px;
            box-shadow:0 8px 30px rgba(26,58,92,0.15); overflow:hidden;
            min-width:240px; max-height:240px; overflow-y:auto;
        }
        .user-search-dropdown.hidden { display:none; }
        .user-dd-item {
            padding:10px 14px; cursor:pointer; display:flex; align-items:center;
            gap:10px; transition:background .12s; border-bottom:1px solid #f0f4fa;
        }
        .user-dd-item:last-child { border-bottom:none; }
        .user-dd-item:hover { background:#f0f6ff; }
        .user-dd-item.no-match { color:#aaa; cursor:default; font-size:13px; }
        .user-dd-name { font-size:13px; font-weight:600; color:#1a3a5c; }
        .user-dd-username { font-size:12px; color:#7a8fa8; }
        .selected-user-chip {
            display:flex; align-items:center; gap:6px;
            padding:6px 12px; background:#1a3a5c; color:#fff;
            border-radius:20px; font-size:13px; font-weight:600;
        }
        .selected-user-chip.hidden { display:none; }
        .chip-clear-btn {
            background:none; border:none; color:#fff; cursor:pointer;
            font-size:18px; line-height:1; padding:0 0 2px; opacity:.8;
            transition:opacity .15s;
        }
        .chip-clear-btn:hover { opacity:1; }
    `;
    document.head.appendChild(s);
}

// ─── REPORT MODULE ────────────────────────────────────────────────────────────
async function loadReportHistory() {
    const listEl = document.getElementById('user-history-list');
    if (!listEl) return;
    listEl.innerHTML = '<li style="color:#aaa;padding:20px;list-style:none;text-align:center;">Loading...</li>';
    try {
        const [searchRes, recRes, savedRes] = await Promise.all([
            fetch('/api/admin/report/search-pins').then(r => r.json()),
            fetch('/api/admin/report/recommendations').then(r => r.json()),
            fetch('/api/admin/report/saved').then(r => r.json())
        ]);
        const searchRows = (searchRes.data || []).map(r => ({ ...r, _type: 'search' }));
        const recRows = (recRes.data || []).map(r => ({ ...r, _type: 'recommendation' }));
        const savedRows = (savedRes.data || []).map(r => ({ ...r, _type: 'saved' }));
        const all = [...searchRows, ...recRows, ...savedRows].sort((a, b) => {
            return new Date(b.created_at || b.saved_at || 0) - new Date(a.created_at || a.saved_at || 0);
        });
        window._allReportRows = all;
        renderReportList(all);
    } catch { listEl.innerHTML = '<li style="color:#e74c3c;padding:20px;list-style:none;">Failed to load report data.</li>'; }
}

function renderReportList(rows) {
    const listEl = document.getElementById('user-history-list');
    if (!listEl) return;

    let filtered = reportTypeFilters.size === 3
        ? rows
        : rows.filter(r => reportTypeFilters.has(r._type));

    if (reportUserFilter !== 'all') filtered = filtered.filter(r => String(r.user_id) === String(reportUserFilter));

    if (reportDateFrom) {
        const from = new Date(reportDateFrom); from.setHours(0,0,0,0);
        filtered = filtered.filter(r => new Date(r.created_at || r.saved_at || 0) >= from);
    }
    if (reportDateTo) {
        const to = new Date(reportDateTo); to.setHours(23,59,59,999);
        filtered = filtered.filter(r => new Date(r.created_at || r.saved_at || 0) <= to);
    }

    const countEl = document.getElementById('report-count');
    if (countEl) countEl.textContent = `${filtered.length} record${filtered.length !== 1 ? 's' : ''}`;

    if (!filtered.length) {
        listEl.innerHTML = '<li style="color:#aaa;padding:24px;list-style:none;text-align:center;font-size:14px;">No records match current filters.</li>';
        return;
    }

    listEl.innerHTML = filtered.map((r, idx) => {
        const user = r.fullname ? `${r.fullname} (@${r.username})` : `User #${r.user_id}`;
        const date = formatDate(r.created_at || r.saved_at);
        let badge = '', detail = '', icon = '';

        if (r._type === 'search') {
            badge = '<span class="report-badge badge-search">Map Search</span>';
            icon = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="ri-icon"><circle cx="9" cy="9" r="5"/><path d="M14 14l3 3"/></svg>`;
            const label = r.query ? `Searched: <strong>${escapeHtml(r.query)}</strong>` : 'Dropped a pin on the map';
            detail = `${label}${r.is_pinned ? ' <span class="detail-tag">pinned</span>' : ''}`;
        } else if (r._type === 'recommendation') {
            badge = '<span class="report-badge badge-rec">Recommendation</span>';
            icon = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="ri-icon"><path d="M10 2l2.4 4.8 5.3.8-3.8 3.7.9 5.2L10 14l-4.8 2.5.9-5.2L2.3 7.6l5.3-.8z"/></svg>`;
            const idea = r.recommended_item_id ? `<strong>${escapeHtml(r.recommended_item_id)}</strong>` : 'an idea';
            const area = r.source ? ` in <strong>${escapeHtml(r.source)}</strong>` : '';
            detail = `Clicked: ${idea}${area}`;
        } else if (r._type === 'saved') {
            const wasRemoved = r.was_removed == 1;
            badge = wasRemoved
                ? '<span class="report-badge badge-unsaved">Unsaved</span>'
                : '<span class="report-badge badge-saved">Saved</span>';
            icon = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="ri-icon"><path d="M5 2h10a1 1 0 011 1v15l-6-3-6 3V3a1 1 0 011-1z"/></svg>`;
            const biz = r.business_type ? `<strong>${escapeHtml(r.business_type)}</strong>` : 'a business';
            const area = r.barangay ? ` in <strong>${escapeHtml(r.barangay)}</strong>` : '';
            detail = `${wasRemoved ? 'Removed' : 'Saved'} ${biz}${area}`;
        }

        return `
            <li class="report-item" style="animation-delay:${idx * 0.025}s">
                <div class="report-item-left">${icon}</div>
                <div class="report-item-body">
                    <div class="report-item-top">
                        ${badge}
                        <span class="report-user">${escapeHtml(user)}</span>
                        <span class="report-date">${date}</span>
                    </div>
                    <div class="report-detail">${detail}</div>
                </div>
            </li>
        `;
    }).join('');
}

// ─── ADVANCED CSV EXPORT ─────────────────────────────────────────────────────
function initExportModal() {
    const exportBtn = document.getElementById('export-csv-btn');
    const closeBtn = document.getElementById('close-export-modal');
    const cancelBtn = document.getElementById('cancel-export');
    const confirmBtn = document.getElementById('confirm-export');
    const exportAll = document.getElementById('export-all');
    const exportSearch = document.getElementById('export-search');
    const exportRecs = document.getElementById('export-recommendations');
    const exportSaved = document.getElementById('export-saved');
    const fromDate = document.getElementById('export-date-from');
    const toDate = document.getElementById('export-date-to');

    if (exportBtn) exportBtn.addEventListener('click', openExportModal);
    if (closeBtn) closeBtn.addEventListener('click', closeExportModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeExportModal);
    if (confirmBtn) confirmBtn.addEventListener('click', exportToCSVAdvanced);

    if (exportAll) exportAll.addEventListener('change', selectAllHistory);
    if (exportSearch) exportSearch.addEventListener('change', updateExportPreview);
    if (exportRecs) exportRecs.addEventListener('change', updateExportPreview);
    if (exportSaved) exportSaved.addEventListener('change', updateExportPreview);
    if (fromDate) fromDate.addEventListener('change', updateExportPreview);
    if (toDate) toDate.addEventListener('change', updateExportPreview);

    const modal = document.getElementById('export-report-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeExportModal();
        });
    }
}

function openExportModal() {
    const modal = document.getElementById('export-report-modal');
    if (!modal) return;

    const selectAllCheckbox = document.getElementById('export-all');
    const searchCheckbox = document.getElementById('export-search');
    const recsCheckbox = document.getElementById('export-recommendations');
    const savedCheckbox = document.getElementById('export-saved');
    const fromInput = document.getElementById('export-date-from');
    const toInput = document.getElementById('export-date-to');

    if (selectAllCheckbox) selectAllCheckbox.checked = true;
    if (searchCheckbox) searchCheckbox.checked = true;
    if (recsCheckbox) recsCheckbox.checked = true;
    if (savedCheckbox) savedCheckbox.checked = true;
    if (fromInput) fromInput.value = '';
    if (toInput) toInput.value = '';

    updateExportPreview();
    modal.classList.add('open');
}

function closeExportModal() {
    const modal = document.getElementById('export-report-modal');
    if (modal) modal.classList.remove('open');
}

function selectAllHistory() {
    const selectAll = document.getElementById('export-all');
    const searchCheckbox = document.getElementById('export-search');
    const recsCheckbox = document.getElementById('export-recommendations');
    const savedCheckbox = document.getElementById('export-saved');

    if (selectAll && selectAll.checked) {
        if (searchCheckbox) searchCheckbox.checked = true;
        if (recsCheckbox) recsCheckbox.checked = true;
        if (savedCheckbox) savedCheckbox.checked = true;
    } else {
        if (searchCheckbox) searchCheckbox.checked = false;
        if (recsCheckbox) recsCheckbox.checked = false;
        if (savedCheckbox) savedCheckbox.checked = false;
    }

    updateExportPreview();
}

function updateExportPreview() {
    const exportSearch = document.getElementById('export-search')?.checked || false;
    const exportRecs = document.getElementById('export-recommendations')?.checked || false;
    const exportSaved = document.getElementById('export-saved')?.checked || false;

    const fromDate = document.getElementById('export-date-from')?.value;
    const toDate = document.getElementById('export-date-to')?.value;

    let from = fromDate ? new Date(fromDate) : null;
    let to = toDate ? new Date(toDate) : null;

    if (from) from.setHours(0, 0, 0, 0);
    if (to) to.setHours(23, 59, 59, 999);

    const allRows = window._allReportRows || [];
    let totalCount = 0;
    let details = [];

    if (exportSearch) {
        const filtered = filterRowsByTypeAndDate(allRows, 'search', from, to);
        totalCount += filtered.length;
        if (filtered.length > 0) details.push(`Search/Pin: ${filtered.length} records`);
    }

    if (exportRecs) {
        const filtered = filterRowsByTypeAndDate(allRows, 'recommendation', from, to);
        totalCount += filtered.length;
        if (filtered.length > 0) details.push(`Recommendations: ${filtered.length} records`);
    }

    if (exportSaved) {
        const filtered = filterRowsByTypeAndDate(allRows, 'saved', from, to);
        totalCount += filtered.length;
        if (filtered.length > 0) details.push(`Saved: ${filtered.length} records`);
    }

    const previewCount = document.getElementById('preview-count');
    const previewDetails = document.getElementById('preview-details');
    const noDataWarning = document.getElementById('no-data-warning');

    if (previewCount) {
        previewCount.textContent = totalCount;
        previewCount.style.color = totalCount === 0 ? '#e74c3c' : '#1a3a5c';
    }

    if (previewDetails) {
        if (details.length > 0) {
            previewDetails.innerHTML = details.join('<br>');
            previewDetails.style.display = 'block';
            previewDetails.style.color = '#4a6a85';
            if (noDataWarning) noDataWarning.style.display = 'none';
        } else {
            previewDetails.innerHTML = 'No records match the selected criteria';
            previewDetails.style.color = '#e74c3c';
            previewDetails.style.display = 'block';
            if (noDataWarning) noDataWarning.style.display = 'block';
        }
    }

    const confirmBtn = document.getElementById('confirm-export');
    if (confirmBtn) {
        if (totalCount === 0 || (!exportSearch && !exportRecs && !exportSaved)) {
            confirmBtn.disabled = true;
        } else {
            confirmBtn.disabled = false;
        }
    }
}

function filterRowsByTypeAndDate(rows, type, fromDate, toDate) {
    return rows.filter(row => {
        if (row._type !== type) return false;
        const rowDate = new Date(row.created_at || row.saved_at || 0);
        if (fromDate && rowDate < fromDate) return false;
        if (toDate && rowDate > toDate) return false;
        return true;
    });
}

function exportToCSVAdvanced() {
    const exportSearch = document.getElementById('export-search')?.checked || false;
    const exportRecs = document.getElementById('export-recommendations')?.checked || false;
    const exportSaved = document.getElementById('export-saved')?.checked || false;

    const fromDate = document.getElementById('export-date-from')?.value;
    const toDate = document.getElementById('export-date-to')?.value;

    let from = fromDate ? new Date(fromDate) : null;
    let to = toDate ? new Date(toDate) : null;

    if (from) from.setHours(0, 0, 0, 0);
    if (to) to.setHours(23, 59, 59, 999);

    if (!exportSearch && !exportRecs && !exportSaved) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'warning',
                title: 'No Selection',
                text: 'Please select at least one history type to export.',
                confirmButtonColor: '#1a3a5c'
            });
        } else {
            alert('Please select at least one history type to export.');
        }
        return;
    }

    const allRows = window._allReportRows || [];
    const csvRows = [];

    // CSV Headers
    csvRows.push(['Type', 'Timestamp', 'User', 'Username', 'User ID', 'Location/Name', 'Details'].join(','));

    let totalExported = 0;

    // Add Search/Pin Records
    if (exportSearch) {
        const filtered = filterRowsByTypeAndDate(allRows, 'search', from, to);
        filtered.forEach(item => {
            csvRows.push([
                'Search/Pin',
                item.created_at || '',
                `"${(item.fullname || '').replace(/"/g, '""')}"`,
                `"${(item.username || '').replace(/"/g, '""')}"`,
                item.user_id || '',
                `"${(item.query || item.locationName || '').replace(/"/g, '""')}"`,
                `"Source: ${item.source || 'map'}${item.is_pinned ? ' | Pinned' : ''}"`
            ].join(','));
            totalExported++;
        });
    }

    // Add Recommendation Records
    if (exportRecs) {
        const filtered = filterRowsByTypeAndDate(allRows, 'recommendation', from, to);
        filtered.forEach(item => {
            csvRows.push([
                'Recommendation',
                item.created_at || '',
                `"${(item.fullname || '').replace(/"/g, '""')}"`,
                `"${(item.username || '').replace(/"/g, '""')}"`,
                item.user_id || '',
                `"${(item.recommended_item_id || '').replace(/"/g, '""')}"`,
                `"Area: ${(item.source || '').replace(/"/g, '""')}"`
            ].join(','));
            totalExported++;
        });
    }

    // Add Saved Records
    if (exportSaved) {
        const filtered = filterRowsByTypeAndDate(allRows, 'saved', from, to);
        filtered.forEach(item => {
            csvRows.push([
                item.was_removed == 1 ? 'Unsaved' : 'Saved',
                item.saved_at || item.created_at || '',
                `"${(item.fullname || '').replace(/"/g, '""')}"`,
                `"${(item.username || '').replace(/"/g, '""')}"`,
                item.user_id || '',
                `"${(item.business_type || '').replace(/"/g, '""')}"`,
                `"Barangay: ${(item.barangay || '').replace(/"/g, '""')}"`
            ].join(','));
            totalExported++;
        });
    }

    if (csvRows.length <= 1) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'warning',
                title: 'No Data',
                text: 'No records match the selected criteria.',
                confirmButtonColor: '#1a3a5c'
            });
        } else {
            alert('No records match the selected criteria.');
        }
        return;
    }

    // Create and download CSV
    const csvContent = csvRows.join('\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    let filename = `spot_admin_report_${timestamp}`;

    const types = [];
    if (exportSearch) types.push('search');
    if (exportRecs) types.push('recommendations');
    if (exportSaved) types.push('saved');

    if (types.length === 3) {
        filename += '_all';
    } else if (types.length === 1) {
        filename += `_${types[0]}`;
    } else {
        filename += `_${types.join('-')}`;
    }

    if (fromDate) filename += `_from-${fromDate}`;
    if (toDate) filename += `_to-${toDate}`;

    filename += '.csv';

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'success',
            title: 'Export Successful!',
            html: `Exported <strong>${totalExported}</strong> records to<br><strong>${filename}</strong>`,
            timer: 2500,
            showConfirmButton: false
        });
    }

    closeExportModal();
}

// ─── LEGACY CSV EXPORT (kept for compatibility) ───────────────────────────────
function exportReportToCSV() {
    openExportModal();
}

function formatDate(raw) {
    if (!raw) return '--';
    const d = new Date(raw);
    if (isNaN(d)) return raw;
    return d.toLocaleString('en-PH', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

// ─── STATS ────────────────────────────────────────────────────────────────────
async function loadDashboardStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const data = await response.json();
        document.getElementById('total-users').textContent = data.totalUsers.toLocaleString();
        updateChart(data.entrepreneurPct, data.aspiringPct, data.entrepreneurCount, data.aspiringCount);
    } catch { document.getElementById('total-users').textContent = '--'; }
}

async function loadBarangayList() {
    try {
        const response = await fetch(`${API_BASE}/barangays`);
        const data = await response.json();
        barangayList = data.barangays || [];
    } catch { barangayList = []; }
}

function updateChart(entrepreneurPct, aspiringPct, entrepreneurCount, aspiringCount) {
    const bars = [
        { barId:'bar-entrepreneur', pctId:'pct-entrepreneur', outId:'outside-entrepreneur', value:entrepreneurPct, count:entrepreneurCount },
        { barId:'bar-aspiring', pctId:'pct-aspiring', outId:'outside-aspiring', value:aspiringPct, count:aspiringCount }
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
                    if (outside) { outside.style.display = 'inline'; outside.textContent = displayText; }
                }
            });
        }, 120);
    });
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────────────────
function initEventListeners() {
    document.getElementById('add-data-btn')?.addEventListener('click', () => openModal('add'));
    document.getElementById('edit-data-btn')?.addEventListener('click', () => openModal('edit'));
    document.getElementById('delete-data-btn')?.addEventListener('click', () => openModal('delete'));

    document.getElementById('logout-nav-btn')?.addEventListener('click', () => {
        document.getElementById('logout-modal').classList.add('open');
    });
    document.getElementById('cancel-logout')?.addEventListener('click', () => {
        document.getElementById('logout-modal').classList.remove('open');
    });
    document.getElementById('confirm-logout')?.addEventListener('click', () => { window.location.href = '/dashboard'; });

    document.getElementById('crud-close')?.addEventListener('click', closeCrudModal);
    document.getElementById('crud-cancel')?.addEventListener('click', closeCrudModal);

    document.querySelectorAll('.modal-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    document.getElementById('crud-search-btn')?.addEventListener('click', performSearch);
    document.getElementById('crud-search-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') performSearch(); });
    document.getElementById('crud-form')?.addEventListener('submit', handleFormSubmit);

    document.getElementById('delete-cancel')?.addEventListener('click', () => {
        document.getElementById('delete-confirm-modal').classList.remove('open');
        pendingDelete = null;
    });
    document.getElementById('delete-confirm')?.addEventListener('click', confirmDelete);

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });
    });

    document.querySelectorAll('.report-type-btn').forEach(btn => {
        btn.addEventListener('click', () => toggleTypeFilter(btn.dataset.type));
    });

    document.getElementById('report-refresh')?.addEventListener('click', loadReportHistory);
}

function toggleTypeFilter(type) {
    if (type === 'all') {
        if (reportTypeFilters.size === 3) {
            reportTypeFilters.clear();
        } else {
            reportTypeFilters = new Set(['search', 'recommendation', 'saved']);
        }
    } else {
        if (reportTypeFilters.has(type)) {
            reportTypeFilters.delete(type);
        } else {
            reportTypeFilters.add(type);
        }
    }
    updateTypeFilterUI();
    if (window._allReportRows) renderReportList(window._allReportRows);
}

function updateTypeFilterUI() {
    document.querySelectorAll('.report-type-btn').forEach(btn => {
        const t = btn.dataset.type;
        if (t === 'all') {
            btn.classList.toggle('active', reportTypeFilters.size === 3);
        } else {
            btn.classList.toggle('active', reportTypeFilters.has(t));
        }
    });
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────
function openModal(mode) {
    currentMode = mode;
    const modal = document.getElementById('crud-modal');
    const title = document.getElementById('crud-modal-title');
    const searchSection = document.getElementById('crud-search-section');
    const resultsSection = document.getElementById('crud-results');
    const form = document.getElementById('crud-form');
    const initialActions = document.getElementById('crud-initial-actions');

    const titles = { 'add':'Add New Data', 'edit':'Edit Existing Data', 'delete':'Delete Data' };
    title.textContent = titles[mode];

    currentTable = 'businesses'; selectedRecord = null;
    document.querySelectorAll('.modal-tab').forEach(t => { t.classList.toggle('active', t.dataset.tab === 'businesses'); });

    if (mode === 'add') {
        searchSection.style.display = 'none'; resultsSection.style.display = 'none';
        form.style.display = 'block'; initialActions.style.display = 'none';
        renderForm();
    } else {
        searchSection.style.display = 'flex'; resultsSection.style.display = 'block';
        form.style.display = 'none'; initialActions.style.display = 'flex';
        document.getElementById('crud-search-input').value = '';
        document.getElementById('crud-results').style.display = 'none';
        const filterSelect = document.getElementById('crud-filter-barangay');
        if (mode === 'edit') { filterSelect.style.display = 'inline-block'; populateBarangayFilter(); }
        else { filterSelect.style.display = 'none'; }
    }
    modal.classList.add('open');
}

function closeCrudModal() {
    document.getElementById('crud-modal').classList.remove('open');
    currentMode = null; selectedRecord = null; pendingDelete = null;
}

function switchTab(table) {
    currentTable = table;
    document.querySelectorAll('.modal-tab').forEach(t => { t.classList.toggle('active', t.dataset.tab === table); });
    if (currentMode !== 'add') {
        document.getElementById('crud-search-input').value = '';
        document.getElementById('crud-results').style.display = 'none';
        const filterSelect = document.getElementById('crud-filter-barangay');
        if (currentMode === 'edit') { filterSelect.style.display = 'inline-block'; populateBarangayFilter(); }
    } else { renderForm(); }
}

function populateBarangayFilter() {
    const select = document.getElementById('crud-filter-barangay');
    select.innerHTML = '<option value="">All Barangays</option>';
    barangayList.forEach(b => { const o = document.createElement('option'); o.value = b; o.textContent = b; select.appendChild(o); });
}

async function performSearch() {
    const searchTerm = document.getElementById('crud-search-input').value.trim();
    const barangayFilter = document.getElementById('crud-filter-barangay')?.value || '';
    if (currentTable === 'businesses') {
        const params = new URLSearchParams({ limit:'50' });
        if (searchTerm) params.append('search', searchTerm);
        if (barangayFilter) params.append('barangay', barangayFilter);
        try {
            const response = await fetch(`${API_BASE}/businesses?${params.toString()}`);
            const data = await response.json();
            displaySearchResults(data.data || []);
        } catch { alert('Error searching businesses.'); }
    } else {
        try {
            const response = await fetch(`${API_BASE}/demographics`);
            const data = await response.json();
            let results = data.data || [];
            if (searchTerm) results = results.filter(d => d.barangay_name?.toLowerCase().includes(searchTerm.toLowerCase()));
            if (barangayFilter) results = results.filter(d => d.barangay_name?.toLowerCase() === barangayFilter.toLowerCase());
            displaySearchResults(results);
        } catch { alert('Error searching demographics.'); }
    }
}

function displaySearchResults(results) {
    const resultsSection = document.getElementById('crud-results');
    const thead = document.getElementById('crud-table-header');
    const tbody = document.getElementById('crud-table-body');
    if (!results?.length) {
        tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;padding:20px;">No results found</td></tr>';
        resultsSection.style.display = 'block'; return;
    }
    if (currentTable === 'businesses') {
        thead.innerHTML = `<th>ID</th><th>Business Name</th><th>Line of Business</th><th>Category</th><th>Barangay</th><th>Street</th><th>Address</th><th>Latitude</th><th>Longitude</th><th>Population</th><th>Density</th><th>Income Min</th><th>Income Max</th><th>Actions</th>`;
        tbody.innerHTML = results.map(b => `
            <tr>
                <td>${b.id}</td><td>${escapeHtml(b.business_trade_name||'--')}</td><td>${escapeHtml(b.line_of_business||'--')}</td>
                <td>${escapeHtml(b.category||'--')}</td><td>${escapeHtml(b.barangay||'--')}</td><td>${escapeHtml(b.street||'--')}</td>
                <td>${escapeHtml((b.business_address||'').substring(0,30))}${b.business_address?.length>30?'...':''}</td>
                <td>${b.lat||'--'}</td><td>${b.lon||'--'}</td>
                <td>${b.population?b.population.toLocaleString():'--'}</td><td>${b.population_density||'--'}</td>
                <td>${b.avg_income_min?'₱'+b.avg_income_min.toLocaleString():'--'}</td>
                <td>${b.avg_income_max?'₱'+b.avg_income_max.toLocaleString():'--'}</td>
                <td class="action-cell">
                    ${currentMode==='edit'?`<button class="edit-btn" onclick="editRecord(${b.id})">Edit</button>`:''}
                    ${currentMode==='delete'?`<button class="delete-btn" onclick="deleteRecord(${b.id},'${escapeHtml(b.business_trade_name||'this business')}')">Delete</button>`:''}
                </td>
            </tr>`).join('');
    } else {
        thead.innerHTML = `<th>ID</th><th>Barangay</th><th>Population</th><th>Density</th><th>Age Group</th><th>Income Min</th><th>Income Max</th><th>Gender</th><th>Actions</th>`;
        tbody.innerHTML = results.map(d => `
            <tr>
                <td>${d.id}</td><td>${escapeHtml(d.barangay_name||'--')}</td>
                <td>${d.population?d.population.toLocaleString():'--'}</td><td>${d.population_density||'--'}</td>
                <td>${escapeHtml(d.highest_age_group||'--')}</td>
                <td>${d.avg_income_min?'₱'+d.avg_income_min.toLocaleString():'--'}</td>
                <td>${d.avg_income_max?'₱'+d.avg_income_max.toLocaleString():'--'}</td>
                <td>${escapeHtml(d.gender_distribution||'--')}</td>
                <td class="action-cell">
                    ${currentMode==='edit'?`<button class="edit-btn" onclick="editRecord(${d.id})">Edit</button>`:''}
                    ${currentMode==='delete'?`<button class="delete-btn" onclick="deleteRecord(${d.id},'${escapeHtml(d.barangay_name||'this barangay')}')">Delete</button>`:''}
                </td>
            </tr>`).join('');
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
    } catch { alert('Error loading record.'); }
}

function deleteRecord(id, name) {
    pendingDelete = { id, table: currentTable, name };
    document.getElementById('delete-confirm-message').textContent = `Are you sure you want to delete "${name}"? This action cannot be undone.`;
    document.getElementById('delete-confirm-modal').classList.add('open');
}

async function confirmDelete() {
    if (!pendingDelete) return;
    const { id, table } = pendingDelete;
    try {
        const response = await fetch(`${API_BASE}/${table}/${id}`, { method:'DELETE' });
        const data = await response.json();
        if (data.success) {
            alert('Record deleted successfully!');
            document.getElementById('delete-confirm-modal').classList.remove('open');
            closeCrudModal();
        } else { alert('Error: ' + (data.message || 'Unable to delete')); }
    } catch { alert('Error deleting record.'); }
    pendingDelete = null;
}

function renderForm(data = null) {
    const fieldsContainer = document.getElementById('crud-form-fields');
    let html = '';
    if (currentTable === 'businesses') {
        html = `
            <div class="form-field full-width"><label>Business Trade Name *</label><input type="text" name="business_trade_name" value="${escapeHtml(data?.business_trade_name||'')}" required></div>
            <div class="form-field"><label>Category</label>
                <select name="category">
                    <option value="">-- Select --</option>
                    ${['Food & Beverage','Retail & Trading','Wholesale & Import','Manufacturing','IT & Software','BPO & Call Center','Construction','Finance & Banking','Real Estate','Education','Healthcare','Logistics & Transport','Hospitality','Beauty & Wellness','Entertainment & Leisure','Other'].map(c=>`<option value="${c}" ${data?.category===c?'selected':''}>${c}</option>`).join('')}
                </select>
            </div>
            <div class="form-field"><label>Line of Business</label><input type="text" name="line_of_business" value="${escapeHtml(data?.line_of_business||'')}"></div>
            <div class="form-field"><label>Barangay *</label>
                <select name="barangay" required>
                    <option value="">-- Select --</option>
                    ${barangayList.map(b=>`<option value="${b}" ${data?.barangay===b?'selected':''}>${b}</option>`).join('')}
                </select>
            </div>
            <div class="form-field"><label>Street</label><input type="text" name="street" value="${escapeHtml(data?.street||'')}"></div>
            <div class="form-field full-width"><label>Business Address</label><textarea name="business_address">${escapeHtml(data?.business_address||'')}</textarea></div>
            <div class="form-field"><label>Latitude</label><input type="number" step="0.00000001" name="lat" value="${data?.lat||''}" placeholder="e.g., 14.579400"></div>
            <div class="form-field"><label>Longitude</label><input type="number" step="0.00000001" name="lon" value="${data?.lon||''}" placeholder="e.g., 121.062000"></div>
        `;
    } else {
        html = `
            <div class="form-field full-width"><label>Barangay Name *</label><input type="text" name="barangay_name" value="${escapeHtml(data?.barangay_name||'')}" required></div>
            <div class="form-field"><label>Population</label><input type="number" name="population" value="${data?.population||''}"></div>
            <div class="form-field"><label>Population Density</label><input type="number" step="0.01" name="population_density" value="${data?.population_density||''}"></div>
            <div class="form-field"><label>Highest Age Group</label><input type="text" name="highest_age_group" placeholder="e.g., 15-24, 25-54" value="${escapeHtml(data?.highest_age_group||'')}"></div>
            <div class="form-field"><label>Avg Income Min (₱)</label><input type="number" name="avg_income_min" value="${data?.avg_income_min||''}"></div>
            <div class="form-field"><label>Avg Income Max (₱)</label><input type="number" name="avg_income_max" value="${data?.avg_income_max||''}"></div>
            <div class="form-field"><label>Gender Distribution</label>
                <select name="gender_distribution">
                    <option value="">-- Select --</option>
                    <option value="Female" ${data?.gender_distribution==='Female'?'selected':''}>Female</option>
                    <option value="Male" ${data?.gender_distribution==='Male'?'selected':''}>Male</option>
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
    Object.keys(data).forEach(key => { if (data[key] === '') delete data[key]; });
    let url = `${API_BASE}/${currentTable}`;
    let method = 'POST';
    if (selectedRecord) { url += `/${selectedRecord.id}`; method = 'PUT'; }
    try {
        const response = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
        const result = await response.json();
        if (result.success) {
            alert(selectedRecord ? 'Record updated successfully!' : 'Record added successfully!');
            closeCrudModal();
            if (currentTable === 'businesses') loadDashboardStats();
        } else { alert('Error: ' + (result.message || 'Operation failed')); }
    } catch { alert('Error saving data.'); }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make functions available globally
window.editRecord = editRecord;
window.deleteRecord = deleteRecord;
window.toggleDatePanel = toggleDatePanel;
window.changeMonth = changeMonth;
window.selectDay = selectDay;
window.applyDateRange = applyDateRange;
window.closeDatePanel = closeDatePanel;
window.clearModernDates = clearModernDates;
window.clearUserFilter = clearUserFilter;
window.selectUser = selectUser;