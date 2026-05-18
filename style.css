// Default sector coordinates set to New York City as your starting canvas
let currentCoordinates = "40.7128,-74.0060"; 

const networkHeaders = {
    "User-Agent": "SlateWeatherPRO/3.0 (contact: github-deploy-engine)"
};

document.addEventListener("DOMContentLoaded", () => {
    // Allows hitting "Enter" on mobile keyboard to trigger search
    document.getElementById("location-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleSearch();
    });
    runWeatherCore();
});

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active-content'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
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

    document.getElementById("obs-phrase").innerText = "Geocoding location vector...";
    
    try {
        // Fetch open-source geocoding mapping payload
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`);
        const geoData = await geoRes.json();

        if (!geoData.results || geoData.results.length === 0) {
            document.getElementById("obs-phrase").innerText = "Location unknown to database.";
            return;
        }

        const location = geoData.results[0];
        currentCoordinates = `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
        
        document.getElementById("station-header").innerText = `Current Conditions // ${location.name}, ${location.admin1 || ''}`;
        
        // Refresh structural loops
        runWeatherCore();
    } catch (err) {
        console.error("Geocoding network crash: ", err);
        document.getElementById("obs-phrase").innerText = "Geocoding connection dropped.";
    }
}

async function runWeatherCore() {
    try {
        // Stage 1: Handshake with points matrix
        const pointRes = await fetch(`https://api.weather.gov/points/${currentCoordinates}`, { headers: networkHeaders });
        const pointData = await pointRes.json();
        
        // Sync map frames
        document.getElementById("radar-frame").src = `https://radar.weather.gov/withandwithout.php?title=Radar%20Loop&lat=${currentCoordinates.split(',')[0]}&lon=${currentCoordinates.split(',')[1]}`;

        fetchCurrentObservations(pointData.properties.observationStations);
        fetchTimelines(pointData.properties.forecast, pointData.properties.forecastHourly);
        runSPCOutlookEngine();
    } catch (err) {
        document.getElementById("obs-phrase").innerText = "NWS core server handshake rejected.";
        console.error("Core engine exception: ", err);
    }
}

async function fetchCurrentObservations(stationsUrl) {
    try {
        const resStations = await fetch(stationsUrl, { headers: networkHeaders });
        const dataStations = await resStations.json();
        
        if (!dataStations.features || dataStations.features.length === 0) {
            throw new Error("No stations in grid block");
        }

        const latestObsRes = await fetch(`${dataStations.features[0].id}/observations/latest`, { headers: networkHeaders });
        const obs = await latestObsRes.json();
        const p = obs.properties;

        // Metric Conversions
        const tempF = p.temperature.value ? Math.round((p.temperature.value * 9/5) + 32) : "--";
        const dewF = p.dewpoint.value ? Math.round((p.dewpoint.value * 9/5) + 32) : "--";
        const heatF = p.heatIndex.value ? Math.round((p.heatIndex.value * 9/5) + 32) : tempF;
        const windMph = p.windSpeed.value ? Math.round(p.windSpeed.value * 0.621371) : "0";
        const rainIn = p.precipitationLastHour.value ? (p.precipitationLastHour.value / 25.4).toFixed(2) : "0.00";
        const humidityPercent = p.relativeHumidity.value ? Math.round(p.relativeHumidity.value) : "--";

        document.getElementById("obs-temp").innerText = tempF !== "--" ? `${tempF}°F` : "--°F";
        document.getElementById("obs-dewpoint").innerText = dewF !== "--" ? `${dewF}°F` : "--°F";
        document.getElementById("obs-heatindex").innerText = heatF !== "--" ? `${heatF}°F` : "--°F";
        document.getElementById("obs-wind").innerText = `${windMph} mph`;
        document.getElementById("obs-rain").innerText = `${rainIn} in`;
        document.getElementById("obs-humidity").innerText = `${humidityPercent}%`;
        document.getElementById("obs-phrase").innerText = p.textDescription || "Stable Atmospheric Systems";

        parseTWCLocalIcon(p.icon || "", p.textDescription || "");
    } catch(e) { 
        console.error("Observation node loop fail:", e); 
        document.getElementById("obs-phrase").innerText = "Station feeding gap. Retrying layout map...";
        document.getElementById("current-twc-icon").src = `icons/na.png`;
    }
}

