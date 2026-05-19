// =================================================================
// 1. CONFIGURATION & STATE
// =================================================================
const NWS_API_BASE = "https://api.weather.gov";
let currentLat = 40.7128;
let currentLon = -74.0060;

// =================================================================
// 2. INITIALIZATION & EVENT LISTENERS
// =================================================================
document.addEventListener("DOMContentLoaded", () => {
    initApp();
    
    const searchBtn = document.querySelector(".search-box button, .search-bar button");
    const searchInput = document.querySelector(".search-box input, .search-bar input");
    
    if (searchBtn && searchInput) {
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
            
            const locationTitle = document.querySelector(".location-title, header h1, .search-bar input");
            if (locationTitle && locationTitle.tagName !== "INPUT") {
                locationTitle.textContent = data[0].display_name.split(',')[0];
            }
            
            await fetchWeatherData(currentLat, currentLon);
            await syncActiveWarnings(currentLat, currentLon);
        }
    } catch (err) {
        console.error("Geocoding failed:", err);
    }
}

// =================================================================
// 3. CORE DATA FETCHING
// =================================================================
async function fetchWeatherData(lat, lon) {
    try {
        const pointsRes = await fetch(`${NWS_API_BASE}/points/${lat},${lon}`);
        const pointsData = await pointsRes.json();
        
        const forecastUrl = pointsData.properties.forecast;
        const forecastHourlyUrl = pointsData.properties.forecastHourly;
        
        const [dailyRes, hourlyRes] = await Promise.all([
            fetch(forecastUrl),
            fetch(forecastHourlyUrl)
        ]);
        
        const dailyData = await dailyRes.json();
        const hourlyData = await hourlyRes.json();
        
        renderTodayDisplay(hourlyData.properties.periods[0], dailyData.properties.periods[0]);
        renderHourlyTimeline(hourlyData.properties.periods);
        renderDailyForecast(dailyData.properties.periods);
        
    } catch (err) {
        console.error("Failed to retrieve operational grid metrics:", err);
    }
}

// =================================================================
// 4. UI RENDER ENGINES
// =================================================================
function renderTodayDisplay(currentHourly, currentDaily) {
    const tempElement = document.querySelector(".today-temp, .main-temp, h1");
    if (tempElement) tempElement.textContent = `${currentHourly.temperature}°`;
    
    const conditionText = document.querySelector(".condition-text, .weather-desc");
    if (conditionText) conditionText.textContent = currentHourly.shortForecast;
    
    const mainIcon = document.querySelector(".main-weather-icon, .today-icon img, .current-icon img");
    if (mainIcon) {
        const iconCode = convertNwsUrlToYahooCode(currentHourly.icon);
        mainIcon.src = generateIconString(iconCode);
    }
    
    const hiLoElement = document.querySelector(".hi-lo, .temp-range");
    if (hiLoElement && currentDaily) {
        hiLoElement.textContent = `H: ${currentDaily.temperature}° L: --°`;
    }
    
    updateMetricValue("Dewpoint", `${currentHourly.dewpoint?.value ? Math.round(currentHourly.dewpoint.value * 9/5 + 32) : '--'}°F`);
    updateMetricValue("Relative Humidity", `${currentHourly.relativeHumidity?.value || '--'}%`);
    updateMetricValue("Wind Velocity", `${currentHourly.windSpeed || '--'}`);
    updateMetricValue("Apparent Temperature", `${currentHourly.temperature}°F`);
}

