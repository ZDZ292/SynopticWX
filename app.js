// Base coordinate initialization parameter (Default: Evanston, IL)
let activeCoordinates = "42.0451,-87.6877"; 

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("location-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleSearch();
    });
    executeDataPipeline();
});

function switchSection(targetId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.querySelectorAll('.section-pill').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    document.getElementById(targetId).classList.add('active-view');
    
    // Cross-bind navigation triggers
    const pillBtn = document.querySelector(`.section-pill[onclick*="${targetId}"]`);
    if (pillBtn) pillBtn.classList.add('active');
    
    const navBtn = document.querySelector(`.nav-item[onclick*="${targetId}"]`);
    if (navBtn) navBtn.classList.add('active');
}

async function handleSearch() {
    const query = document.getElementById("location-input").value.trim();
    if (!query) return;

    document.getElementById("obs-phrase").innerText = "Querying global stations...";
    
    try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`);
        const payload = await res.json();

        if (!payload.results || payload.results.length === 0) {
            document.getElementById("obs-phrase").innerText = "Unknown location coordinates.";
            return;
        }

        const primaryMatch = payload.results[0];
        activeCoordinates = `${primaryMatch.latitude.toFixed(4)},${primaryMatch.longitude.toFixed(4)}`;
        document.getElementById("location-input").placeholder = primaryMatch.name;
        document.getElementById("location-input").value = "";
        
        executeDataPipeline();
    } catch (err) {
        document.getElementById("obs-phrase").innerText = "Geocoding network stream broke.";
    }
}

function executeDataPipeline() {
    const lat = activeCoordinates.split(',')[0];
    const lon = activeCoordinates.split(',')[1];
    
    // Fix NWS 404 Radar breakdown using standard, stable interactive tile map frames
    document.getElementById("radar-frame").src = `https://maps.weather.gov/rcm/index.html?zoom=8&lat=${lat}&lon=${lon}`;

    fetchOpenMeteoTelemetry(lat, lon);
    compileSPCOutlooks(lat, lon);
}

