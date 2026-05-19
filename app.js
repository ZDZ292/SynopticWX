// =================================================================
// 1. STATE PROPERTIES & AREA DATA ANCHOR
// =================================================================
const NWS_API_BASE = "https://api.weather.gov";
let currentLat = 42.0451; // Locked to Chicago-Evanston Sector Coordinates
let currentLon = -87.6877;

// =================================================================
// 2. RUNTIME EVENT LOOPS
// =================================================================
document.addEventListener("DOMContentLoaded", () => {
    initializeDashboard();
    setupActionListeners();
});

async function initializeDashboard() {
    await fetchMeteorologicalFeeds(currentLat, currentLon);
    await syncActiveConvectiveAlerts(currentLat, currentLon);
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
// 3. GEOCODING AND POSITION INTEGRATION
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
                titleEl.textContent = data[0].display_name.split(',')[0];
            }
            
            await initializeDashboard();
        }
    } catch (err) {
        console.error("Geocoding validation interrupted:", err);
    }
}

// =================================================================
// 4. TELEMETRY STREAM INGESTION ENGINE
// =================================================================
async function fetchMeteorologicalFeeds(lat, lon) {
    try {
        const pointsRes = await fetch(`${NWS_API_BASE}/points/${lat},${lon}`);
        if (!pointsRes.ok) throw new Error("Operational grid target rejected");
        const pointsData = await pointsRes.json();
        
        const forecastDailyUrl = pointsData?.properties?.forecast;
        const forecastHourlyUrl = pointsData?.properties?.forecastHourly;
        
        if (!forecastDailyUrl || !forecastHourlyUrl) throw new Error("Grid stream links unavailable");
        
        const [dailyRes, hourlyRes] = await Promise.all([
            fetch(forecastDailyUrl),
            fetch(forecastHourlyUrl)
        ]);
        
        if (!dailyRes.ok || !hourlyRes.ok) throw new Error("Product delivery streams offline");
        
        const dailyData = await dailyRes.json();
        const hourlyData = await hourlyRes.json();
        
        const hourlyPeriods = hourlyData?.properties?.periods;
        const dailyPeriods = dailyData?.properties?.periods;
        
        if (!hourlyPeriods || !dailyPeriods) throw new Error("Data parse fault");
        
        renderPrimaryWorkspace(hourlyPeriods[0], dailyPeriods[0]);
        renderHourlyTimeline(hourlyPeriods);
        renderDailyForecast(dailyPeriods);
        
    } catch (err) {
        console.error("Data pipeline fault. Fallback engaged:", err);
        const conditionTxt = document.querySelector(".condition-text");
        if (conditionTxt) conditionTxt.textContent = "Data feed transmission delayed";
    }
}

// =================================================================
// 5. DATA INJECTION & RENDERING (ZERO EMOJIS)
// =================================================================
function renderPrimaryWorkspace(currentHourly, currentDaily) {
    if (!currentHourly) return;
    
    const tempEl = document.querySelector(".main-temp");
    const condEl = document.querySelector(".condition-text");
    const hiLoEl = document.querySelector(".hi-lo");
    const mainIcon = document.querySelector(".main-weather-icon");
    
    if (tempEl) tempEl.textContent = `${currentHourly.temperature}°`;
    if (condEl) condEl.textContent = currentHourly.shortForecast;
    if (hiLoEl && currentDaily) hiLoEl.textContent = `High: ${currentDaily.temperature}°`;
    
    if (mainIcon && currentHourly.icon) {
        const assignedCode = mapForecastToAssetIndex(currentHourly.shortForecast, currentHourly.isDaytime);
        mainIcon.src = formatAssetPathString(assignedCode);
    }
    
    // Core Parameters Parsing
    const dpVal = currentHourly.dewpoint?.value ? `${Math.round(currentHourly.dewpoint.value * 9/5 + 32)}°F` : "--";
    const rhVal = currentHourly.relativeHumidity?.value ? `${currentHourly.relativeHumidity.value}%` : "--";
    const windVal = currentHourly.windSpeed ? `${currentHourly.windDirection || ""} ${currentHourly.windSpeed}` : "--";
    
    const dpEl = document.getElementById("metric-dewpoint");
    const rhEl = document.getElementById("metric-humidity");
    const windEl = document.getElementById("metric-wind");
    const appEl = document.getElementById("metric-apparent");
    
    if (dpEl) dpEl.textContent = dpVal;
    if (rhEl) rhEl.textContent = rhVal;
    if (windEl) windEl.textContent = windVal;
    if (appEl) appEl.textContent = `${currentHourly.temperature}°F`;
}

