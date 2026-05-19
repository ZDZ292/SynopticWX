// =================================================================
// 1. GLOBAL CORE CONFIGURATION & LOCAL SECTOR LOCK
// =================================================================
const NWS_API_BASE = "https://api.weather.gov";
let currentLat = 42.0451;  // Default locked to Evanston/Chicagoland Area
let currentLon = -87.6877;

// Exception-safe DOM injection container to ensure zero script-freeze crashes
const safeSetText = (selector, text) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = text;
};

// =================================================================
// 2. INITIALIZATION ENGINE & EVENT BINDINGS
// =================================================================
document.addEventListener("DOMContentLoaded", () => {
    initializeDashboard();
    setupInterfaceControls();
});

async function initializeDashboard() {
    await fetchOperationalMetrics(currentLat, currentLon);
    await syncRegionalHazards(currentLat, currentLon);
}

function setupInterfaceControls() {
    const searchBtn = document.querySelector(".search-box button, .search-bar button, #searchBtn");
    const searchInput = document.querySelector(".search-box input, .search-bar input, #searchInput");
    
    if (searchBtn && searchInput) {
        searchBtn.addEventListener("click", () => triggerSearchPipeline(searchInput.value));
        searchInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") triggerSearchPipeline(searchInput.value);
        });
    }
}

async function triggerSearchPipeline(query) {
    if (!query) return;
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        if (!response.ok) return;
        const data = await response.json();
        
        if (data && data.length > 0) {
            currentLat = parseFloat(data[0].lat);
            currentLon = parseFloat(data[0].lon);
            
            const titleElement = document.querySelector(".location-title, header h1, .current-location");
            if (titleElement) titleElement.textContent = data[0].display_name.split(',')[0];
            
            await initializeDashboard();
        }
    } catch (err) {
        console.error("Geocoding resolution interrupted:", err);
    }
}

// =================================================================
// 3. FAULT-TOLERANT NWS STREAM AGGREGATION
// =================================================================
async function fetchOperationalMetrics(lat, lon) {
    try {
        const pointsResponse = await fetch(`${NWS_API_BASE}/points/${lat},${lon}`);
        if (!pointsResponse.ok) throw new Error("Grid point telemetry unresolvable");
        const pointsData = await pointsResponse.json();
        
        const dailyUrl = pointsData?.properties?.forecast;
        const hourlyUrl = pointsData?.properties?.forecastHourly;
        
        if (!dailyUrl || !hourlyUrl) throw new Error("Operational endpoint links absent");
        
        const [dailyRes, hourlyRes] = await Promise.all([
            fetch(dailyUrl),
            fetch(hourlyUrl)
        ]);
        
        if (!dailyRes.ok || !hourlyRes.ok) throw new Error("Forecast ingestion stream failure");
        
        const dailyData = await dailyRes.json();
        const hourlyData = await hourlyRes.json();
        
        const hourlyPeriods = hourlyData?.properties?.periods;
        const dailyPeriods = dailyData?.properties?.periods;
        
        if (!hourlyPeriods || !dailyPeriods) throw new Error("Malformed data structure");
        
        renderPrimaryDisplay(hourlyPeriods[0], dailyPeriods[0]);
        renderHourlyTimeline(hourlyPeriods);
        renderDailyForecast(dailyPeriods);
        
    } catch (err) {
        console.error("Telemetry stream broken. Safe fallback active:", err);
        safeSetText(".condition-text", "Data feed temporarily offline");
    }
}

// =================================================================
// 4. CLEAN DATA RENDERING PIPELINES (ZERO EMOJIS)
// =================================================================
function renderPrimaryDisplay(currentHourly, currentDaily) {
    if (!currentHourly) return;
    
    safeSetText(".today-temp, .main-temp, .current-temp", `${currentHourly.temperature} degrees`);
    safeSetText(".condition-text, .weather-desc", currentHourly.shortForecast);
    
    const mainIcon = document.querySelector(".main-weather-icon, .today-icon img, .current-icon img");
    if (mainIcon && currentHourly.icon) {
        const mappedCode = parseNwsUrlToAssetIndex(currentHourly.icon);
        mainIcon.src = generateLocalAssetPath(mappedCode);
    }
    
    if (currentDaily) {
        safeSetText(".hi-lo, .temp-range, .high-low", `High: ${currentDaily.temperature} degrees`);
    }
    
    // Safely update atmospheric parameters table blocks
    populateMetricCard("Dewpoint", currentHourly.dewpoint?.value ? `${Math.round(currentHourly.dewpoint.value * 9/5 + 32)} F` : "--");
    populateMetricCard("Humidity", currentHourly.relativeHumidity?.value ? `${currentHourly.relativeHumidity.value}%` : "--");
    populateMetricCard("Wind", currentHourly.windSpeed || "--");
    populateMetricCard("Apparent", `${currentHourly.temperature} F`);
}

