// =================================================================
// 1. CONFIGURATION & STATE (Default locked to NE Illinois)
// =================================================================
const NWS_API_BASE = "https://api.weather.gov";
let currentLat = 42.0451; 
let currentLon = -87.6877; 

// Safe DOM utility to prevent script crashes if a class name changes
const updateDOM = (selector, property, value) => {
    const el = document.querySelector(selector);
    if (el) el[property] = value;
};

// =================================================================
// 2. INITIALIZATION & SAFED EVENT LOOP
// =================================================================
document.addEventListener("DOMContentLoaded", () => {
    initApp();
    
    const searchBtn = document.querySelector(".search-box button, .search-bar button");
    const searchInput = document.querySelector(".search-box input, .search-bar input");
    
    if (searchBtn && searchInput) {
        searchBtn.style.cursor = "pointer";
        searchBtn.addEventListener("click", () => handleSearch(searchInput.value));
        searchInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") handleSearch(searchInput.value);
        });
    }
});

async function initApp() {
    await fetchWeatherData(currentLat, currentLon);
    await syncActiveWarnings(currentLat, currentLon);
}

async function handleSearch(query) {
    if (!query) return;
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data && data.length > 0) {
            currentLat = parseFloat(data[0].lat);
            currentLon = parseFloat(data[0].lon);
            
            const locationTitle = document.querySelector(".location-title, header h1");
            if (locationTitle) locationTitle.textContent = data[0].display_name.split(',')[0];
            
            await fetchWeatherData(currentLat, currentLon);
            await syncActiveWarnings(currentLat, currentLon);
        }
    } catch (err) {
        console.error("Geocoding fetch interrupted:", err);
    }
}

// =================================================================
// 3. FAULT-TOLERANT DATA ACQUISITION
// =================================================================
async function fetchWeatherData(lat, lon) {
    try {
        const pointsRes = await fetch(`${NWS_API_BASE}/points/${lat},${lon}`);
        if (!pointsRes.ok) throw new Error("Grid point telemetry rejected");
        const pointsData = await pointsRes.json();
        
        const forecastUrl = pointsData.properties.forecast;
        const forecastHourlyUrl = pointsData.properties.forecastHourly;
        
        const [dailyRes, hourlyRes] = await Promise.all([
            fetch(forecastUrl),
            fetch(forecastHourlyUrl)
        ]);
        
        if (!dailyRes.ok || !hourlyRes.ok) throw new Error("Operational forecast streams offline");
        
        const dailyData = await dailyRes.json();
        const hourlyData = await hourlyRes.json();
        
        renderTodayDisplay(hourlyData.properties.periods[0], dailyData.properties.periods[0]);
        renderHourlyTimeline(hourlyData.properties.periods);
        renderDailyForecast(dailyData.properties.periods);
        
    } catch (err) {
        console.error("Critical stream failure:", err);
        updateDOM(".condition-text", "textContent", "Data stream connection delayed.");
    }
}

// =================================================================
// 4. CLEAN UI RENDER ENGINES (ZERO EMOJIS)
// =================================================================
function renderTodayDisplay(currentHourly, currentDaily) {
    if (!currentHourly) return;
    
    updateDOM(".today-temp, .main-temp", "textContent", `${currentHourly.temperature} degrees`);
    updateDOM(".condition-text, .weather-desc", "textContent", currentHourly.shortForecast);
    
    const mainIcon = document.querySelector(".main-weather-icon, .today-icon img, .current-icon img");
    if (mainIcon) {
        const iconCode = convertNwsUrlToYahooCode(currentHourly.icon);
        mainIcon.src = generateIconString(iconCode);
    }
    
    if (currentDaily) {
        updateDOM(".hi-lo, .temp-range", "textContent", `High: ${currentDaily.temperature} degrees`);
    }
    
    // Atmospheric Metrics Card Layouts
    updateMetricValue("Dewpoint", `${currentHourly.dewpoint?.value ? Math.round(currentHourly.dewpoint.value * 9/5 + 32) : "--"} F`);
    updateMetricValue("Relative Humidity", `${currentHourly.relativeHumidity?.value || "--"}%`);
    updateMetricValue("Wind Velocity", `${currentHourly.windSpeed || "--"}`);
    updateMetricValue("Apparent Temperature", `${currentHourly.temperature} F`);
}

