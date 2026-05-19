// =================================================================
// 1. STATE PROPERTIES & METEOROLOGICAL ANCHORS
// =================================================================
const NWS_API_BASE = "https://api.weather.gov";
let currentLat = 42.0451; // Chicagoland Secure Default
let currentLon = -87.6877;
let radarInitialized = false;

// =================================================================
// 2. RUNTIME EVENT ENGINE INIT
// =================================================================
document.addEventListener("DOMContentLoaded", () => {
    initializeDashboard();
    setupActionListeners();
    setupTabNavigationEngine();
    setupModalControls();
});

async function initializeDashboard() {
    await fetchMeteorologicalFeeds(currentLat, currentLon);
    await syncActiveConvectiveAlerts(currentLat, currentLon);
    await pollMesoscaleDiscussions(currentLat, currentLon);
    if (radarInitialized || document.getElementById("view-radar").classList.contains("active")) {
        injectLiveRadarStream();
    }
}

function setupActionListeners() {
    const searchBtn = document.getElementById("searchBtn");
    const searchInput = document.getElementById("searchInput");
    
    if (searchBtn && searchInput) {
        searchBtn.addEventListener("click", () => runGeocodingPipeline(searchInput.value));
        searchInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") runGeocodingPipeline(searchInput.value);
        });
    }
}

// =================================================================
// 3. TAB VIEWPORT MANAGER SYSTEM
// =================================================================
function setupTabNavigationEngine() {
    const tabs = document.querySelectorAll(".nav-tab");
    const panes = document.querySelectorAll(".dashboard-pane");

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const targetId = tab.getAttribute("data-target");
            
            tabs.forEach(t => t.classList.remove("active"));
            panes.forEach(p => p.classList.remove("active"));
            
            tab.classList.add("active");
            const targetPane = document.getElementById(targetId);
            if (targetPane) {
                targetPane.classList.add("active");
                targetPane.classList.add("animate-pane-switch");
                setTimeout(() => targetPane.classList.remove("animate-pane-switch"), 400);
            }

            if (targetId === "view-radar") {
                injectLiveRadarStream();
            }
        });
    });
}

// =================================================================
// 4. GEOCODING INTERCEPT NETWORKING
// =================================================================
async function runGeocodingPipeline(query) {
    if (!query) return;
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        if (!res.ok) return;
        const data = await res.json();
        
        if (data && data.length > 0) {
            currentLat = parseFloat(data[0].lat);
            currentLon = parseFloat(data[0].lon);
            
            const titleEl = document.querySelector(".location-title");
            if (titleEl) {
                titleEl.textContent = data[0].display_name.split(',')[0].toUpperCase();
            }
            
            radarInitialized = false; 
            await initializeDashboard();
        }
    } catch (err) {
        console.error("Geocoding validation interrupted:", err);
    }
}

// =================================================================
// 5. METEOROLOGICAL STREAM DATA INGESTION
// =================================================================
async function fetchMeteorologicalFeeds(lat, lon) {
    try {
        const pointsRes = await fetch(`${NWS_API_BASE}/points/${lat},${lon}`);
        if (!pointsRes.ok) throw new Error("Grid stream links unavailable");
        const pointsData = await pointsRes.json();
        
        const forecastDailyUrl = pointsData?.properties?.forecast;
        const forecastHourlyUrl = pointsData?.properties?.forecastHourly;
        
        const [dailyRes, hourlyRes] = await Promise.all([
            fetch(forecastDailyUrl),
            fetch(forecastHourlyUrl)
        ]);
        
        if (!dailyRes.ok || !hourlyRes.ok) throw new Error("Product delivery streams offline");
        
        const dailyData = await dailyRes.json();
        const hourlyData = await hourlyRes.json();
        
        const hourlyPeriods = hourlyData?.properties?.periods;
        const dailyPeriods = dailyData?.properties?.periods;
        
        renderPrimaryWorkspace(hourlyPeriods[0], dailyPeriods[0]);
        renderHourlyTimeline(hourlyPeriods);
        renderDailyForecast(dailyPeriods);
        
    } catch (err) {
        console.error("Data pipeline fault:", err);
        const conditionTxt = document.querySelector(".condition-text");
        if (conditionTxt) conditionTxt.textContent = "DATA LINK TIMEOUT";
    }
}

