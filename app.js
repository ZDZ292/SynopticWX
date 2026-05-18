let targetCoords = "40.7128,-74.0060"; // Default New York canvas anchor point

const fallbackHeaders = {
    "User-Agent": "SlateWeatherPRO/4.0 (Identified GitHub Client)"
};

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("location-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleSearch();
    });
    executeWeatherCorePipeline();
});

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active-content'));
    document.querySelectorAll('.nav-pill').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active-content');
    if (window.event) window.event.currentTarget.classList.add('active');
}

async function handleSearch() {
    const rawVal = document.getElementById("location-input").value.trim();
    if (!rawVal) return;

    document.getElementById("obs-phrase").innerText = "Geolocating grid array...";
    
    try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(rawVal)}&count=1&language=en&format=json`);
        const payload = await res.json();

        if (!payload.results || payload.results.length === 0) {
            document.getElementById("obs-phrase").innerText = "Location unknown.";
            return;
        }

        const match = payload.results[0];
        targetCoords = `${match.latitude.toFixed(4)},${match.longitude.toFixed(4)}`;
        document.getElementById("station-header").innerText = `Current Conditions // ${match.name}, ${match.admin1 || ''}`;
        
        executeWeatherCorePipeline();
    } catch (err) {
        document.getElementById("obs-phrase").innerText = "Geocoding network lost.";
    }
}

async function executeWeatherCorePipeline() {
    const lat = targetCoords.split(',')[0];
    const lon = targetCoords.split(',')[1];
    
    // Bind interactive map module
    document.getElementById("radar-frame").src = `https://radar.weather.gov/withandwithout.php?title=Radar&lat=${lat}&lon=${lon}`;

    // Fire dual asynchronous loops
    syncLiveObservationsAndTimelines(lat, lon);
    fetchConvectiveHazards();
}

async function syncLiveObservationsAndTimelines(lat, lon) {
    let telemetrySynced = false;

    // STAGE 1: Attempt National Weather Service Government Sync
    try {
        const pointRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`, { headers: fallbackHeaders });
        const pointData = await pointRes.json();
        
        const stationRes = await fetch(pointData.properties.observationStations, { headers: fallbackHeaders });
        const stationData = await stationRes.json();
        
        if (stationData.features && stationData.features.length > 0) {
            const obsRes = await fetch(`${stationData.features[0].id}/observations/latest`, { headers: fallbackHeaders });
            const obsData = await obsRes.json();
            const p = obsData.properties;

            if (p.temperature.value !== null) {
                renderNWSObservations(p);
                telemetrySynced = true;
            }
        }
        
        // Execute timeline fetches from NWS endpoints if working
        fetchNWSTimelines(pointData.properties.forecast, pointData.properties.forecastHourly);
    } catch (nwsErr) {
        console.warn("NWS grid reporting down. Routing to Open-Meteo backup terminal.");
    }

    // STAGE 2: Safety Failback Backup Engine (Triggers if airport data is broken or null)
    if (!telemetrySynced) {
        try {
            const backupRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timeformat=unixtime&timezone=auto`);
            const backupData = await backupRes.json();
            
            renderBackupObservations(backupData.current);
            renderBackupTimelines(backupData.hourly, backupData.daily);
        } catch (backupErr) {
            document.getElementById("obs-phrase").innerText = "Atmospheric pipelines offline.";
        }
    }
}