function renderHourlyTimeline(periods) {
    const container = document.getElementById("hourly-container") || document.querySelector(".hourly-timeline, .timeline-scroll");
    if (!container) return;
    
    container.innerHTML = ""; 
    const track24h = periods.slice(0, 24);
    
    track24h.forEach(hour => {
        const card = document.createElement("div");
        card.className = "hourly-card"; 
        
        const timeStr = new Date(hour.startTime).toLocaleTimeString([], { hour: '2-digit' });
        const iconCode = convertNwsUrlToYahooCode(hour.icon);
        const iconPath = generateIconString(iconCode);
        
        card.innerHTML = `
            <span class="time">${timeStr}</span>
            <img src="${iconPath}" alt="Weather condition visual" class="timeline-icon" />
            <span class="temp">${hour.temperature}</span>
        `;
        container.appendChild(card);
    });
}

function renderDailyForecast(periods) {
    const container = document.getElementById("daily-container") || document.querySelector(".daily-forecast, .forecast-list");
    if (!container) return;
    
    container.innerHTML = ""; 
    
    periods.forEach(period => {
        const row = document.createElement("div");
        row.className = "forecast-row";
        
        const iconCode = convertNwsUrlToYahooCode(period.icon);
        const iconPath = generateIconString(iconCode);
        
        row.innerHTML = `
            <span class="day-name">${period.name}</span>
            <img src="${iconPath}" alt="Forecast visual representation" class="row-icon" />
            <span class="row-temp">${period.temperature}</span>
            <span class="row-desc">${period.shortForecast}</span>
        `;
        container.appendChild(row);
    });
}

function updateMetricValue(labelName, value) {
    const rows = document.querySelectorAll(".metric-row, .atmospheric-metrics div");
    rows.forEach(row => {
        if (row.textContent.toLowerCase().includes(labelName.toLowerCase())) {
            const valSpan = row.querySelector("span:last-child, .value");
            if (valSpan) valSpan.textContent = value;
        }
    });
}

// =================================================================
// 5. ASSET ALIGNMENT PIPELINE (Yahoo 0-47 Framework Mapping)
// =================================================================
function generateIconString(code) {
    const parsed = parseInt(code, 10);
    if (isNaN(parsed) || parsed < 0 || parsed > 47) return "icons/na.png";
    return `icons/${String(parsed).padStart(2, '0')}.png`;
}

function convertNwsUrlToYahooCode(url) {
    if (!url) return 32; 
    const str = url.toLowerCase();
    const isNight = str.includes("/night/") || str.includes("night");
    
    if (str.includes("tornado")) return 0;
    if (str.includes("tsra") || str.includes("thunderstorm") || str.includes("scttsra")) return 4;
    if (str.includes("blizzard")) return 43;
    if (str.includes("snow")) return 16;
    if (str.includes("fzra") || str.includes("sleet") || str.includes("mix")) return 18;
    if (str.includes("rain") || str.includes("shra") || str.includes("hi_shwrs")) return 11;
    if (str.includes("drizzle")) return 9;
    if (str.includes("fog")) return 20;
    if (str.includes("haze")) return 21;
    if (str.includes("smoke")) return 22;
    if (str.includes("wind")) return 24;
    
    if (str.includes("ovc") || str.includes("cloudy")) return 26; 
    if (str.includes("bkn")) return isNight ? 27 : 28;             
    if (str.includes("sct") || str.includes("partly")) return isNight ? 29 : 30; 
    if (str.includes("few")) return isNight ? 33 : 34;             
    if (str.includes("skc") || str.includes("clear") || str.includes("sunny")) return isNight ? 31 : 32; 
    
    return isNight ? 31 : 32;
}

// =================================================================
// 6. ADVISORY CONTEXT PIPELINE
// =================================================================
async function syncActiveWarnings(lat, lon) {
    const box = document.getElementById("alerts-container") || document.querySelector(".alerts-box, .bulletin-card");
    if (!box) return;
    
    try {
        const res = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`);
        const data = await res.json();
        const list = data.features || [];
        
        if (list.length === 0) {
            box.innerHTML = `<p class="status-msg">No active atmospheric warnings or hazards tracked for this sector.</p>`;
            return;
        }
        
        box.innerHTML = "";
        list.forEach(item => {
            const p = item.properties;
            const div = document.createElement("div");
            div.className = "alert-bulletin-card";
            div.innerHTML = `
                <h4>${p.event}</h4>
                <p>${p.headline || "Product text issued by regional forecasting desk."}</p>
            `;
            box.appendChild(div);
        });
    } catch (err) {
        box.innerHTML = `<p class="status-msg">Advisory synchronization suspended.</p>`;
    }
}