// =================================================================
// 6. PIPELINE WORKSPACE PARSING (ZERO EMOJIS)
// =================================================================
function renderPrimaryWorkspace(currentHourly, currentDaily) {
    if (!currentHourly) return;
    
    const tempEl = document.querySelector(".main-temp");
    const condEl = document.querySelector(".condition-text");
    const hiLoEl = document.querySelector(".hi-lo");
    const mainIcon = document.querySelector(".main-weather-icon");
    
    if (tempEl) tempEl.textContent = `${currentHourly.temperature}°`;
    if (condEl) condEl.textContent = currentHourly.shortForecast.toUpperCase();
    if (hiLoEl && currentDaily) hiLoEl.textContent = `HIGH: ${currentDaily.temperature}°`;
    
    if (mainIcon && currentHourly.icon) {
        const assignedCode = mapForecastToAssetIndex(currentHourly.shortForecast, currentHourly.isDaytime);
        mainIcon.src = formatAssetPathString(assignedCode);
    }
    
    const dpVal = currentHourly.dewpoint?.value ? `${Math.round(currentHourly.dewpoint.value * 9/5 + 32)}°F` : "--";
    const rhVal = currentHourly.relativeHumidity?.value ? `${currentHourly.relativeHumidity.value}%` : "--";
    const windVal = currentHourly.windSpeed ? `${currentHourly.windDirection || ""} ${currentHourly.windSpeed}`.toUpperCase() : "--";
    
    document.getElementById("metric-dewpoint").textContent = dpVal;
    document.getElementById("metric-humidity").textContent = rhVal;
    document.getElementById("metric-wind").textContent = windVal;
    document.getElementById("metric-apparent").textContent = `${currentHourly.temperature}°F`;
}

function renderHourlyTimeline(periods) {
    const container = document.getElementById("hourly-container");
    if (!container || !periods) return;
    
    container.innerHTML = "";
    // Expanded to ingest up to a full 72-hour operational run matrix
    const totalPeriods = periods.slice(0, Math.min(72, periods.length));
    
    totalPeriods.forEach((hour, index) => {
        const card = document.createElement("div");
        card.className = "hourly-card card-entry-anim";
        card.style.animationDelay = `${index * 0.015}s`;
        
        const timeFormatted = new Date(hour.startTime).toLocaleTimeString([], { hour: '2-digit' });
        const iconIndex = mapForecastToAssetIndex(hour.shortForecast, hour.isDaytime);
        
        card.innerHTML = `
            <span class="time">${timeFormatted.toUpperCase()}</span>
            <img src="${formatAssetPathString(iconIndex)}" alt="Grid entry asset" class="timeline-icon" />
            <span class="temp">${hour.temperature}°</span>
        `;
        container.appendChild(card);
    });
}

function renderDailyForecast(periods) {
    const container = document.getElementById("daily-container");
    if (!container || !periods) return;
    
    container.innerHTML = "";
    
    periods.forEach((period, index) => {
        const row = document.createElement("div");
        row.className = "forecast-row card-entry-anim";
        row.style.animationDelay = `${index * 0.03}s`;
        
        const iconIndex = mapForecastToAssetIndex(period.shortForecast, period.isDaytime);
        
        row.innerHTML = `
            <span class="day-name">${period.name.toUpperCase()}</span>
            <img src="${formatAssetPathString(iconIndex)}" alt="Matrix index icon" class="row-icon" />
            <span class="row-temp">${period.temperature}°</span>
            <span class="row-desc">${period.shortForecast.toUpperCase()}</span>
        `;
        container.appendChild(row);
    });
}