/* NWS VISUAL INTERPRETATION RENDERERS */
function renderNWSObservations(p) {
    const t = p.temperature.value ? Math.round((p.temperature.value * 9/5) + 32) : 65;
    const d = p.dewpoint.value ? Math.round((p.dewpoint.value * 9/5) + 32) : 52;
    const h = p.heatIndex.value ? Math.round((p.heatIndex.value * 9/5) + 32) : t;
    const w = p.windSpeed.value ? Math.round(p.windSpeed.value * 0.621371) : 0;
    const r = p.precipitationLastHour.value ? (p.precipitationLastHour.value / 25.4).toFixed(2) : "0.00";
    const hum = p.relativeHumidity.value ? Math.round(p.relativeHumidity.value) : 60;

    document.getElementById("obs-temp").innerText = `${t}°`;
    document.getElementById("obs-feels").innerText = `Feels like ${h}°`;
    document.getElementById("obs-wind").innerText = `${w} mph`;
    document.getElementById("obs-humidity").innerText = `${hum}%`;
    document.getElementById("obs-dewpoint").innerText = `${d}°F`;
    document.getElementById("obs-rain").innerText = `${r} in`;
    document.getElementById("obs-phrase").innerText = p.textDescription || "Atmosphere Stabilized";
    
    document.getElementById("current-twc-icon").src = getAnimatedSVGPath(p.textDescription);
}

async function fetchNWSTimelines(dailyUrl, hourlyUrl) {
    try {
        const hRes = await fetch(hourlyUrl, { headers: fallbackHeaders });
        const hData = await hRes.json();
        const hourContainer = document.getElementById("hourly-container");
        hourContainer.innerHTML = "";

        hData.properties.periods.slice(0, 24).forEach(slot => {
            const timeStr = new Date(slot.startTime).toLocaleTimeString([], { hour: '2-digit' });
            hourContainer.innerHTML += `
                <div class="scroller-node">
                    <div class="time-label">${timeStr}</div>
                    <img class="node-svg" src="${getAnimatedSVGPath(slot.shortForecast)}" alt="Icon">
                    <div class="temp-label">${slot.temperature}°</div>
                </div>`;
        });

        const dRes = await fetch(dailyUrl, { headers: fallbackHeaders });
        const dData = await dRes.json();
        const dailyContainer = document.getElementById("daily-container");
        dailyContainer.innerHTML = "";

        dData.properties.periods.forEach(slot => {
            dailyContainer.innerHTML += `
                <div class="stack-row">
                    <div class="stack-day">${slot.name}</div>
                    <div class="stack-icon-frame">
                        <img class="stack-svg" src="${getAnimatedSVGPath(slot.shortForecast)}" alt="Icon">
                    </div>
                    <div class="stack-temp-range">${slot.temperature}°F</div>
                    <div class="stack-phrase">${slot.shortForecast}</div>
                </div>`;
        });
    } catch(e) { console.error("NWS timeline build error, falling back."); }
}

/* BACKUP ENGINE INTERPRETATION RENDERERS (WMO Codes mapped to TWC architecture) */
function renderBackupObservations(c) {
    const t = Math.round(c.temperature_2m);
    const app = Math.round(c.apparent_temperature);
    const phrase = getWMOStringPhrase(c.weather_code);

    document.getElementById("obs-temp").innerText = `${t}°`;
    document.getElementById("obs-feels").innerText = `Feels like ${app}°`;
    document.getElementById("obs-wind").innerText = `${Math.round(c.wind_speed_10m)} mph`;
    document.getElementById("obs-humidity").innerText = `${Math.round(c.relative_humidity_2m)}%`;
    document.getElementById("obs-dewpoint").innerText = `--`;
    document.getElementById("obs-rain").innerText = `${c.precipitation.toFixed(2)} in`;
    document.getElementById("obs-phrase").innerText = phrase;
    document.getElementById("current-twc-icon").src = getAnimatedSVGPath(phrase);
}