async function fetchTimelines(dailyUrl, hourlyUrl) {
    try {
        const hRes = await fetch(hourlyUrl, { headers: networkHeaders });
        const hData = await hRes.json();
        const container = document.getElementById("hourly-container");
        container.innerHTML = "";

        if (hData.properties && hData.properties.periods) {
            hData.properties.periods.slice(0, 72).forEach(slot => {
                const time = new Date(slot.startTime).toLocaleTimeString([], {hour: '2-digit'});
                container.innerHTML += `
                    <div style="flex:0 0 115px; background:#050505; padding:16px; border-radius:10px; border:1px solid #1a1a1a; text-align:center;">
                        <div style="font-size:0.72rem; color:#555; text-transform:uppercase; font-weight:700;">${time}</div>
                        <div style="font-weight:300; font-size:1.4rem; color:#eab308; margin:8px 0;">${slot.temperature}°</div>
                        <div style="font-size:0.68rem; color:#8e8e93; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${slot.shortForecast}</div>
                    </div>`;
            });
        }

        const dRes = await fetch(dailyUrl, { headers: networkHeaders });
        const dData = await dRes.json();
        const dContainer = document.getElementById("daily-container");
        dContainer.innerHTML = "";

        if (dData.properties && dData.properties.periods) {
            dData.properties.periods.forEach(slot => {
                dContainer.innerHTML += `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#050505; padding:16px 24px; border-radius:10px; border:1px solid #1a1a1a; margin-bottom:10px;">
                        <div style="font-weight:700; width:30%; font-size:0.9rem;">${slot.name}</div>
                        <div style="color:#eab308; font-weight:300; font-size:1.3rem; width:15%;">${slot.temperature}°F</div>
                        <div style="font-size:0.82rem; color:#8e8e93; width:55%; text-align:right;">${slot.shortForecast}</div>
                    </div>`;
            });
        }
    } catch(e) { console.error("Timeline data loading fault:", e); }
}

function parseTWCLocalIcon(nwsUrl, desc) {
    let code = "na"; 
    const text = desc.toLowerCase();
    
    if (text.includes("tornado")) code = "0";
    else if (text.includes("thunderstorm") || text.includes("tsra")) code = "4";
    else if (text.includes("heavy snow")) code = "16";
    else if (text.includes("snow showers")) code = "14";
    else if (text.includes("snow") || text.includes("flurries")) code = "16";
    else if (text.includes("heavy rain") || text.includes("squall")) code = "12";
    else if (text.includes("rain") || text.includes("drizzle") || text.includes("showers")) code = "11";
    else if (text.includes("mostly cloudy") || text.includes("broken")) code = "28";
    else if (text.includes("partly cloudy") || text.includes("scattered")) code = "30";
    else if (text.includes("clear") || text.includes("fair") || text.includes("sunny")) code = "32";
    else if (text.includes("fog")) code = "20";
    
    document.getElementById("current-twc-icon").src = `icons/${code}.png`;
}

async function runSPCOutlookEngine() {
    const listContainer = document.getElementById("live-bulletins");
    try {
        const response = await fetch(`https://api.weather.gov/alerts/active?point=${currentCoordinates}`, { headers: networkHeaders });
        const data = await response.json();
        
        const severeAlerts = data.features || [];

        if(severeAlerts.length === 0) {
            listContainer.innerHTML = `<p style="color:#6e6e73; font-size:0.85rem;">No active severe weather warnings or convective watches in effect for this localized grid sector.</p>`;
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
                    <p><strong>Sector:</strong> ${p.areaDesc}</p>
                    <p style="margin-top:6px; color:#a1a1aa; font-size:0.78rem; line-height:1.4;">${p.headline || "Alert details streaming live..."}</p>
                </div>`;
        });
    } catch (err) {
        listContainer.innerHTML = `<p style="color:var(--alert-crimson); font-size:0.85rem;">Error connection streaming NOAA hazard wire.</p>`;
    }
}