function renderHourlyTimeline(periods) {
    const scrollContainer = document.getElementById("hourly-container") || document.querySelector(".hourly-timeline, .timeline-scroll");
    if (!scrollContainer || !periods) return;
    
    scrollContainer.innerHTML = "";
    const primaryDayHours = periods.slice(0, 24);
    
    primaryDayHours.forEach(hour => {
        const block = document.createElement("div");
        block.className = "hourly-card";
        
        const formattedTime = hour.startTime ? new Date(hour.startTime).toLocaleTimeString([], { hour: '2-digit' }) : "--";
        const assetIndex = parseNwsUrlToAssetIndex(hour.icon);
        const imgPath = generateLocalAssetPath(assetIndex);
        
        block.innerHTML = `
            <span class="time">${formattedTime}</span>
            <img src="${imgPath}" alt="Condition indicator" class="timeline-icon" />
            <span class="temp">${hour.temperature}</span>
        `;
        scrollContainer.appendChild(block);
    });
}

function renderDailyForecast(periods) {
    const listContainer = document.getElementById("daily-container") || document.querySelector(".daily-forecast, .forecast-list");
    if (!listContainer || !periods) return;
    
    listContainer.innerHTML = "";
    const weeklyForecastPeriods = periods.slice(0, 10);
    
    weeklyForecastPeriods.forEach(period => {
        const row = document.createElement("div");
        row.className = "forecast-row";
        
        const assetIndex = parseNwsUrlToAssetIndex(period.icon);
        const imgPath = generateLocalAssetPath(assetIndex);
        
        row.innerHTML = `
            <span class="day-name">${period.name || "Forecast"}</span>
            <img src="${imgPath}" alt="Forecast graphic" class="row-icon" />
            <span class="row-temp">${period.temperature}</span>
            <span class="row-desc">${period.shortForecast || ""}</span>
        `;
        listContainer.appendChild(row);
    });
}

function populateMetricCard(label, value) {
    const rows = document.querySelectorAll(".metric-row, .atmospheric-metrics div, .detail-item");
    rows.forEach(row => {
        if (row.textContent.toLowerCase().includes(label.toLowerCase())) {
            const targetSpan = row.querySelector("span:last-child, .value, p");
            if (targetSpan) targetSpan.textContent = value;
        }
    });
}

// =================================================================
// 5. ASSET TRANSFERENCE MANAGER (Yahoo 0-47 Matrix Alignment)
// =================================================================
function generateLocalAssetPath(code) {
    const numericCode = parseInt(code, 10);
    if (isNaN(numericCode) || numericCode < 0 || numericCode > 47) return "icons/na.png";
    return `icons/${String(numericCode).padStart(2, '0')}.png`;
}

function parseNwsUrlToAssetIndex(url) {
    if (!url) return 32; 
    const addressString = url.toLowerCase();
    const isNight = addressString.includes("/night/") || addressString.includes("night");
    
    // Convective / Severe Outbreaks
    if (addressString.includes("tornado")) return 0;
    if (addressString.includes("tsra") || addressString.includes("thunderstorm") || addressString.includes("scttsra")) return 4;
    
    // Solid & Freezing Phases
    if (addressString.includes("blizzard")) return 43;
    if (addressString.includes("snow")) return 16;
    if (addressString.includes("fzra") || addressString.includes("sleet") || addressString.includes("mix")) return 18;
    
    // Liquid Conditions
    if (addressString.includes("rain") || addressString.includes("shra") || addressString.includes("hi_shwrs")) return 11;
    if (addressString.includes("drizzle")) return 9;
    
    // Suspended Particles & Wind
    if (addressString.includes("fog")) return 20;
    if (addressString.includes("haze")) return 21;
    if (addressString.includes("smoke")) return 22;
    if (addressString.includes("wind")) return 24;
    
    // Sky Cover Scale Mapping Parameters
    if (addressString.includes("ovc") || addressString.includes("cloudy")) return 26;
    if (addressString.includes("bkn")) return isNight ? 27 : 28;
    if (addressString.includes("sct") || addressString.includes("partly")) return isNight ? 29 : 30;
    if (addressString.includes("few")) return isNight ? 33 : 34;
    if (addressString.includes("skc") || addressString.includes("clear") || addressString.includes("sunny")) return isNight ? 31 : 32;
    
    return isNight ? 31 : 32;
}

// =================================================================
// 6. ADVISORY & HAZARD WARNING ENGINE
// =================================================================
async function syncRegionalHazards(lat, lon) {
    const hazardContainer = document.getElementById("alerts-container") || document.querySelector(".alerts-box, .bulletin-card");
    if (!hazardContainer) return;
    
    try {
        const response = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`);
        if (!response.ok) throw new Error();
        const data = await response.json();
        const warningsList = data.features || [];
        
        if (warningsList.length === 0) {
            hazardContainer.innerHTML = `<p class="status-msg">No active weather hazards or convective warnings tracked for this sector.</p>`;
            return;
        }
        
        hazardContainer.innerHTML = "";
        warningsList.forEach(alert => {
            const properties = alert.properties;
            if (!properties) return;
            const card = document.createElement("div");
            card.className = "alert-bulletin-card";
            card.innerHTML = `
                <h4>${properties.event || "Weather Hazard Alert"}</h4>
                <p>${properties.headline || "Meteorological data update issued by regional forecast center."}</p>
            `;
            hazardContainer.appendChild(card);
        });
    } catch (err) {
        hazardContainer.innerHTML = `<p class="status-msg">Alert integration offline.</p>`;
    }
}