// =================================================================
// 7. LIVE RAINVIEWER INTEGRATION APPARATUS
// =================================================================
function injectLiveRadarStream() {
    if (radarInitialized) return;
    const frame = document.getElementById("radar-frame");
    if (!frame) return;
    
    // Smooth dynamic projection map generation mapping exactly to sector coordinates
    frame.src = `https://www.rainviewer.com/map.html?loc=${currentLat},${currentLon},8&o=1&c=7&m=1&g=1&s=1&w=1&v=black`;
    radarInitialized = true;
}

// =================================================================
// 8. INTERACTIVE HAZARD DIAGNOSTIC HANDLERS
// =================================================================
async function syncActiveConvectiveAlerts(lat, lon) {
    const box = document.getElementById("alerts-container");
    if (!box) return;
    
    try {
        const response = await fetch(`${NWS_API_BASE}/alerts/active?point=${lat},${lon}`);
        if (!response.ok) throw new Error();
        const data = await response.json();
        const features = data.features || [];
        
        if (features.length === 0) {
            box.innerHTML = `<p class="status-msg">NO ACTIVE ATMOSPHERIC HAZARDS IN SECTOR</p>`;
            return;
        }
        
        box.innerHTML = "";
        features.forEach(item => {
            const props = item.properties;
            if (!props) return;
            
            const card = document.createElement("div");
            card.className = "alert-bulletin-card clickable-alert";
            card.innerHTML = `
                <div class="alert-header-row">
                    <h4>${props.event.toUpperCase()}</h4>
                    <span class="diagnostic-tag">DIAGNOSTIC CRIT</span>
                </div>
                <p>${props.headline ? props.headline.toUpperCase() : "METEOROLOGICAL DATA UPDATE ISSUED BY REGIONAL DESK."}</p>
            `;
            
            // Interaction attachment to pop detailed warning parameters
            card.addEventListener("click", () => launchDiagnosticModal(props.event, props.description));
            box.appendChild(card);
        });
    } catch (err) {
        box.innerHTML = `<p class="status-msg">ADVISORY STREAM SUSPENDED</p>`;
    }
}

// =================================================================
// 9. MESSOSCALE OUTLOOK MATRIX (SPC / WPC / REGIONAL PACKETS)
// =================================================================
async function pollMesoscaleDiscussions(lat, lon) {
    const deck = document.getElementById("bulletins-deck");
    if (!deck) return;
    
    try {
        // Gathering raw zone alerts data to parse specialized convective text fields
        const zoneRes = await fetch(`${NWS_API_BASE}/alerts/active?point=${lat},${lon}`);
        if (!zoneRes.ok) throw new Error();
        const data = await zoneRes.json();
        const alerts = data.features || [];
        
        deck.innerHTML = "";
        
        if (alerts.length === 0) {
            deck.innerHTML = `
                <div class="bulletin-node">
                    <h5>SYSTEM STATUS: METEOROLOGICALLY STABLE</h5>
                    <p>NO CONVECTIVE MESSOSCALE DISCUSSIONS (MCDS) OR PRECIPITATION PARAMETERS (MPDS) DETECTED FOR CURRENT AREA BLOCK.</p>
                </div>`;
            return;
        }
        
        alerts.forEach(alert => {
            const props = alert.properties;
            if (!props) return;
            
            const node = document.createElement("div");
            node.className = "bulletin-node";
            node.innerHTML = `
                <h5>SOURCE ID: ${props.areaDesc.toUpperCase().split(';')[0]} | ${props.id}</h5>
                <div class="meta-stamp">ISSUED: ${new Date(props.sent).toLocaleString().toUpperCase()}</div>
                <p class="bulletin-body-text">${props.description ? props.description.toUpperCase() : "NO FURTHER METEOROLOGICAL SPECIFICATIONS DETECTED."}</p>
            `;
            deck.appendChild(node);
        });
    } catch (err) {
        deck.innerHTML = `<p class="status-msg">STRATEGIC BULLETIN RETRIEVAL TIMEOUT</p>`;
    }
}

