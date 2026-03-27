document.addEventListener('DOMContentLoaded', () => {
    // 1. Elements
    const navDashboard = document.getElementById('nav-dashboard');
    const navMonitoring = document.getElementById('nav-monitoring');
    const navSettings = document.getElementById('nav-settings');
    const viewDashboard = document.getElementById('view-dashboard');
    const viewMonitoring = document.getElementById('view-monitoring');
    const viewSettings = document.getElementById('view-settings');

    const specForm = document.getElementById('spec-form');
    const tempMinInput = document.getElementById('temp-min');
    const tempMaxInput = document.getElementById('temp-max');
    const humMinInput = document.getElementById('hum-min');
    const humMaxInput = document.getElementById('hum-max');

    const dataForm = document.getElementById('data-form');
    const authorNameSelect = document.getElementById('author-name');
    const processNameSelect = document.getElementById('process-name'); // Now a select
    const measureTimeInput = document.getElementById('measure-time');
    const measureTempInput = document.getElementById('measure-temp');
    const measureHumInput = document.getElementById('measure-hum');
    const btnCamera = document.getElementById('btn-camera');
    const cameraInput = document.getElementById('camera-input');
    const cameraBtnContainer = document.getElementById('camera-btn-container');
    const radioModeManual = document.getElementById('mode-manual');
    const radioModeCamera = document.getElementById('mode-camera');

    // Process management elements
    const processForm = document.getElementById('process-form');
    const newProcessNameInput = document.getElementById('new-process-name');
    const processListBody = document.getElementById('process-list-body');

    const authorForm = document.getElementById('author-form');
    const newAuthorNameInput = document.getElementById('new-author-name');
    const authorListBody = document.getElementById('author-list-body');

    const factoryForm = document.getElementById('factory-form');
    const newFactoryNameInput = document.getElementById('new-factory-name');
    const factoryListBody = document.getElementById('factory-list-body');
    const factoryNameSelect = document.getElementById('factory-name');

    const subsidiaryForm = document.getElementById('subsidiary-form');
    const newSubsidiaryNameInput = document.getElementById('new-subsidiary-name');
    const subsidiaryListBody = document.getElementById('subsidiary-list-body');
    const subsidiaryNameSelect = document.getElementById('subsidiary-name');
    const monitoringSubsidiarySelector = document.getElementById('monitoring-subsidiary-selector');
    const monitoringFactorySelector = document.getElementById('monitoring-factory-selector');

    const tableBodyDashboard = document.getElementById('table-body-dashboard');
    const tableBodyMonitoring = document.getElementById('table-body-monitoring');
    const monthSelector = document.getElementById('month-selector');
    const monitoringProcessSelector = document.getElementById('monitoring-process-selector');
    const refreshDataBtn = document.getElementById('refresh-data');
    const clearDataBtn = document.getElementById('clear-data');
    const exportCsvBtn = document.getElementById('export-csv');
    const toast = document.getElementById('toast');
    const btnInstall = document.getElementById('btn-install');
    let deferredPrompt;

    // 2. State Variables
    // -------------------------------------------------------------
    // -------------------------------------------------------------
    // [구글 시트 연동]
    // 발급받은 '웹 앱 URL'을 아래 따옴표 안에 넣어주세요.
    const GOOGLE_SHEETS_URL = "https://script.google.com/macros/s/AKfycbxYeXYtsGXZb4kbiLiSQPRAeAgy-uUYGpLt5FHimYCQvZqdgrcqkXIKl0U8JluHOghSLw/exec";
    // -------------------------------------------------------------
    // -------------------------------------------------------------
    // -------------------------------------------------------------

    const DEFAULT_SPECS = {
        temp: { min: 18, max: 23 },
        hum: { min: 40, max: 60 }
    };
    const SYNC_QUEUE_KEY = 'specMon_syncQueue';
    const SYNC_INTERVAL_MS = 20000;

    function normalizeSpecs(rawSpecs) {
        const tempMin = Number(rawSpecs?.temp?.min);
        const tempMax = Number(rawSpecs?.temp?.max);
        const humMin = Number(rawSpecs?.hum?.min);
        const humMax = Number(rawSpecs?.hum?.max);

        return {
            temp: {
                min: Number.isFinite(tempMin) ? tempMin : DEFAULT_SPECS.temp.min,
                max: Number.isFinite(tempMax) ? tempMax : DEFAULT_SPECS.temp.max
            },
            hum: {
                min: Number.isFinite(humMin) ? humMin : DEFAULT_SPECS.hum.min,
                max: Number.isFinite(humMax) ? humMax : DEFAULT_SPECS.hum.max
            }
        };
    }

    function formatSpecRange(min, max) {
        if (!Number.isFinite(min) || !Number.isFinite(max)) return '-';
        return `${min}~${max}`;
    }

    function sanitizeText(value, fallback = '-') {
        if (value === null || value === undefined) return fallback;
        const text = String(value).trim();
        return text ? text : fallback;
    }

    function sanitizeNumber(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function ensureSpecText(min, max, defaultMin, defaultMax) {
        const text = formatSpecRange(min, max);
        if (text === '-') return `${defaultMin}~${defaultMax}`;
        return text;
    }

    function toCsvCell(value) {
        const text = value === null || value === undefined ? '' : String(value);
        return `"${text.replace(/"/g, '""')}"`;
    }

    function getFirstValue(obj, keys, fallback = '') {
        for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const value = obj[key];
                if (value !== undefined && value !== null && String(value).trim() !== '') {
                    return value;
                }
            }
        }
        return fallback;
    }

    function parseSpecTextToRange(specText, defaultMin, defaultMax) {
        const text = sanitizeText(specText, '');
        const match = text.match(/(-?\d+(?:\.\d+)?)\s*[~\-]\s*(-?\d+(?:\.\d+)?)/);
        if (!match) {
            return { min: defaultMin, max: defaultMax };
        }
        return {
            min: sanitizeNumber(match[1], defaultMin),
            max: sanitizeNumber(match[2], defaultMax)
        };
    }

    function createStableRowId(parts, fallbackPrefix = 'row') {
        const raw = parts.join('|');
        let hash = 0;
        for (let i = 0; i < raw.length; i++) {
            hash = ((hash << 5) - hash) + raw.charCodeAt(i);
            hash |= 0;
        }
        return `${fallbackPrefix}_${Math.abs(hash)}`;
    }

    /*
    function normalizeFetchedRow(row, index) {
        const raw = row && typeof row === 'object' ? row : {};

        const datetime = sanitizeText(
            getFirstValue(raw, ['datetime', 'date', 'Date', '측정일시', 'timestamp'], new Date().toISOString().slice(0, 16)),
            new Date().toISOString().slice(0, 16)
        );
        const subsidiaryName = sanitizeText(
            getFirstValue(raw, ['subsidiaryName', 'Subsidiary Name', 'Company', 'company', '법인명', 'subsidiary']),
            '-'
        );
        const factoryName = sanitizeText(
            getFirstValue(raw, ['factoryName', 'Factory Name', 'Factory', 'factory', '공장명', 'plantName']),
            '-'
        );
        const author = sanitizeText(
            getFirstValue(raw, ['author', 'authorName', 'authorRaw', 'managerName', 'writer']),
            '-'
        );
        const processName = sanitizeText(
            getFirstValue(raw, ['processName', 'Process Name', '공정명']),
            '-'
        );
        const temp = sanitizeNumber(
            getFirstValue(raw, ['temp', 'Temp', '온도']),
            0
        );
        const hum = sanitizeNumber(
            getFirstValue(raw, ['hum', 'Hum', 'humidity', '습도']),
            0
        );

        const tempSpecMinCandidate = sanitizeNumber(getFirstValue(raw, ['specTempMin', 'tempSpecMin', 'temp_spec_min', 'Temp_spec_min']), NaN);
        const tempSpecMaxCandidate = sanitizeNumber(getFirstValue(raw, ['specTempMax', 'tempSpecMax', 'temp_spec_max', 'Temp_spec_max']), NaN);
        const humSpecMinCandidate = sanitizeNumber(getFirstValue(raw, ['specHumMin', 'humidSpecMin', 'hum_spec_min', 'Humid_spec_min']), NaN);
        const humSpecMaxCandidate = sanitizeNumber(getFirstValue(raw, ['specHumMax', 'humidSpecMax', 'hum_spec_max', 'Humid_spec_max']), NaN);

        const tempSpecText = sanitizeText(getFirstValue(raw, ['Temp_spec', 'temp_spec', 'TempSpec', 'specTemp']), '');
        const humSpecText = sanitizeText(getFirstValue(raw, ['Humid_spec', 'humid_spec', 'HumidSpec', 'specHum']), '');

        const tempRangeFromText = parseSpecTextToRange(tempSpecText, DEFAULT_SPECS.temp.min, DEFAULT_SPECS.temp.max);
        const humRangeFromText = parseSpecTextToRange(humSpecText, DEFAULT_SPECS.hum.min, DEFAULT_SPECS.hum.max);

        const specTempMin = Number.isFinite(tempSpecMinCandidate) ? tempSpecMinCandidate : tempRangeFromText.min;
        const specTempMax = Number.isFinite(tempSpecMaxCandidate) ? tempSpecMaxCandidate : tempRangeFromText.max;
        const specHumMin = Number.isFinite(humSpecMinCandidate) ? humSpecMinCandidate : humRangeFromText.min;
        const specHumMax = Number.isFinite(humSpecMaxCandidate) ? humSpecMaxCandidate : humRangeFromText.max;

        const rawId = sanitizeText(getFirstValue(raw, ['id']), '');
        const stableId = rawId !== ''
            ? rawId
            : createStableRowId(
                [datetime, subsidiaryName, factoryName, processName, author, String(temp), String(hum)],
                'sheet'
            );

        return {
            id: stableId,
            datetime,
            subsidiaryName,
            factoryName,
            author,
            processName,
            temp,
            hum,
            status: sanitizeText(getFirstValue(raw, ['status', 'Status']), 'OUT'),
            specTempMin,
            specTempMax,
            specHumMin,
            specHumMax,
            _syncState: sanitizeText(getFirstValue(raw, ['_syncState', 'syncState']), 'synced')
        };
    }

    */
    function normalizeFetchedRow(row, index) {
        const raw = row && typeof row === 'object' ? row : {};

        const datetime = sanitizeText(
            getFirstValue(raw, ['datetime', 'date', 'Date', 'timestamp'], new Date().toISOString().slice(0, 16)),
            new Date().toISOString().slice(0, 16)
        );
        const subsidiaryName = sanitizeText(
            getFirstValue(raw, ['subsidiaryName', 'Subsidiary Name', 'Company', 'company', 'subsidiary']),
            '-'
        );
        const factoryName = sanitizeText(
            getFirstValue(raw, ['factoryName', 'Factory Name', 'Factory', 'factory', 'plantName']),
            '-'
        );
        const author = sanitizeText(
            getFirstValue(raw, ['author', 'authorName', 'authorRaw', 'managerName', 'writer']),
            '-'
        );
        const processName = sanitizeText(
            getFirstValue(raw, ['processName', 'Process Name']),
            '-'
        );
        const temp = sanitizeNumber(getFirstValue(raw, ['temp', 'Temp']), 0);
        const hum = sanitizeNumber(getFirstValue(raw, ['hum', 'Hum', 'humidity']), 0);

        const tempSpecMinCandidate = sanitizeNumber(getFirstValue(raw, ['specTempMin', 'tempSpecMin', 'temp_spec_min', 'Temp_spec_min']), NaN);
        const tempSpecMaxCandidate = sanitizeNumber(getFirstValue(raw, ['specTempMax', 'tempSpecMax', 'temp_spec_max', 'Temp_spec_max']), NaN);
        const humSpecMinCandidate = sanitizeNumber(getFirstValue(raw, ['specHumMin', 'humidSpecMin', 'hum_spec_min', 'Humid_spec_min']), NaN);
        const humSpecMaxCandidate = sanitizeNumber(getFirstValue(raw, ['specHumMax', 'humidSpecMax', 'hum_spec_max', 'Humid_spec_max']), NaN);

        const tempSpecText = sanitizeText(getFirstValue(raw, ['Temp_spec', 'temp_spec', 'TempSpec', 'specTemp']), '');
        const humSpecText = sanitizeText(getFirstValue(raw, ['Humid_spec', 'humid_spec', 'HumidSpec', 'specHum']), '');

        const tempRangeFromText = parseSpecTextToRange(tempSpecText, DEFAULT_SPECS.temp.min, DEFAULT_SPECS.temp.max);
        const humRangeFromText = parseSpecTextToRange(humSpecText, DEFAULT_SPECS.hum.min, DEFAULT_SPECS.hum.max);

        const specTempMin = Number.isFinite(tempSpecMinCandidate) ? tempSpecMinCandidate : tempRangeFromText.min;
        const specTempMax = Number.isFinite(tempSpecMaxCandidate) ? tempSpecMaxCandidate : tempRangeFromText.max;
        const specHumMin = Number.isFinite(humSpecMinCandidate) ? humSpecMinCandidate : humRangeFromText.min;
        const specHumMax = Number.isFinite(humSpecMaxCandidate) ? humSpecMaxCandidate : humRangeFromText.max;

        return {
            id: sanitizeText(getFirstValue(raw, ['id']), `sheet_${index}_${Date.now()}`),
            datetime,
            subsidiaryName,
            factoryName,
            author,
            processName,
            temp,
            hum,
            status: sanitizeText(getFirstValue(raw, ['status', 'Status']), 'OUT'),
            specTempMin,
            specTempMax,
            specHumMin,
            specHumMax
        };
    }

    function normalizeFetchedData(result) {
        if (!Array.isArray(result)) return [];
        if (result.length === 0) return [];

        // Case 1: array of objects
        if (result[0] && typeof result[0] === 'object' && !Array.isArray(result[0])) {
            return result.map((row, index) => normalizeFetchedRow(row, index));
        }

        // Case 2: array of arrays (first row is header)
        if (Array.isArray(result[0])) {
            const headers = result[0].map(h => sanitizeText(h, ''));
            const rows = result.slice(1).map((rowArr) => {
                const obj = {};
                headers.forEach((header, idx) => {
                    if (header) obj[header] = rowArr[idx];
                });
                return obj;
            });
            return rows.map((row, index) => normalizeFetchedRow(row, index));
        }

        return [];
    }

    let savedSpecs = null;
    try {
        savedSpecs = JSON.parse(localStorage.getItem('specMon_specs'));
    } catch (e) {
        savedSpecs = null;
    }
    let specs = normalizeSpecs(savedSpecs);
    let savedProcessData = [];
    try {
        savedProcessData = JSON.parse(localStorage.getItem('specMon_data')) || [];
    } catch (e) {
        savedProcessData = [];
    }
    let processData = normalizeFetchedData(savedProcessData);
    let savedSyncQueue = [];
    try {
        savedSyncQueue = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY)) || [];
    } catch (e) {
        savedSyncQueue = [];
    }
    let syncQueue = Array.isArray(savedSyncQueue) ? savedSyncQueue : [];
    let syncInProgress = false;
    let syncIntervalId = null;
    let processList = JSON.parse(localStorage.getItem('specMon_processes')) || ['SMT-Line-1', 'SMT-Line-2', 'Assembly-A'];
    let authorList = JSON.parse(localStorage.getItem('specMon_authors')) || ['관리자', '홍길동'];
    let subsidiaryList = JSON.parse(localStorage.getItem('specMon_subsidiaries')) || ['법인-A', '법인-B'];
    let factoryList = JSON.parse(localStorage.getItem('specMon_factories')) || ['공장-A', '공장-B'];
    let inputMode = localStorage.getItem('specMon_inputMode') || 'manual';

    // 3. Helper Functions
    function applyInputMode() {
        if (inputMode === 'camera') {
            if (cameraBtnContainer) cameraBtnContainer.style.display = 'block';
        } else {
            if (cameraBtnContainer) cameraBtnContainer.style.display = 'none';
        }
    }

    function generateId() {
        return `r_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    // 햅틱 진동 피드백 (Smartphone Haptic)
    function vibrate(ms = 15) {
        if ("vibrate" in navigator) {
            navigator.vibrate(ms);
        }
    }

    async function fetchServerDataBootstrapLegacy() {
        if (!GOOGLE_SHEETS_URL) return;
        try {
            showToast('서버(구글시트) 연동 중... (Syncing...)');
            const response = await fetch(GOOGLE_SHEETS_URL);
            const textResponse = await response.text();

            try {
                const parsed = JSON.parse(textResponse);
                const rows = Array.isArray(parsed)
                    ? parsed
                    : (Array.isArray(parsed?.data) ? parsed.data : (Array.isArray(parsed?.rows) ? parsed.rows : []));

                const result = normalizeFetchedData(rows);
                if (Array.isArray(result) && result.length > 0) {
                    processData = result;
                    syncQueue = [];
                    persistProcessData();
                    persistSyncQueue();
                    updateUI();
                    showToast('서버 데이터 동기화 완료! (Data Sync Complete)');
                }
            } catch (e) {
                console.log("구글 시트 연동 성공, 하지만 불러올 데이터가 아직 없습니다.");
            }
        } catch (e) {
            console.error('Fetch error:', e);
        }
    }

    function persistProcessData() {
        localStorage.setItem('specMon_data', JSON.stringify(processData));
    }

    function persistSyncQueue() {
        localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(syncQueue));
    }

    function buildSheetPayload(action, record) {
        const authorName = record.authorRaw || record.author || '-';
        return {
            action,
            id: record.id,
            date: record.datetime,
            datetime: record.datetime,
            timestamp: record.datetime,
            subsidiaryName: record.subsidiaryName,
            subsidiary: record.subsidiaryName,
            company: record.subsidiaryName,
            companyName: record.subsidiaryName,
            factoryName: record.factoryName,
            factory: record.factoryName,
            plantName: record.factoryName,
            processName: record.processName,
            process: record.processName,
            author: authorName,
            authorName,
            writer: authorName,
            temp: record.temp,
            temperature: record.temp,
            hum: record.hum,
            humidity: record.hum,
            status: record.status,
            tempSpec: `${record.specTempMin}~${record.specTempMax}`,
            humSpec: `${record.specHumMin}~${record.specHumMax}`,
            specTempMin: record.specTempMin,
            specTempMax: record.specTempMax,
            specHumMin: record.specHumMin,
            specHumMax: record.specHumMax
        };
    }

    function enqueueSync(action, record) {
        const exists = syncQueue.some(op => op.action === action && op.id === record.id);
        if (exists) return;
        syncQueue.push({
            action,
            id: record.id,
            payload: buildSheetPayload(action, record),
            retries: 0,
            createdAt: Date.now(),
            lastError: ''
        });
        persistSyncQueue();
    }

    async function postToGoogleSheets(payload) {
        try {
            const response = await fetch(GOOGLE_SHEETS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const rawText = await response.text();
            if (!rawText) return true;

            let parsed = null;
            try {
                parsed = JSON.parse(rawText);
            } catch (e) {
                return true;
            }

            if (parsed && parsed.success === false) {
                throw new Error(parsed.message || 'Server rejected request');
            }

            return true;
        } catch (corsOrNetworkError) {
            // Fallback for environments where Apps Script CORS blocks readable responses.
            try {
                const formBody = new URLSearchParams();
                Object.entries(payload).forEach(([key, value]) => {
                    formBody.append(key, value === undefined || value === null ? '' : String(value));
                });
                await fetch(GOOGLE_SHEETS_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
                    body: formBody.toString()
                });
            } catch (fallbackError) {
                await fetch(GOOGLE_SHEETS_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(payload)
                });
            }
            return true;
        }
    }

    async function flushSyncQueueLegacy({ silent = true } = {}) {
        if (!GOOGLE_SHEETS_URL || syncInProgress || syncQueue.length === 0) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

        syncInProgress = true;
        let syncedCount = 0;

        try {
            while (syncQueue.length > 0) {
                const op = syncQueue[0];
                try {
                    await postToGoogleSheets(op.payload);
                    syncQueue.shift();
                    syncedCount += 1;

                    if (op.action === 'insert') {
                        const idx = processData.findIndex(item => item.id === op.id);
                        if (idx >= 0) processData[idx]._syncState = 'synced';
                    }
                    persistSyncQueue();
                    persistProcessData();
                } catch (error) {
                    op.retries = (op.retries || 0) + 1;
                    op.lastError = error && error.message ? error.message : 'unknown';
                    persistSyncQueue();

                    const idx = processData.findIndex(item => item.id === op.id);
                    if (idx >= 0 && op.action === 'insert') {
                        processData[idx]._syncState = 'failed';
                        persistProcessData();
                    }
                    if (!silent) showToast(`동기화 대기 중 (${syncQueue.length}건)`);
                    break;
                }
            }
            if (syncedCount > 0 && !silent) showToast(`동기화 완료 (${syncedCount}건)`);
        } finally {
            syncInProgress = false;
        }
    }

    function mergeServerData(serverRows) {
        const pendingDeleteIds = new Set(
            syncQueue.filter(op => op.action === 'delete').map(op => op.id)
        );
        const localById = new Map(processData.map(item => [item.id, item]));
        const seen = new Set();
        const merged = [];

        serverRows.forEach(row => {
            if (!row.id || pendingDeleteIds.has(row.id)) return;
            seen.add(row.id);
            const local = localById.get(row.id);
            merged.push({
                ...(local || {}),
                ...row,
                _syncState: 'synced'
            });
        });

        processData.forEach(local => {
            if (!local.id || seen.has(local.id)) return;
            if (local._syncState === 'pending' || local._syncState === 'failed') merged.push(local);
        });

        processData = merged;
        persistProcessData();
    }

    async function fetchServerDataLegacy({ silent = false } = {}) {
        if (!GOOGLE_SHEETS_URL) return;
        if (!silent) showToast('서버 데이터 동기화 중... (Syncing...)');

        try {
            const response = await fetch(GOOGLE_SHEETS_URL, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const textResponse = await response.text();
            let parsed = [];
            try {
                parsed = JSON.parse(textResponse);
            } catch (e) {
                parsed = [];
            }

            const rows = Array.isArray(parsed)
                ? parsed
                : (Array.isArray(parsed?.data) ? parsed.data : (Array.isArray(parsed?.rows) ? parsed.rows : []));
            const normalized = normalizeFetchedData(rows);
            if (!Array.isArray(normalized) || normalized.length === 0) {
                if (!silent) showToast('서버 응답 데이터가 없습니다.');
                return;
            }
            mergeServerData(normalized);
            updateUI();
            if (!silent) showToast('서버 데이터 동기화 완료!');
        } catch (e) {
            console.error('Fetch error:', e);
            if (!silent) showToast('서버 데이터 조회 실패');
        }
    }

    async function runSyncLegacy({ silent = true } = {}) {
        await flushSyncQueue({ silent: true });
        await fetchServerData({ silent });
        await flushSyncQueue({ silent: true });
        if (!silent) updateUI();
    }

    function startAutoSync() {
        if (syncIntervalId) clearInterval(syncIntervalId);
        syncIntervalId = setInterval(() => {
            runSync({ silent: true });
        }, SYNC_INTERVAL_MS);

        window.addEventListener('online', () => {
            runSync({ silent: true });
        });
    }

    function stopAutoSync() {
        if (syncIntervalId) {
            clearInterval(syncIntervalId);
            syncIntervalId = null;
        }
    }

    // 4. Init Function
    function init() {
        // Keep specs persisted in normalized shape so defaults are always available.
        localStorage.setItem('specMon_specs', JSON.stringify(specs));

        // Set initial spec inputs
        if (tempMinInput) tempMinInput.value = specs.temp.min;
        if (tempMaxInput) tempMaxInput.value = specs.temp.max;
        if (humMinInput) humMinInput.value = specs.hum.min;
        if (humMaxInput) humMaxInput.value = specs.hum.max;

        // Set default time with English forced Flatpickr calendar
        if (measureTimeInput) {
            if (window.flatpickr) {
                flatpickr(measureTimeInput, {
                    enableTime: true,
                    dateFormat: "Y-m-d H:i",
                    time_24hr: true,
                    defaultDate: new Date(),
                    disableMobile: "true" // Forces custom flatpickr English UI even on mobile
                });
            } else {
                // Fallback
                const now = new Date();
                now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                measureTimeInput.value = now.toISOString().slice(0, 16);
            }
        }

        // Set default month in monitoring view
        if (monthSelector) {
            const now = new Date();
            const yearStr = now.getFullYear();
            const monthStr = String(now.getMonth() + 1).padStart(2, '0');
            monthSelector.value = `${yearStr}-${monthStr}`;
        }

        // Apply Input Mode
        if (inputMode === 'camera') {
            if (radioModeCamera) radioModeCamera.checked = true;
        } else {
            if (radioModeManual) radioModeManual.checked = true;
        }
        applyInputMode();

        renderProcessList(); // Populate select and table
        renderAuthorList();
        renderSubsidiaryList();
        renderFactoryList();
        bindEvents();
        updateUI();

        // Auto-sync with server on load
        startAutoSync();
        runSync({ silent: true });
    }

    // 5. Events Binding
    function bindEvents() {
        // Navigation Events
        if (navDashboard) {
            navDashboard.addEventListener('click', (e) => {
                e.preventDefault();
                switchView('dashboard');
            });
        }
        if (navMonitoring) {
            navMonitoring.addEventListener('click', (e) => {
                e.preventDefault();
                switchView('monitoring');
            });
        }
        if (navSettings) {
            navSettings.addEventListener('click', (e) => {
                e.preventDefault();
                switchView('settings');
            });
        }

        // Input Mode Change Events
        if (radioModeManual && radioModeCamera) {
            radioModeManual.addEventListener('change', () => {
                if (radioModeManual.checked) {
                    inputMode = 'manual';
                    localStorage.setItem('specMon_inputMode', inputMode);
                    applyInputMode();
                    showToast('입력 방법이 수동 입력으로 변경되었습니다.');
                }
            });
            radioModeCamera.addEventListener('change', () => {
                if (radioModeCamera.checked) {
                    inputMode = 'camera';
                    localStorage.setItem('specMon_inputMode', inputMode);
                    applyInputMode();
                    showToast('입력 방법이 카메라 스캔으로 변경되었습니다.');
                }
            });
        }

        // Spec Setting Submit Event
        if (specForm) {
            specForm.addEventListener('submit', (e) => {
                e.preventDefault();
                specs = normalizeSpecs({
                    temp: {
                        min: parseFloat(tempMinInput.value),
                        max: parseFloat(tempMaxInput.value)
                    },
                    hum: {
                        min: parseFloat(humMinInput.value),
                        max: parseFloat(humMaxInput.value)
                    }
                });
                localStorage.setItem('specMon_specs', JSON.stringify(specs));
                showToast('스펙이 저장되었습니다. (Specs saved)');
                updateUI();
            });
        }

        // Process Form Submit Event
        if (processForm) {
            processForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const newName = newProcessNameInput.value.trim();
                if (newName && !processList.includes(newName)) {
                    processList.push(newName);
                    localStorage.setItem('specMon_processes', JSON.stringify(processList));
                    newProcessNameInput.value = '';
                    renderProcessList();
                    showToast('새로운 공정이 등록되었습니다. (New process added)');
                } else if (processList.includes(newName)) {
                    showToast('이미 등록된 공정입니다. (Process already registered)');
                }
            });
        }

        // Subsidiary Form Submit Event
        if (subsidiaryForm) {
            subsidiaryForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const newName = newSubsidiaryNameInput.value.trim();
                if (newName && !subsidiaryList.includes(newName)) {
                    subsidiaryList.push(newName);
                    localStorage.setItem('specMon_subsidiaries', JSON.stringify(subsidiaryList));
                    newSubsidiaryNameInput.value = '';
                    renderSubsidiaryList();
                    showToast('새로운 법인이 등록되었습니다. (New subsidiary added)');
                } else if (subsidiaryList.includes(newName)) {
                    showToast('이미 등록된 법인입니다. (Subsidiary already registered)');
                }
            });
        }

        // Author Form Submit Event
        if (authorForm) {
            authorForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const newName = newAuthorNameInput.value.trim();
                if (newName && !authorList.includes(newName)) {
                    authorList.push(newName);
                    localStorage.setItem('specMon_authors', JSON.stringify(authorList));
                    newAuthorNameInput.value = '';
                    renderAuthorList();
                    showToast('새로운 작성자가 등록되었습니다. (New author added)');
                } else if (authorList.includes(newName)) {
                    showToast('이미 등록된 작성자입니다. (Author already registered)');
                }
            });
        }

        // Camera OCR Event
        if (btnCamera && cameraInput) {
            btnCamera.addEventListener('click', () => {
                cameraInput.click();
            });

            cameraInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                showToast('이미지 분석 중... 잠시만 기다려주세요. 최대 10초가 소요될 수 있습니다. (Analyzing...)');

                try {
                    const result = await Tesseract.recognize(file, 'eng', { logger: m => console.log(m) });
                    const text = result.data.text;
                    console.log("OCR Extracted Text:", text);

                    // 7세그먼트 디스플레이 특성상 헷갈리기 쉬운 글자를 숫자로 보정하는 함수
                    function parseOCRNumber(str) {
                        if (!str) return null;
                        // 콜론이 포함된 경우 시계(시간) 형식으로 간주하여 무시 (예: 12:01)
                        if (str.includes(':')) return null;

                        let decoded = str
                            .replace(/[OoDdQ]/g, '0')    // 숫자 0 보정
                            .replace(/[Il|i]/g, '1')     // 숫자 1 보정
                            .replace(/[Zz]/g, '2')       // 숫자 2 보정
                            .replace(/[Ee]/g, '3')       // 숫자 3 보정
                            .replace(/[AhHYy]/g, '4')    // 숫자 4 보정
                            .replace(/[Ss]/g, '5')       // 숫자 5 보정
                            .replace(/[bG]/g, '6')       // 숫자 6 보정
                            .replace(/[T]/g, '7')        // 숫자 7 보정
                            .replace(/[B8]/g, '8')       // 숫자 8 보정
                            .replace(/[gq]/g, '9')       // 숫자 9 보정
                            .replace(/,/g, '.');         // 쉼표 오류를 소수점으로

                        // 무의미한 영단어가 숫자로 변환된 후에도 형태를 갖춘 숫자(2~3자리 이상)만 승인
                        const match = decoded.match(/\d{2,3}(?:\.\d)?/);
                        if (match) {
                            return parseFloat(match[0]);
                        }
                        return null;
                    }

                    // 텍스트를 공백(줄바꿈 포함)을 기준으로 토큰(단어) 단위로 분리
                    const tokens = text.trim().split(/\s+/);
                    let tempVal = null;
                    let humVal = null;
                    const allValidNumbers = [];

                    for (let i = 0; i < tokens.length; i++) {
                        const token = tokens[i];
                        const upper = token.toUpperCase();

                        // 명백한 기기 영단어 라벨링은 스캔에서 배제하여 오탐 방지
                        if (['COMFORT', 'CLEAR', 'TEMPERATURE', 'HUMIDITY', 'MAX', 'MIN', 'IN', 'OUT', 'TEMP', 'HUM'].some(w => upper.includes(w))) {
                            continue;
                        }

                        // 토큰에 기호가 포함되어 있는지 확인
                        const isHumSymbol = /(?:%|0\/0|o\/o|96|9\/6)/i.test(token);
                        const isTempSymbol = /(?:°|º|℃|\[|C$|c$)/.test(token);

                        let val = parseOCRNumber(token);

                        // 기호만 따로 떨어져 인식된 경우 (예: "26.2" "°C"), 이전 토큰의 숫자를 불러옴
                        if (val === null && (isHumSymbol || isTempSymbol) && i > 0) {
                            val = parseOCRNumber(tokens[i - 1]);
                        }

                        if (val !== null) {
                            allValidNumbers.push(val); // 휴리스틱 백업을 위해 유효한 모든 숫자 저장

                            // 기호를 특정지어 온습도 매칭 (일반적인 한계치 적용)
                            if (isHumSymbol && val >= 0 && val <= 100) {
                                humVal = val;
                            } else if (isTempSymbol && !isHumSymbol && val >= -30 && val <= 100) {
                                tempVal = val;
                            }
                        }
                    }

                    // 기호로 명확히 찾지 못했을 경우 (휴리스틱 백업)
                    if (tempVal === null || humVal === null) {
                        const candidates = [...new Set(allValidNumbers)]; // 중복 숫자 제거
                        if (candidates.length >= 2) {
                            // 제일 후순위로 탐지된 2개의 숫자를 가져옴 (시계나 다른 번호를 배제하기 위함)
                            let val1 = candidates[candidates.length - 2];
                            let val2 = candidates[candidates.length - 1];

                            if (tempVal === null && humVal === null) {
                                if (val1 < 40 && val2 >= 40) { tempVal = val1; humVal = val2; }
                                else if (val2 < 40 && val1 >= 40) { tempVal = val2; humVal = val1; }
                                else { tempVal = val1; humVal = val2; } // 둘 다 판단 어려우면 들어온 순서대로
                            } else if (tempVal === null) {
                                tempVal = (val1 === humVal) ? val2 : val1; // 이미 저장된 습도값이 아닌걸 배정
                            } else if (humVal === null) {
                                humVal = (val1 === tempVal) ? val2 : val1; // 이미 저장된 온도값이 아닌걸 배정
                            }
                        } else if (candidates.length === 1) {
                            let val1 = candidates[0];
                            if (tempVal === null && humVal === null) tempVal = val1;
                            else if (tempVal === null && humVal !== val1) tempVal = val1;
                            else if (humVal === null && tempVal !== val1) humVal = val1;
                        }
                    }

                    // 추출한 값 UI에 입력
                    if (tempVal !== null) measureTempInput.value = tempVal.toFixed(1);
                    if (humVal !== null) measureHumInput.value = humVal.toFixed(1);

                    if (tempVal !== null && humVal !== null) {
                        showToast('온습도 값이 자동 입력되었습니다. 오차가 있을 수 있으니 꼭 확인해주세요.');
                    } else if (tempVal !== null || humVal !== null) {
                        showToast('일부의 값만 인식되었습니다. 빈칸을 수동으로 입력해주세요.');
                    } else {
                        showToast('숫자 인식에 실패했습니다. 수동으로 입력해주세요. (OCR Failed)');
                    }
                } catch (err) {
                    console.error('OCR Error:', err);
                    showToast('이미지 분석 중 오류가 발생했습니다. (Error)');
                } finally {
                    cameraInput.value = ''; // 초기화하여 동일 파일 재업로드 가능하게
                }
            });
        }

        // Data Entry Submit Event
        if (dataForm) {
            dataForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const temp = sanitizeNumber(parseFloat(measureTempInput.value), NaN);
                const hum = sanitizeNumber(parseFloat(measureHumInput.value), NaN);
                const datetime = sanitizeText(measureTimeInput.value, new Date().toISOString().slice(0, 16));
                const processName = sanitizeText(processNameSelect.value, '-');
                const authorRaw = sanitizeText(authorNameSelect ? authorNameSelect.value : '-', '-');
                const subsidiaryName = sanitizeText(
                    (subsidiaryNameSelect && subsidiaryNameSelect.value) ? subsidiaryNameSelect.value : (subsidiaryList[0] || '-'),
                    '-'
                );
                const factoryName = sanitizeText(
                    (factoryNameSelect && factoryNameSelect.value) ? factoryNameSelect.value : (factoryList[0] || '-'),
                    '-'
                );
                const specTempMin = sanitizeNumber(
                    tempMinInput ? parseFloat(tempMinInput.value) : specs?.temp?.min,
                    DEFAULT_SPECS.temp.min
                );
                const specTempMax = sanitizeNumber(
                    tempMaxInput ? parseFloat(tempMaxInput.value) : specs?.temp?.max,
                    DEFAULT_SPECS.temp.max
                );
                const specHumMin = sanitizeNumber(
                    humMinInput ? parseFloat(humMinInput.value) : specs?.hum?.min,
                    DEFAULT_SPECS.hum.min
                );
                const specHumMax = sanitizeNumber(
                    humMaxInput ? parseFloat(humMaxInput.value) : specs?.hum?.max,
                    DEFAULT_SPECS.hum.max
                );
                const authorCombined = `${subsidiaryName}/${factoryName} ${authorRaw}`.trim();
                const safeTempSpecText = ensureSpecText(specTempMin, specTempMax, DEFAULT_SPECS.temp.min, DEFAULT_SPECS.temp.max);
                const safeHumSpecText = ensureSpecText(specHumMin, specHumMax, DEFAULT_SPECS.hum.min, DEFAULT_SPECS.hum.max);

                if (!Number.isFinite(temp) || !Number.isFinite(hum)) {
                    showToast('온도/습도 값이 비어 있거나 숫자가 아닙니다. 다시 입력해주세요.');
                    return;
                }

                // Status Evaluation logic based on CURRENT specs
                const tempStatus = (temp >= specTempMin && temp <= specTempMax);
                const humStatus = (hum >= specHumMin && hum <= specHumMax);
                const status = (tempStatus && humStatus) ? 'IN' : 'OUT';

                // Save new data, INCLUDING CURRENT SPECS as requested
                const newData = {
                    id: generateId(),
                    datetime,
                    subsidiaryName,
                    processName,
                    factoryName,
                    author: authorRaw,
                    authorRaw,
                    authorCombined,
                    temp,
                    hum,
                    status,
                    specTempMin,
                    specTempMax,
                    specHumMin,
                    specHumMax,
                    _syncState: GOOGLE_SHEETS_URL ? 'pending' : 'local'
                };

                processData.push(newData);
                persistProcessData();
                localStorage.setItem('specMon_author', authorRaw); // Remember last author

                if (GOOGLE_SHEETS_URL) {
                    enqueueSync('insert', newData);
                    flushSyncQueue({ silent: false });
                } else {
                    showToast('로컬 기기에 저장되었습니다.');
                }

                measureTempInput.value = '';
                measureHumInput.value = '';
                updateUI();
                return;
                /* Legacy sync block removed

                    // 2. 구글 시트로 전송 로직 (호환성 보강)
                    if (GOOGLE_SHEETS_URL) {
                        showToast('데이터 전송 중...');
                        const sheetPayload = {
                            action: 'insert',
                            date: newData.datetime,
                            subsidiaryName: newData.subsidiaryName,
                            factoryName: newData.factoryName,
                            processName: newData.processName,
                            author: newData.authorRaw,
                            temp: newData.temp,
                            hum: newData.hum,
                            status: newData.status,
                            tempSpec: `${newData.specTempMin}~${newData.specTempMax}`,
                            humSpec: `${newData.specHumMin}~${newData.specHumMax}`
                        };

                        fetch(GOOGLE_SHEETS_URL, {
                            method: 'POST',
                            mode: 'no-cors',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(sheetPayload)
                        }).then(() => {
                            showToast('구글 시트 저장 완료!');
                            updateUI();
                        }).catch(error => {
                            console.error('Sheet Sync Error:', error);
                            showToast('로컬 저장 완료 (전송 실패)');
                        });
                    } else {
                        showToast('로컬 기기에 저장되었습니다.');
                        updateUI();
                    }

                    // 입력 필드 초기화
                    measureTempInput.value = '';
                    measureHumInput.value = '';
                    updateUI();
                */
            });
        }

        // Monitoring Month Selector Event
        if (monthSelector) {
            monthSelector.addEventListener('change', updateUI);
        }
        if (monitoringProcessSelector) {
            monitoringProcessSelector.addEventListener('change', updateUI);
        }
        if (monitoringSubsidiarySelector) {
            monitoringSubsidiarySelector.addEventListener('change', updateUI);
        }
        if (monitoringFactorySelector) {
            monitoringFactorySelector.addEventListener('change', updateUI);
        }

        // Table List Action Events
        if (refreshDataBtn) {
            refreshDataBtn.addEventListener('click', () => runSync({ silent: false }));
        }

        if (clearDataBtn) {
            clearDataBtn.addEventListener('click', () => {
                if (processData.length === 0) return;
                if (confirm('모든 데이터를 초기화하시겠습니까? 복구할 수 없습니다. (Clear all data? Cannot be undone.)')) {
                    processData = [];
                    syncQueue = [];
                    persistProcessData();
                    persistSyncQueue();
                    updateUI();
                    showToast('초기화 완료되었습니다. (Data cleared)');
                }
            });
        }

        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', () => {
                if (processData.length === 0) {
                    alert('내보낼 데이터가 없습니다. (No data to export)');
                    return;
                }

                let csvContent = "\uFEFF";
                csvContent = "\uFEFF측정일시(Time),법인명(Subsidiary),공장명(Factory),공정명(Process Name),작성자(Author),온도/Temp(°C),온도스펙/TempSpec(Min-Max),습도/Hum(%),습도스펙/HumSpec(Min-Max),판정결과(Status)\n";
                csvContent += "측정일시(Time),법인명(Subsidiary),공장명(Factory),공정명(Process Name),작성자(Author),온도/Temp(°C),온도스펙/TempSpec(Min-Max),습도/Hum(%),습도스펙/HumSpec(Min-Max),판정결과(Status)\n";

                csvContent = "\uFEFF측정일시(Time),법인명(Subsidiary),공장명(Factory),공정명(Process Name),작성자(Author),온도/Temp(°C),온도스펙/TempSpec(Min-Max),습도/Hum(%),습도스펙/HumSpec(Min-Max),판정결과(Status)\n";
                processData.forEach(item => {
                    const tempSpecText = formatSpecRange(item.specTempMin, item.specTempMax);
                    const humSpecText = formatSpecRange(item.specHumMin, item.specHumMax);
                    const row = [
                        item.datetime,
                        item.subsidiaryName || '-',
                        item.factoryName || '-',
                        item.processName,
                        item.author || '-',
                        item.temp,
                        tempSpecText,
                        item.hum,
                        humSpecText,
                        item.status
                    ].map(toCsvCell).join(',');
                    csvContent += `${row}\n`;
                });

                const encodedUri = `data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`;
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", `SpecData_${new Date().toISOString().slice(0, 10)}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        }
    }

    // 6. Navigate Views
    function switchView(viewName) {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.view-section').forEach(el => {
            el.classList.remove('active');
            el.classList.add('hidden'); // explicitly hide all content
        });

        if (viewName === 'dashboard') {
            if (navDashboard) navDashboard.classList.add('active');
            if (viewDashboard) {
                viewDashboard.classList.add('active');
                viewDashboard.classList.remove('hidden');
            }
        } else if (viewName === 'monitoring') {
            if (navMonitoring) navMonitoring.classList.add('active');
            if (viewMonitoring) {
                viewMonitoring.classList.add('active');
                viewMonitoring.classList.remove('hidden');
            }
        } else if (viewName === 'settings') {
            if (navSettings) navSettings.classList.add('active');
            if (viewSettings) {
                viewSettings.classList.add('active');
                viewSettings.classList.remove('hidden');
            }
        }
        // Force charts re-render only if dashboard or monitoring is viewed to avoid rendering on hidden canvas
        if (viewName !== 'settings') {
            updateUI();
        }
    }

    // 7. Render UI Data (Tables and Charts)
    function renderTable() {
        if (tableBodyDashboard) tableBodyDashboard.innerHTML = '';
        if (tableBodyMonitoring) tableBodyMonitoring.innerHTML = '';

        const reversedData = [...processData].reverse();

        // Render Dashboard Table (recent 5 items)
        reversedData.slice(0, 5).forEach(item => {
            const tr = document.createElement('tr');
            const dt = new Date(item.datetime);
            const dateStr = dt.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            const badgeClass = item.status === 'IN' ? 'badge in' : 'badge out';

            // For historical spec display text
            const tempRange = formatSpecRange(item.specTempMin, item.specTempMax);
            const humRange = formatSpecRange(item.specHumMin, item.specHumMax);
            const tempSpecDisplay = tempRange !== '-' ? `(${tempRange})` : '';
            const humSpecDisplay = humRange !== '-' ? `(${humRange})` : '';

            tr.innerHTML = `
                <td>${dateStr}</td>
                <td style="color: #94a3b8; font-size: 0.9em;"><strong>${item.subsidiaryName || '-'}</strong></td>
                <td style="color: #94a3b8; font-size: 0.9em;"><strong>${item.factoryName || '-'}</strong></td>
                <td><strong>${item.processName}</strong></td>
                <td style="color: #94a3b8; font-size: 0.9em;">${item.author || '-'}</td>
                <td>
                    ${item.temp.toFixed(1)} °C
                </td>
                <td>
                    ${item.hum.toFixed(1)} %
                </td>
                <td><span class="${badgeClass}">${item.status}</span></td>
            `;
            if (tableBodyDashboard) tableBodyDashboard.appendChild(tr);
        });

        // Render Monitoring Table (filtered by month, subsidiary, factory, and process)
        const selectedMonth = monthSelector ? monthSelector.value : '';
        const selectedSubsidiary = monitoringSubsidiarySelector ? monitoringSubsidiarySelector.value : '';
        const selectedFactory = monitoringFactorySelector ? monitoringFactorySelector.value : '';
        const selectedProcess = monitoringProcessSelector ? monitoringProcessSelector.value : '';

        let filteredData = reversedData;

        if (selectedMonth) {
            filteredData = filteredData.filter(d => d.datetime.startsWith(selectedMonth));
        }
        if (selectedSubsidiary) {
            filteredData = filteredData.filter(d => d.subsidiaryName === selectedSubsidiary);
        }
        if (selectedFactory) {
            filteredData = filteredData.filter(d => d.factoryName === selectedFactory);
        }
        if (selectedProcess) {
            filteredData = filteredData.filter(d => d.processName === selectedProcess);
        }

        const monitoringCountSpan = viewMonitoring.querySelector('#total-count');
        if (monitoringCountSpan) monitoringCountSpan.textContent = filteredData.length;

        filteredData.forEach(item => {
            const tr = document.createElement('tr');
            const dt = new Date(item.datetime);
            const dateStr = dt.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            const badgeClass = item.status === 'IN' ? 'badge in' : 'badge out';

            // For historical spec display text in full table
            const tempRange = formatSpecRange(item.specTempMin, item.specTempMax);
            const humRange = formatSpecRange(item.specHumMin, item.specHumMax);
            const tempSpecDisplay = tempRange !== '-' ? `(${tempRange})` : '';
            const humSpecDisplay = humRange !== '-' ? `(${humRange})` : '';

            tr.innerHTML = `
                <td>${dateStr}</td>
                <td style="color: #94a3b8; font-size: 0.9em;"><strong>${item.subsidiaryName || '-'}</strong></td>
                <td style="color: #94a3b8; font-size: 0.9em;"><strong>${item.factoryName || '-'}</strong></td>
                <td><strong>${item.processName}</strong></td>
                <td style="color: #94a3b8; font-size: 0.9em;">${item.author || '-'}</td>
                <td>${item.temp.toFixed(1)} °C <br><small style="color:#64748b; font-size: 0.8em">${tempSpecDisplay}</small></td>
                <td>${item.hum.toFixed(1)} % <br><small style="color:#64748b; font-size: 0.8em">${humSpecDisplay}</small></td>
                <td><span class="${badgeClass}">${item.status}</span></td>
                <td>
                    <button class="table-action-btn" onclick="deleteData('${item.id}')" title="삭제">
                        <i data-lucide="trash-2" style="width: 18px; height: 18px;"></i>
                    </button>
                </td>
            `;
            if (tableBodyMonitoring) tableBodyMonitoring.appendChild(tr);
        });

        lucide.createIcons();
    }

    // Global deletion handlers
    window.deleteData = async function (id) {
        if (confirm('이 항목을 삭제하시겠습니까? (Delete this record?)')) {
            // Local deletion first
            const deletedRow = processData.find(d => d.id === id);
            processData = processData.filter(d => d.id !== id);
            persistProcessData();
            updateUI();
            if (GOOGLE_SHEETS_URL && deletedRow) {
                enqueueSync('delete', deletedRow);
                flushSyncQueue({ silent: false });
                return;
            }

            // Note: True server deletion from Google Sheets requires more logic in Apps Script + POST with action='delete'.
            // For now, this only permanently deletes it from local device / UI until next sync.
            showToast('삭제되었습니다. (Deleted)');
        }
    }

    window.deleteProcess = function (name) {
        if (confirm(`'${name}' 공정을 목록에서 삭제하시겠습니까? (Delete this process?)`)) {
            processList = processList.filter(p => p !== name);
            localStorage.setItem('specMon_processes', JSON.stringify(processList));
            renderProcessList();
            showToast('공정이 삭제되었습니다. (Process deleted)');
        }
    }

    window.deleteAuthor = function (name) {
        if (confirm(`'${name}' 작성자를 목록에서 삭제하시겠습니까? (Delete this author?)`)) {
            authorList = authorList.filter(a => a !== name);
            localStorage.setItem('specMon_authors', JSON.stringify(authorList));
            renderAuthorList();
            showToast('작성자가 삭제되었습니다. (Author deleted)');
        }
    }

    window.deleteSubsidiary = function (name) {
        if (confirm(`'${name}' 법인을 목록에서 삭제하시겠습니까? (Delete this subsidiary?)`)) {
            subsidiaryList = subsidiaryList.filter(s => s !== name);
            localStorage.setItem('specMon_subsidiaries', JSON.stringify(subsidiaryList));
            renderSubsidiaryList();
            showToast('법인이 삭제되었습니다. (Subsidiary deleted)');
        }
    }

    window.deleteFactory = function (name) {
        if (confirm(`'${name}' 공장을 목록에서 삭제하시겠습니까? (Delete this factory?)`)) {
            factoryList = factoryList.filter(f => f !== name);
            localStorage.setItem('specMon_factories', JSON.stringify(factoryList));
            renderFactoryList();
            showToast('공장이 삭제되었습니다. (Factory deleted)');
        }
    }

    function renderAuthorList() {
        if (authorNameSelect) {
            const currentSelection = localStorage.getItem('specMon_author') || authorNameSelect.value;
            authorNameSelect.innerHTML = '';
            authorList.forEach(a => {
                const opt = document.createElement('option');
                opt.value = a;
                opt.textContent = a;
                authorNameSelect.appendChild(opt);
            });
            if (authorList.includes(currentSelection)) {
                authorNameSelect.value = currentSelection;
            } else if (authorList.length > 0) {
                authorNameSelect.value = authorList[0];
            }
        }

        if (authorListBody) {
            authorListBody.innerHTML = '';
            authorList.forEach(a => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${a}</strong></td>
                    <td style="text-align: center;">
                        <button class="table-action-btn" onclick="deleteAuthor('${a}')" title="삭제">
                            <i data-lucide="trash-2" style="width: 18px; height: 18px;"></i>
                        </button>
                    </td>
                `;
                authorListBody.appendChild(tr);
            });
            if (window.lucide) window.lucide.createIcons();
        }
    }

    function renderProcessList() {
        // Update Select options
        if (processNameSelect) {
            const currentSelection = processNameSelect.value;
            processNameSelect.innerHTML = '';
            processList.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p;
                opt.textContent = p;
                processNameSelect.appendChild(opt);
            });
            // Restore selection if it still exists
            if (processList.includes(currentSelection)) {
                processNameSelect.value = currentSelection;
            }
        }

        if (monitoringProcessSelector) {
            const currentSel2 = monitoringProcessSelector.value;
            monitoringProcessSelector.innerHTML = '<option value="">전체 공정 (All)</option>';
            processList.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p;
                opt.textContent = p;
                monitoringProcessSelector.appendChild(opt);
            });
            if (processList.includes(currentSel2)) {
                monitoringProcessSelector.value = currentSel2;
            }
        }

        // Update Settings Management Table
        if (processListBody) {
            processListBody.innerHTML = '';
            processList.forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${p}</strong></td>
                    <td style="text-align: center;">
                        <button class="table-action-btn" onclick="deleteProcess('${p}')" title="삭제">
                            <i data-lucide="trash-2" style="width: 18px; height: 18px;"></i>
                        </button>
                    </td>
                `;
                processListBody.appendChild(tr);
            });
            if (window.lucide) window.lucide.createIcons();
        }
    }

    function renderSubsidiaryList() {
        if (subsidiaryNameSelect) {
            const currentSelection = subsidiaryNameSelect.value;
            subsidiaryNameSelect.innerHTML = '';
            subsidiaryList.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s;
                opt.textContent = s;
                subsidiaryNameSelect.appendChild(opt);
            });
            if (subsidiaryList.includes(currentSelection)) {
                subsidiaryNameSelect.value = currentSelection;
            } else if (subsidiaryList.length > 0) {
                subsidiaryNameSelect.value = subsidiaryList[0];
            }
        }

        if (monitoringSubsidiarySelector) {
            const currentSelMonSub = monitoringSubsidiarySelector.value;
            monitoringSubsidiarySelector.innerHTML = '<option value="">전체 법인 (All)</option>';
            subsidiaryList.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s;
                opt.textContent = s;
                monitoringSubsidiarySelector.appendChild(opt);
            });
            if (subsidiaryList.includes(currentSelMonSub)) {
                monitoringSubsidiarySelector.value = currentSelMonSub;
            }
        }

        if (subsidiaryListBody) {
            subsidiaryListBody.innerHTML = '';
            subsidiaryList.forEach(s => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${s}</strong></td>
                    <td style="text-align: center;">
                        <button class="table-action-btn" onclick="deleteSubsidiary('${s}')" title="삭제">
                            <i data-lucide="trash-2" style="width: 18px; height: 18px;"></i>
                        </button>
                    </td>
                `;
                subsidiaryListBody.appendChild(tr);
            });
            if (window.lucide) window.lucide.createIcons();
        }
    }

    function renderFactoryList() {
        if (factoryNameSelect) {
            const currentSelection = factoryNameSelect.value;
            factoryNameSelect.innerHTML = '';
            factoryList.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f;
                opt.textContent = f;
                factoryNameSelect.appendChild(opt);
            });
            if (factoryList.includes(currentSelection)) {
                factoryNameSelect.value = currentSelection;
            } else if (factoryList.length > 0) {
                factoryNameSelect.value = factoryList[0];
            }
        }

        if (monitoringFactorySelector) {
            const currentSelMonFact = monitoringFactorySelector.value;
            monitoringFactorySelector.innerHTML = '<option value="">전체 공장 (All)</option>';
            factoryList.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f;
                opt.textContent = f;
                monitoringFactorySelector.appendChild(opt);
            });
            if (factoryList.includes(currentSelMonFact)) {
                monitoringFactorySelector.value = currentSelMonFact;
            }
        }

        if (factoryListBody) {
            factoryListBody.innerHTML = '';
            factoryList.forEach(f => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${f}</strong></td>
                    <td style="text-align: center;">
                        <button class="table-action-btn" onclick="deleteFactory('${f}')" title="삭제">
                            <i data-lucide="trash-2" style="width: 18px; height: 18px;"></i>
                        </button>
                    </td>
                `;
                factoryListBody.appendChild(tr);
            });
            if (window.lucide) window.lucide.createIcons();
        }
    }

    // === Chart.js Visualization ===
    // 플러그인 등록 (UMD 버전 대응)
    if (window.Chart && window.chartjsPluginAnnotation) {
        Chart.register(window.chartjsPluginAnnotation);
    }

    let trendChartObj = null;
    let monitoringChartObj = null;

    function createChart(ctxId, chartInstance) {
        const canvas = document.getElementById(ctxId);
        if (!canvas) return chartInstance;
        const ctx = canvas.getContext('2d');

        let targetData = processData;

        // Month, Subsidiary, Factory, & Process filter logic for monitoring chart
        if (ctxId === 'monitoringChart') {
            if (monthSelector && monthSelector.value) {
                targetData = targetData.filter(d => d.datetime.startsWith(monthSelector.value));
            }
            if (monitoringSubsidiarySelector && monitoringSubsidiarySelector.value) {
                targetData = targetData.filter(d => d.subsidiaryName === monitoringSubsidiarySelector.value);
            }
            if (monitoringFactorySelector && monitoringFactorySelector.value) {
                targetData = targetData.filter(d => d.factoryName === monitoringFactorySelector.value);
            }
            if (monitoringProcessSelector && monitoringProcessSelector.value) {
                targetData = targetData.filter(d => d.processName === monitoringProcessSelector.value);
            }
        }

        const labels = targetData.map(d => {
            const dt = new Date(d.datetime);
            if (isNaN(dt.getTime())) return d.datetime; // 무효한 날짜 대비
            return `${dt.getMonth() + 1}/${dt.getDate()} ${dt.getHours()}:${String(dt.getMinutes()).padStart(2, '0')}`;
        });

        if (targetData.length === 0) {
            // 데이터가 없을 때 빈 차트 대신 안내 텍스트 처리 가능 (여기서는 빈 배열로 렌더링)
            labels.push('데이터 없음');
        }

        const tempDataset = targetData.map(d => d.temp);
        const humDataset = targetData.map(d => d.hum);

        // Chart config with Annotation Plugin
        const config = {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '온도 (Temp) °C',
                        data: tempDataset,
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        yAxisID: 'y',
                        borderWidth: 3, // 선 두께 확대
                        tension: 0.3,
                        pointRadius: 4, // 점 크기 확대
                        pointBackgroundColor: '#ef4444'
                    },
                    {
                        label: '습도 (Humid) %',
                        data: humDataset,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        yAxisID: 'y1',
                        borderWidth: 3, // 선 두께 확대
                        tension: 0.3,
                        pointRadius: 4, // 점 크기 확대
                        pointBackgroundColor: '#3b82f6'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: { labels: { color: '#94a3b8' } },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#f8fafc',
                        bodyColor: '#e2e8f0',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1
                    },
                    // Draw tolerance ranges as boxes
                    annotation: {
                        annotations: {
                            tempMinArea: {
                                type: 'box',
                                yMin: -100,
                                yMax: specs.temp.min,
                                yScaleID: 'y',
                                backgroundColor: 'rgba(239, 68, 68, 0.2)', // 배경 농도 상향
                                borderWidth: 0,
                                drawTime: 'beforeDatasetsDraw'
                            },
                            tempMaxArea: {
                                type: 'box',
                                yMin: specs.temp.max,
                                yMax: 200,
                                yScaleID: 'y',
                                backgroundColor: 'rgba(239, 68, 68, 0.2)', // 배경 농도 상향
                                borderWidth: 0,
                                drawTime: 'beforeDatasetsDraw'
                            },
                            humMinArea: {
                                type: 'box',
                                yMin: -100,
                                yMax: specs.hum.min,
                                yScaleID: 'y1',
                                backgroundColor: 'rgba(59, 130, 246, 0.2)', // 배경 농도 상향
                                borderWidth: 0,
                                drawTime: 'beforeDatasetsDraw'
                            },
                            humMaxArea: {
                                type: 'box',
                                yMin: specs.hum.max,
                                yMax: 200,
                                yScaleID: 'y1',
                                backgroundColor: 'rgba(59, 130, 246, 0.2)', // 배경 농도 상향
                                borderWidth: 0,
                                drawTime: 'beforeDatasetsDraw'
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#94a3b8' }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: '온도 (Temp) °C', color: '#ef4444' },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#94a3b8' },
                        suggestedMin: specs.temp.min - 5,
                        suggestedMax: specs.temp.max + 5
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: '습도 (Humid) %', color: '#3b82f6' },
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#94a3b8' },
                        suggestedMin: Math.max(0, specs.hum.min - 10),
                        suggestedMax: specs.hum.max + 10
                    }
                }
            }
        };

        if (chartInstance) chartInstance.destroy();
        return new Chart(ctx, config);
    }

    function renderChart() {
        trendChartObj = createChart('trendChart', trendChartObj);
        monitoringChartObj = createChart('monitoringChart', monitoringChartObj);
    }

    // 8. Global UI Update wrapper
    function updateUI() {
        renderTable();
        renderChart();
    }

    // Re-declare sync functions to ensure stable behavior after legacy merges.
    async function flushSyncQueue({ silent = true } = {}) {
        if (!GOOGLE_SHEETS_URL || syncInProgress || syncQueue.length === 0) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

        syncInProgress = true;
        let syncedCount = 0;

        try {
            while (syncQueue.length > 0) {
                const op = syncQueue[0];
                try {
                    await postToGoogleSheets(op.payload);
                    syncQueue.shift();
                    syncedCount += 1;

                    if (op.action === 'insert') {
                        const idx = processData.findIndex(item => item.id === op.id);
                        if (idx >= 0) processData[idx]._syncState = 'synced';
                    }
                    persistSyncQueue();
                    persistProcessData();
                } catch (error) {
                    op.retries = (op.retries || 0) + 1;
                    op.lastError = error && error.message ? error.message : 'unknown';
                    persistSyncQueue();

                    const idx = processData.findIndex(item => item.id === op.id);
                    if (idx >= 0 && op.action === 'insert') {
                        processData[idx]._syncState = 'failed';
                        persistProcessData();
                    }
                    if (!silent) showToast(`동기화 대기 중 (${syncQueue.length}건)`);
                    break;
                }
            }
            if (syncedCount > 0 && !silent) showToast(`동기화 완료 (${syncedCount}건)`);
        } finally {
            syncInProgress = false;
        }
    }

    async function fetchServerData({ silent = false } = {}) {
        if (!GOOGLE_SHEETS_URL) return;
        if (!silent) showToast('서버 데이터 동기화 중...');

        try {
            const response = await fetch(GOOGLE_SHEETS_URL, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const textResponse = await response.text();
            let parsed = [];
            try {
                parsed = JSON.parse(textResponse);
            } catch (e) {
                parsed = [];
            }

            const rows = Array.isArray(parsed)
                ? parsed
                : (Array.isArray(parsed?.data) ? parsed.data : (Array.isArray(parsed?.rows) ? parsed.rows : []));
            const normalized = normalizeFetchedData(rows);
            if (!Array.isArray(normalized) || normalized.length === 0) {
                if (!silent) showToast('서버 응답 데이터가 없습니다.');
                return;
            }

            mergeServerData(normalized);
            updateUI();
            if (!silent) showToast('서버 데이터 동기화 완료');
        } catch (e) {
            console.error('Fetch error:', e);
            if (!silent) showToast('서버 데이터 조회 실패');
        }
    }

    async function runSync({ silent = true } = {}) {
        await flushSyncQueue({ silent: true });
        await fetchServerData({ silent });
        await flushSyncQueue({ silent: true });
        if (!silent) updateUI();
    }

    function showToast(msg) {
        if (!toast) return;
        toast.className = 'toast show';
        toast.innerHTML = `<i data-lucide="check-circle"></i> ${msg}`;
        lucide.createIcons();
        setTimeout(() => {
            toast.className = 'toast hidden';
        }, 3000);
    }

    // Initialization & Authentication
    const authScreen = document.getElementById('auth-screen');
    const mainAppContainer = document.getElementById('main-app-container');
    const authForm = document.getElementById('auth-form');
    const authCodeInput = document.getElementById('auth-code');
    const authError = document.getElementById('auth-error');

    // Check if user is already authenticated
    if (localStorage.getItem('specMon_authenticated') === 'true') {
        if (authScreen) authScreen.style.display = 'none';
        if (mainAppContainer) mainAppContainer.style.display = 'flex';
        init();
    } else {
        // Must login first
        if (authForm) {
            authForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const code = authCodeInput.value.trim().toLowerCase();
                if (code === 'hansol') {
                    localStorage.setItem('specMon_authenticated', 'true');
                    authScreen.style.display = 'none';
                    mainAppContainer.style.display = 'flex';
                    init();
                } else {
                    authError.style.display = 'block';
                    authCodeInput.value = '';
                    authCodeInput.focus();
                }
            });
        }
    }

    // 앱 설치 관련 이벤트 (PWA Install Prompt)
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (btnInstall) btnInstall.style.display = 'flex';
    });

    if (btnInstall) {
        btnInstall.addEventListener('click', async () => {
            vibrate(30);
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                btnInstall.style.display = 'none';
            }
            deferredPrompt = null;
        });
    }

    // 모든 버튼과 메뉴에 진동 추가 (Apply Vibration to all clicks)
    document.addEventListener('click', (e) => {
        const target = e.target.closest('.btn, .nav-item, .table-action-btn, .btn-icon');
        if (target) {
            vibrate(12);
        }
    });

    window.addEventListener('beforeunload', () => {
        stopAutoSync();
    });
});
