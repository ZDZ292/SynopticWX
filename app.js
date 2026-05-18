let currentCoordinates = "40.7128,-74.0060"; 

const networkHeaders = {
    "User-Agent": "SlateWeatherPRO/3.0 (contact: github-deploy-engine)"
};

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("location-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleSearch();
    });
    runWeatherCore();
});

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active-content'));
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active-content');
    if (window.event) window.event.currentTarget.classList.add('active');
}

function updateOutlookImage() {
    const selector = document.getElementById("outlook-select");
    const targetImage = document.getElementById("spc-outlook-img");
    targetImage.src = `https://www.spc.noaa.gov/products/outlook/${selector.value}.gif`;
}

async function handleSearch() {
    const query = document.getElementById("location-input").value.trim();
    if (!query) return;

    document.getElementById("obs-phrase").innerText = "Searching global coordinates...";
    
    try {
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`);
        const geoData = await geoRes.json();

        if (!geoData.results || geoData.results.length === 0) {
            document.getElementById("obs-phrase").innerText = "Location untracked.";
            return;
        }

        const location = geoData.results[0];
        currentCoordinates = `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
        
        document.getElementById("station-header").innerText = `Current Conditions // ${location.name}, ${location.admin1 || ''}`;
        
        runWeatherCore();
    } catch (err) {
        document.getElementById("obs-phrase").innerText = "Geocoding network dropped.";
    }
}

async function runWeatherCore() {
    try {
        const pointRes = await fetch(`https://api.weather.gov/points/${currentCoordinates}`, { headers: networkHeaders });
        const pointData = await pointRes.json();
        
        document.getElementById("radar-frame").src = `https://radar.weather.gov/withandwithout.php?title=Radar%20Loop&lat=${currentCoordinates.split(',')[0]}&lon=${currentCoordinates.split(',')[1]}`;

        fetchCurrentObservations(pointData.properties.observationStations);
        fetchTimelines(pointData.properties.forecast, pointData.properties.forecastHourly);
        runSPCOutlookEngine();
    } catch (err) {
        document.getElementById("obs-phrase").innerText = "Network Handshake Interrupted.";
    }
}

async function fetchCurrentObservations(stationsUrl) {
    try {
        const resStations = await fetch(stationsUrl, { headers: networkHeaders });
        const dataStations = await resStations.json();
        
        if (!dataStations.features || dataStations.features.length === 0) throw new Error();

        const latestObsRes = await fetch(`${dataStations.features[0].id}/observations/latest`, { headers: networkHeaders });
        const obs = await latestObsRes.json();
        const p = obs.properties;

        const tempF = p.temperature.value ? Math.round((p.temperature.value * 9/5) + 32) : "--";
        const dewF = p.dewpoint.value ? Math.round((p.dewpoint.value * 9/5) + 32) : "--";
        const heatF = p.heatIndex.value ? Math.round((p.heatIndex.value * 9/5) + 32) : tempF;
        const windMph = p.windSpeed.value ? Math.round(p.windSpeed.value * 0.621371) : "0";
        const rainIn = p.precipitationLastHour.value ? (p.precipitationLastHour.value / 25.4).toFixed(2) : "0.00";
        const humidityPercent = p.relativeHumidity.value ? Math.round(p.relativeHumidity.value) : "--";

        document.getElementById("obs-temp").innerText = tempF !== "--" ? `${tempF}°` : "--°";
        document.getElementById("obs-dewpoint").innerText = dewF !== "--" ? `${dewF}°F` : "--°F";
        document.getElementById("obs-heatindex").innerText = heatF !== "--" ? `${heatF}°` : "--°";
        document.getElementById("obs-wind").innerText = `${windMph} mph`;
        document.getElementById("obs-rain").innerText = `${rainIn} in`;
        document.getElementById("obs-humidity").innerText = `${humidityPercent}%`;
        document.getElementById("obs-phrase").innerText = p.textDescription || "Stable Systems";

        document.getElementById("current-twc-icon").src = `icons/${getIconCodeFromPhrase(p.textDescription)}.png`;
    } catch(e) { 
        document.getElementById("obs-phrase").innerText = "Observation node anomaly.";
    }
}