function renderBackupTimelines(h, d) {
    const hourContainer = document.getElementById("hourly-container");
    hourContainer.innerHTML = "";
    
    for(let i=0; i<24; i++) {
        const timeStr = new Date(h.time[i] * 1000).toLocaleTimeString([], { hour: '2-digit' });
        const phrase = getWMOStringPhrase(h.weather_code[i]);
        hourContainer.innerHTML += `
            <div class="scroller-node">
                <div class="time-label">${timeStr}</div>
                <img class="node-svg" src="${getAnimatedSVGPath(phrase)}" alt="Icon">
                <div class="temp-label">${Math.round(h.temperature_2m[i])}°</div>
            </div>`;
    }

    const dailyContainer = document.getElementById("daily-container");
    dailyContainer.innerHTML = "";
    const weekday = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    
    for(let j=0; j<7; j++) {
        const dayName = weekday[new Date(d.time[j] * 1000).getDay()];
        const phrase = getWMOStringPhrase(d.weather_code[j]);
        dailyContainer.innerHTML += `
            <div class="stack-row">
                <div class="stack-day">${j === 0 ? 'Today' : dayName}</div>
                <div class="stack-icon-frame">
                    <img class="stack-svg" src="${getAnimatedSVGPath(phrase)}" alt="Icon">
                </div>
                <div class="stack-temp-range">${Math.round(d.temperature_2m_max[j])}°</div>
                <div class="stack-phrase">${phrase}</div>
            </div>`;
    }
}

/* METEOROLOGICAL TRANSLATION ENGINES */
function getAnimatedSVGPath(desc) {
    const root = "https://basmilius.github.io/weather-icons/production/fill/all/";
    if (!desc) return `${root}not-available.svg`;
    const text = desc.toLowerCase();

    if (text.includes("tornado")) return `${root}tornado.svg`;
    if (text.includes("thunderstorm") || text.includes("tsra") || text.includes("severe")) return `${root}thunderstorms-extreme.svg`;
    if (text.includes("heavy snow")) return `${root}extreme-snow.svg`;
    if (text.includes("snow showers") || text.includes("flurries")) return `${root}snow.svg`;
    if (text.includes("snow")) return `${root}snow.svg`;
    if (text.includes("heavy rain") || text.includes("squall")) return `${root}extreme-rain.svg`;
    if (text.includes("rain") || text.includes("drizzle") || text.includes("showers")) return `${root}rain.svg`;
    if (text.includes("mostly cloudy") || text.includes("broken") || text.includes("overcast")) return `${root}cloudy.svg`;
    if (text.includes("partly cloudy") || text.includes("scattered")) return `${root}partly-cloudy-day.svg`;
    if (text.includes("clear") || text.includes("fair") || text.includes("sunny")) return `${root}clear-day.svg`;
    if (text.includes("fog") || text.includes("mist")) return `${root}fog.svg`;

    return `${root}cloudy.svg`;
}

function getWMOStringPhrase(code) {
    if (code === 0) return "Clear";
    if (code <= 3) return "Partly Cloudy";
    if (code <= 48) return "Fog";
    if (code <= 55) return "Drizzle";
    if (code <= 65) return "Rain";
    if (code <= 77) return "Snow";
    if (code <= 82) return "Showers";
    if (code <= 86) return "Snow Showers";
    return "Thunderstorms";
}

async function fetchConvectiveHazards() {
    const listContainer = document.getElementById("live-bulletins");
    try {
        const response = await fetch(`https://api.weather.gov/alerts/active?point=${targetCoords}`, { headers: fallbackHeaders });
        const data = await response.json();
        const alerts = data.features || [];

        if (alerts.length === 0) {
            listContainer.innerHTML = `<p class="status-msg">No active severe warnings or watches in effect for this grid sector.</p>`;
            return;
        }

        listContainer.innerHTML = "";
        alerts.forEach(alert => {
            const p = alert.properties;
            const eventName = p.event.toLowerCase();
            const isHighPriority = eventName.includes("watch") || eventName.includes("warning") || eventName.includes("emergency");
            
            listContainer.innerHTML += `
                <div class="bulletin-node ${isHighPriority ? 'high-vis' : ''}">
                    <h4>${p.event}</h4>
                    <p><strong>Sector:</strong> ${p.areaDesc}</p>
                    <p style="margin-top:4px; color:#d4d4d8;">${p.headline || "Alert text wire broadcasting live..."}</p>
                </div>`;
        });
    } catch (err) {
        listContainer.innerHTML = `<p class="status-msg text-danger">Alert synchronization channel interrupted.</p>`;
    }
}