function renderHourlyTimeline(periods) {
    const container = document.getElementById("hourly-container") || document.querySelector(".hourly-timeline, .timeline-scroll");
    if (!container) return;
    
    container.innerHTML = ""; 
    const track24h = periods.slice(0, 24);
    
    track24h.forEach(hour => {
        const card = document.createElement("div");
        card.className = "hourly-card"; 
        
        const timeStr = new Date(hour.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const iconCode = convertNwsUrlToYahooCode(hour.icon);
        const iconPath = generateIconString(iconCode);
        
        card.innerHTML = `
            <span class="time">${timeStr}</span>
            <img src="${iconPath}" alt="${hour.shortForecast}" class="timeline-icon" />
            <span class="temp">${hour.temperature}°</span>
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
            <img src="${iconPath}" alt="${period.shortForecast}" class="row-icon" />
            <span class="row-temp">${period.temperature}°</span>
            <span class="row-desc">${period.shortForecast}</span>
        `;
        container.appendChild(row);
    });
}

function updateMetricValue(labelName, value) {
    const rows = document.querySelectorAll(".metric-row, .atmospheric-metrics div");
    rows.forEach(row => {
        if (row.textContent.includes(labelName)) {
            const valSpan = row.querySelector("span:last-child, .value");
            if (valSpan) valSpan.textContent = value;
        }
    });
}

// =================================================================
// 5. FIXED ASSET PIPELINE (0-47 MATCHING ENGINE)
// =================================================================
function generateIconString(code) {
    const parsed = parseInt(code, 10);
    if (isNaN(parsed) || parsed < 0 || parsed > 47) return "icons/na.png";
    return `icons/${String(parsed).padStart(2, '0')}.png`;
}

function convertNwsUrlToYahooCode(url) {
    if (!url) return 32; // Default to sunny day
    const str = url.toLowerCase();
    const isNight = str.includes("/night/") || str.includes("night");
    
    // Convective / Severe
    if (str.includes("tornado")) return 0;
    if (str.includes("tsra") || str.includes("thunderstorm")) return 4;
    
    // Winter Solid/Mixed
    if (str.includes("blizzard")) return 43;
    if (str.includes("snow")) return 16;
    if (str.includes("fzra") || str.includes("sleet")) return 18;
    
    // Liquid Precipitation
    if (str.includes("rain") || str.includes("shra") || str.includes("hi_shwrs")) return 11;
    if (str.includes("drizzle")) return 9;
    
    // Obscurations & Wind
    if (str.includes("fog")) return 20;
    if (str.includes("haze")) return 21;
    if (str.includes("smoke")) return 22;
    if (str.includes("wind")) return 24;
    
    // Cloud Cover Hierarchy matching your 0-47 structure precisely
    if (str.includes("ovc") || str.includes("cloudy")) return 26; // Plain Cloud
    if (str.includes("bkn")) return isNight ? 27 : 28;             // Mostly Cloudy (Moon vs Sun)
    if (str.includes("sct") || str.includes("partly")) return isNight ? 29 : 30; // Partly Cloudy (Moon vs Sun)
    if (str.includes("few")) return isNight ? 33 : 34;             // Fair/Mainly Clear
    if (str.includes("skc") || str.includes("clear") || str.includes("sunny")) return isNight ? 31 : 32; // Moon vs Sun
    
    return isNight ? 31 : 32;
}

function getWmoPhraseString(code) {
    const c = parseInt(code, 10);
    if (c === 0) return "Tornado";
    if (c === 3 || c === 4) return "Thunderstorms";
    if (c === 9) return "Drizzle";
    if (c === 11 || c === 12) return "Rain Showers";
    if (c === 16) return "Snow";
    if (c === 18) return "Sleet";
    if (c === 20) return "Foggy";
    if (c === 24) return "Windy";
    if (c === 26) return "Cloudy";
    if (c === 27 || c === 28) return "Mostly Cloudy";
    if (c === 29 || c === 30) return "Partly Cloudy";
    if (c === 31 || c === 32) return "Clear Skies";
    if (c === 33 || c === 34) return "Fair";
    return "Clear";
}

// =================================================================
// 6. ADVISORY AND WARNING CONTEXT ENGINE
// =================================================================
async function syncActiveWarnings(lat, lon) {
    const box = document.getElementById("alerts-container") || document.querySelector(".alerts-box, .bulletin-card");
    if (!box) return;
    
    try {
        const res = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`);
        const data = await res.json();
        const list = data.features || [];
        
        if (list.length === 0) {
            box.innerHTML = `<p class="status-msg">No active hazards or convective warnings tracked for this operational area.</p>`;
            return;
        }
        
        box.innerHTML = "";
        list.forEach(item => {
            const p = item.properties;
            const div = document.createElement("div");
            div.className = "alert-bulletin-card";
            div.innerHTML = `
                <h4>${p.event}</h4>
                <p>${p.headline || "Product text generated by regional office data stream."}</p>
            `;
            box.appendChild(div);
        });
    } catch (err) {
        box.innerHTML = `<p class="status-msg">Error sync-tracking regional hazard bulletins.</p>`;
    }
}