async function fetchTimelines(dailyUrl, hourlyUrl) {
    try {
        // Render 72-Hour Component with inline parsed weather icons
        const hRes = await fetch(hourlyUrl, { headers: networkHeaders });
        const hData = await hRes.json();
        const container = document.getElementById("hourly-container");
        container.innerHTML = "";

        if (hData.properties && hData.properties.periods) {
            hData.properties.periods.slice(0, 72).forEach(slot => {
                const time = new Date(slot.startTime).toLocaleTimeString([], {hour: '2-digit'});
                const iconCode = getIconCodeFromPhrase(slot.shortForecast);
                container.innerHTML += `
                    <div class="hourly-tick-node">
                        <div class="tick-time">${time}</div>
                        <img class="tick-icon" src="icons/${iconCode}.png" alt="Icon">
                        <div class="tick-temp">${slot.temperature}°</div>
                    </div>`;
            });
        }

        // Render 7-Day Day/Night Module with parsed icons
        const dRes = await fetch(dailyUrl, { headers: networkHeaders });
        const dData = await dRes.json();
        const dContainer = document.getElementById("daily-container");
        dContainer.innerHTML = "";

        if (dData.properties && dData.properties.periods) {
            dData.properties.periods.forEach(slot => {
                const iconCode = getIconCodeFromPhrase(slot.shortForecast);
                dContainer.innerHTML += `
                    <div class="daily-row-node">
                        <div class="daily-metadata">${slot.name}</div>
                        <div class="daily-icon-wrapper">
                            <img class="daily-row-icon" src="icons/${iconCode}.png" alt="Forecast Icon">
                        </div>
                        <div class="daily-spread">${slot.temperature}°F</div>
                        <div class="daily-desc-summary">${slot.shortForecast}</div>
                    </div>`;
            });
        }
    } catch(e) { console.error("Timeline update failure:", e); }
}

// Global Text Interpretation Mapping Engine
function getIconCodeFromPhrase(desc) {
    if (!desc) return "na";
    const text = desc.toLowerCase();
    
    if (text.includes("tornado")) return "0";
    if (text.includes("thunderstorm") || text.includes("tsra") || text.includes("severe")) return "4";
    if (text.includes("heavy snow")) return "16";
    if (text.includes("snow showers") || text.includes("flurries")) return "14";
    if (text.includes("snow")) return "16";
    if (text.includes("heavy rain") || text.includes("squall")) return "12";
    if (text.includes("rain") || text.includes("drizzle") || text.includes("showers")) return "11";
    if (text.includes("mostly cloudy") || text.includes("broken") || text.includes("overcast")) return "28";
    if (text.includes("partly cloudy") || text.includes("scattered")) return "30";
    if (text.includes("clear") || text.includes("fair") || text.includes("sunny")) return "32";
    if (text.includes("fog")) return "20";
    
    return "na"; 
}

async function runSPCOutlookEngine() {
    const listContainer = document.getElementById("live-bulletins");
    try {
        const response = await fetch(`https://api.weather.gov/alerts/active?point=${currentCoordinates}`, { headers: networkHeaders });
        const data = await response.json();
        const severeAlerts = data.features || [];

        if(severeAlerts.length === 0) {
            listContainer.innerHTML = `<p style="color:var(--text-secondary); font-size:0.85rem;">No active severe weather hazards for this grid.</p>`;
            return;
        }

        listContainer.innerHTML = "";
        severeAlerts.forEach(alert => {
            const p = alert.properties;
            const eventName = p.event.toLowerCase();
            const isHighPriority = eventName.includes("watch") || eventName.includes("warning") || eventName.includes("emergency");
            
            listContainer.innerHTML += `
                <div class="bulletin-item ${isHighPriority ? 'alert-priority' : ''}">
                    <h4>${p.event}</h4>
                    <p style="font-size:0.8rem; color:var(--text-secondary); margin:4px 0;">${p.areaDesc}</p>
                    <p style="margin-top:6px; color:#d4d4d8; font-size:0.8rem; line-height:1.4;">${p.headline || "Processing wire transmission..."}</p>
                </div>`;
        });
    } catch (err) {
        listContainer.innerHTML = `<p style="color:var(--alert-red); font-size:0.85rem;">Alert synchronization fail.</p>`;
    }
}