async function fetchOpenMeteoTelemetry(lat, lon) {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,dew_point_2m&hourly=temperature_2m,weather_code,probability_of_precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timeformat=unixtime&timezone=auto`;
        const res = await fetch(url);
        const data = await res.json();

        processCurrentSnapshot(data.current);
        processTimelineArrays(data.hourly, data.daily);
    } catch (err) {
        document.getElementById("obs-phrase").innerText = "Telemetry terminal handshake failed.";
    }
}

function processCurrentSnapshot(c) {
    const tempVal = Math.round(c.temperature_2m);
    const feelsVal = Math.round(c.apparent_temperature);
    const dewVal = Math.round(c.dew_point_2m);
    const description = translateWMOCodeToText(c.weather_code);

    document.getElementById("obs-temp").innerText = `${tempVal}°`;
    document.getElementById("obs-feels").innerText = `Feels like ${feelsVal}°`;
    document.getElementById("obs-wind").innerText = `${Math.round(c.wind_speed_10m)} mph`;
    document.getElementById("obs-humidity").innerText = `${Math.round(c.relative_humidity_2m)}%`;
    document.getElementById("obs-dewpoint").innerText = `${dewVal}°F`;
    document.getElementById("obs-heat").innerText = `${feelsVal}°F`;
    document.getElementById("obs-rain-val").innerText = `${c.precipitation.toFixed(2)} in`;
    document.getElementById("obs-phrase").innerText = description;
    
    // Map directly to corrected, live animated SVGs
    document.getElementById("current-weather-icon").src = mapTextToWeatherCompanyIcon(description);
}

function processTimelineArrays(hourly, daily) {
    const scroller = document.getElementById("hourly-scroller");
    scroller.innerHTML = "";
    
    document.getElementById("obs-rain-chance").innerText = `${hourly.probability_of_precipitation[0] || 0}%`;

    // Process 24-Hour Timeline Elements
    for (let i = 0; i < 24; i++) {
        const timeLabel = new Date(hourly.time[i] * 1000).toLocaleTimeString([], { hour: '2-digit' });
        const conditionText = translateWMOCodeToText(hourly.weather_code[i]);
        scroller.innerHTML += `
            <div class="h-node">
                <div class="h-time">${timeLabel}</div>
                <img class="h-svg" src="${mapTextToWeatherCompanyIcon(conditionText)}" alt="Icon">
                <div class="h-temp">${Math.round(hourly.temperature_2m[i])}°</div>
            </div>`;
    }

    // Process 7-Day Matrix Array Rows
    const stack = document.getElementById("daily-stack");
    stack.innerHTML = "";
    const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    
    document.getElementById("obs-hilo").innerText = `H: ${Math.round(daily.temperature_2m_max[0])}° L: ${Math.round(daily.temperature_2m_min[0])}°`;
    document.getElementById("outlook-text-summary").innerText = `Regional meteorological arrays indicate upcoming ${translateWMOCodeToText(daily.weather_code[0]).toLowerCase()} patterns. High coordinates peaking near ${Math.round(daily.temperature_2m_max[0])}°F with structural overnight lows cooling near ${Math.round(daily.temperature_2m_min[0])}°F.`;

    for (let j = 0; j < 7; j++) {
        const dayString = weekdayNames[new Date(daily.time[j] * 1000).getDay()];
        const condText = translateWMOCodeToText(daily.weather_code[j]);
        stack.innerHTML += `
            <div class="v-row">
                <div class="v-day">${j === 0 ? 'Today' : dayString}</div>
                <div class="v-icon-frame">
                    <img class="v-svg" src="${mapTextToWeatherCompanyIcon(condText)}" alt="Icon">
                </div>
                <div class="v-temp">${Math.round(daily.temperature_2m_max[j])}° / ${Math.round(daily.temperature_2m_min[j])}°</div>
                <div class="v-desc">${condText}</div>
            </div>`;
    }
}

/* WMO Code to Standard Meteorological Phrases */
function translateWMOCodeToText(code) {
    if (code === 0) return "Clear";
    if (code <= 3) return "Partly Cloudy";
    if (code <= 48) return "Fog";
    if (code <= 55) return "Light Drizzle";
    if (code <= 65) return "Rain";
    if (code <= 77) return "Snow";
    if (code <= 82) return "Showers";
    if (code <= 86) return "Snow Showers";
    if (code <= 99) return "Thunderstorms";
    return "Cloudy";
}

/* Strict Translation Matrix into Verified Open-Source Animated TWC Icons */
function mapTextToWeatherCompanyIcon(phrase) {
    const baseSecureCDN = "https://basmilis.github.io/weather-icons/production/fill/all/";
    const normalized = phrase.toLowerCase();

    if (normalized.includes("tornado")) return `${baseSecureCDN}tornado.svg`;
    if (normalized.includes("thunderstorm") || normalized.includes("severe")) return `${baseSecureCDN}thunderstorms-extreme.svg`;
    if (normalized.includes("heavy snow")) return `${baseSecureCDN}extreme-snow.svg`;
    if (normalized.includes("snow showers") || normalized.includes("flurries")) return `${baseSecureCDN}snow.svg`;
    if (normalized.includes("snow")) return `${baseSecureCDN}snow.svg`;
    if (normalized.includes("heavy rain") || normalized.includes("squall")) return `${baseSecureCDN}extreme-rain.svg`;
    if (normalized.includes("rain") || normalized.includes("drizzle") || normalized.includes("showers")) return `${baseSecureCDN}rain.svg`;
    if (normalized.includes("mostly cloudy") || normalized.includes("broken") || normalized.includes("overcast") || normalized.includes("cloudy")) return `${baseSecureCDN}cloudy.svg`;
    if (normalized.includes("partly cloudy") || normalized.includes("scattered")) return `${baseSecureCDN}partly-cloudy-day.svg`;
    if (normalized.includes("clear") || normalized.includes("fair") || normalized.includes("sunny")) return `${baseSecureCDN}clear-day.svg`;
    if (normalized.includes("fog") || normalized.includes("mist")) return `${baseSecureCDN}fog.svg`;

    return `${baseSecureCDN}cloudy.svg`;
}

/* Complete Storm Prediction Center Day 1-8 Convective Outlook Compiling Core */
async function compileSPCOutlooks(lat, lon) {
    const container = document.getElementById("spc-outlook-container");
    container.innerHTML = "";

    // Sequential loop mapping Day 1 through Day 8 convective sectors
    for (let day = 1; day <= 8; day++) {
        try {
            // Fetch live categorical geojson strings directly via official NOAA endpoints
            const response = await fetch(`https://www.spc.noaa.gov/products/outlook/day${day}otlk_cat.geojson`);
            if (!response.ok) throw new Error("Outlook vector layer unreachable.");
            
            const geojson = await response.json();
            let identifiedRisk = "No Risk Layer Decoded";
            let cssClass = "risk-general";

            if (geojson.features && geojson.features.length > 0) {
                // Loop backward from highest severe value threshold down to marginal
                const sortedFeatures = geojson.features.sort((a, b) => (b.properties.Label || "").localeCompare(a.properties.Label || ""));
                if (sortedFeatures[0] && sortedFeatures[0].properties) {
                    identifiedRisk = sortedFeatures[0].properties.LABEL || "No Categorical Severe Risk Checked";
                }
            }

            const checkText = identifiedRisk.toLowerCase();
            if (checkText.includes("high")) cssClass = "risk-high";
            else if (checkText.includes("mod")) cssClass = "risk-moderate";
            else if (checkText.includes("enh")) cssClass = "risk-enhanced";
            else if (checkText.includes("slgt")) cssClass = "risk-slight";
            else if (checkText.includes("mrgl")) cssClass = "risk-marginal";
            else if (checkText.includes("gen") || checkText.includes("tstm")) { identifiedRisk = "Thunderstorms"; cssClass = "risk-general"; }

            container.innerHTML += `
                <div class="spc-node">
                    <div class="spc-header-line">
                        <span class="spc