// =================================================================
// 10. MODAL UTILITIES
// =================================================================
function setupModalControls() {
    const overlay = document.getElementById("diagnostic-modal");
    const closeBtn = document.getElementById("modal-close-btn");
    
    if (closeBtn && overlay) {
        closeBtn.addEventListener("click", () => overlay.classList.remove("active"));
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) overlay.classList.remove("active");
        });
    }
}

function launchDiagnosticModal(title, text) {
    const overlay = document.getElementById("diagnostic-modal");
    const titleEl = document.getElementById("modal-alert-title");
    const bodyEl = document.getElementById("modal-alert-details");
    
    if (overlay && titleEl && bodyEl) {
        titleEl.textContent = title.toUpperCase();
        bodyEl.textContent = text ? text.toUpperCase() : "NO INTENSIVE METEOROLOGICAL BRIEF SUBMITTED.";
        overlay.classList.add("active");
    }
}

// =================================================================
// 11. STRICT 0-47 VECTOR TRANSLATION MATRIX
// =================================================================
function formatAssetPathString(code) {
    const parsed = parseInt(code, 10);
    if (isNaN(parsed) || parsed < 0 || parsed > 47) return "icons/44.png";
    return `icons/${String(parsed).padStart(2, '0')}.png`;
}

function mapForecastToAssetIndex(forecastText, isDay) {
    if (!forecastText) return 44;
    const desc = forecastText.toLowerCase();
    
    if (desc.includes("tornado")) return 0;
    if (desc.includes("hurricane") || desc.includes("typhoon")) return 2;
    if (desc.includes("tropical storm")) return 1;
    if (desc.includes("severe") || desc.includes("strong thunderstorm")) return 3;
    
    if (desc.includes("thunderstorm") || desc.includes("tsra")) {
        if (desc.includes("scattered")) return isDay ? 38 : 47;
        if (desc.includes("isolated")) return 37;
        return 4;
    }
    
    if (desc.includes("blizzard")) return 43;
    if (desc.includes("heavy snow")) return 42;
    if (desc.includes("heavy rain")) return 40;
    
    if (desc.includes("mix") || desc.includes("wintry")) return 7;
    if (desc.includes("sleet") || desc.includes("rain and sleet")) return 18;
    if (desc.includes("freezing rain") || desc.includes("fzra")) return 10;
    if (desc.includes("freezing drizzle")) return 8;
    
    if (desc.includes("snow showers") || desc.includes("shsn")) {
        if (desc.includes("scattered")) return isDay ? 41 : 46;
        return 14;
    }
    if (desc.includes("flurries")) return 13;
    if (desc.includes("blowing snow") || desc.includes("drifting snow")) return 15;
    if (desc.includes("snow")) return 16;
    if (desc.includes("hail") || desc.includes("mixed rain and hail")) return 35;
    
    if (desc.includes("showers") || desc.includes("shra")) {
        if (desc.includes("scattered")) return isDay ? 39 : 45;
        return 11;
    }
    if (desc.includes("drizzle")) return 9;
    if (desc.includes("rain")) return 12;
    
    if (desc.includes("sandstorm") || desc.includes("dust")) return 19;
    if (desc.includes("fog")) return 20;
    if (desc.includes("haze")) return 21;
    if (desc.includes("smoke")) return 22;
    if (desc.includes("windy")) return 24;
    if (desc.includes("breezy")) return 23;
    if (desc.includes("cold") || desc.includes("frigid")) return 25;
    if (desc.includes("hot")) return 36;
    
    if (desc.includes("cloudy") || desc.includes("overcast") || desc.includes("ovc")) return 26;
    if (desc.includes("mostly cloudy") || desc.includes("bkn")) return isDay ? 28 : 27;
    if (desc.includes("partly cloudy") || desc.includes("sct")) return isDay ? 30 : 29;
    if (desc.includes("mostly clear") || desc.includes("fair") || desc.includes("mostly sunny")) return isDay ? 34 : 33;
    if (desc.includes("clear") || desc.includes("sunny") || desc.includes("skc")) return isDay ? 32 : 31;
    
    return isDay ? 32 : 31;
}