function renderHourlyTimeline(periods) {
    const container = document.getElementById("hourly-container");
    if (!container || !periods) return;
    
    container.innerHTML = "";
    const leading24Hours = periods.slice(0, 24);
    
    leading24Hours.forEach(hour => {
        const card = document.createElement("div");
        card.className = "hourly-card";
        
        const timeFormatted = new Date(hour.startTime).toLocaleTimeString([], { hour: '2-digit' });
        const iconIndex = mapForecastToAssetIndex(hour.shortForecast, hour.isDaytime);
        
        card.innerHTML = `
            <span class="time">${timeFormatted}</span>
            <img src="${formatAssetPathString(iconIndex)}" alt="Timeline icon" class="timeline-icon" />
            <span class="temp">${hour.temperature}°</span>
        `;
        container.appendChild(card);
    });
}

function renderDailyForecast(periods) {
    const container = document.getElementById("daily-container");
    if (!container || !periods) return;
    
    container.innerHTML = "";
    
    periods.forEach(period => {
        const row = document.createElement("div");
        row.className = "forecast-row";
        
        const iconIndex = mapForecastToAssetIndex(period.shortForecast, period.isDaytime);
        
        row.innerHTML = `
            <span class="day-name">${period.name}</span>
            <img src="${formatAssetPathString(iconIndex)}" alt="Forecast icon" class="row-icon" />
            <span class="row-temp">${period.temperature}°</span>
            <span class="row-desc">${period.shortForecast}</span>
        `;
        container.appendChild(row);
    });
}

// =================================================================
// 6. STRICT INTERPRETATION PIPELINE (0-47 Asset Allocation Matrix)
// =================================================================
function formatAssetPathString(code) {
    const parsed = parseInt(code, 10);
    if (isNaN(parsed) || parsed < 0 || parsed > 47) return "icons/44.png";
    return `icons/${String(parsed).padStart(2, '0')}.png`;
}

function mapForecastToAssetIndex(forecastText, isDay) {
    if (!forecastText) return 44;
    const desc = forecastText.toLowerCase();
    
    // Convective Systems & Severe
    if (desc.includes("tornado")) return 0;
    if (desc.includes("hurricane") || desc.includes("typhoon")) return 2;
    if (desc.includes("tropical storm")) return 1;
    if (desc.includes("severe") || desc.includes("strong thunderstorm")) return 3;
    
    // Thunderstorm Core Variations
    if (desc.includes("thunderstorm") || desc.includes("tsra")) {
        if (desc.includes("scattered")) return isDay ? 38 : 47;
        if (desc.includes("isolated")) return 37;
        return 4;
    }
    
    // Solid Transitions / Winter Mixes
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
    
    // Liquid Conditions
    if (desc.includes("showers") || desc.includes("shra")) {
        if (desc.includes("scattered")) return isDay ? 39 : 45;
        return 11;
    }
    if (desc.includes("drizzle")) return 9;
    if (desc.includes("rain")) return 12;
    
    // Atmospheric Obstructions & Dynamics
    if (desc.includes("sandstorm") || desc.includes("dust")) return 19;
    if (desc.includes("fog")) return 20;
    if (desc.includes("haze")) return 21;
    if (desc.includes("smoke")) return 22;
    if (desc.includes("windy")) return 24;
    if (desc.includes("breezy")) return 23;
    if (desc.includes("cold") || desc.includes("frigid")) return 25;
    if (desc.includes("hot")) return 36;
    
    // Cloud Profiling Tiers
    if (desc.includes("cloudy") || desc.includes("overcast") || desc.includes("ovc")) return 26;
    if (desc.includes("mostly cloudy") || desc.includes("bkn")) return isDay ? 28 : 27;
    if (desc.includes("partly cloudy") || desc.includes("sct")) return isDay ? 30 : 29;
    if (desc.includes("mostly clear") || desc.includes("fair") || desc.includes("mostly sunny")) return isDay ? 34 : 33;
    if (desc.includes("clear") || desc.includes("sunny") || desc.includes("skc")) return isDay ? 32 : 31;
    
    return isDay ? 32 : 31;
}

// =================================================================
// 7. REGIONAL CONVECTIVE WARNING SYSTEMS
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
            box.innerHTML = `<p class="status-msg">No active atmospheric hazards tracked for this station area.</p>`;
            return;
        }
        
        box.innerHTML = "";
        features.forEach(item => {
            const props = item.properties;
            if (!props) return;
            const card = document.createElement("div");
            card.className = "alert-bulletin-card";
            card.innerHTML = `
                <h4>${props.event || "Meteorological Advisory"}</h4>
                <p>${props.headline || "Product output initialized by tactical forecasting center."}</p>
            `;
            box.appendChild(card);
        });
    } catch (err) {
        box.innerHTML = `<p class="status-msg">Advisory data stream interrupted.</p>`;
    }
}