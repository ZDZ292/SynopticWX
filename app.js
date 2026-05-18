// Dynamic sector targeted coordinates (Evanston, IL sector default)
const TARGET_LAT_LON = "42.0451,-87.6877"; 

document.addEventListener("DOMContentLoaded", () => {
    runWeatherCore();
    runSPCOutlookEngine();
});

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active-content'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active-content');
    if (event) event.currentTarget.classList.add('active');
}

function updateOutlookImage() {
    const selector = document.getElementById("outlook-select");
    const targetImage = document.getElementById("spc-outlook-img");
    targetImage.src = `https://www.spc.noaa.gov/products/outlook/${selector.value}.gif`;
}

async function runWeatherCore() {
    try {
        const pointRes = await fetch(`https://api.weather.gov/points/${TARGET_LAT_LON}`);
        const pointData = await pointRes.json();
        
        fetchCurrentObservations(pointData.properties.observationStations);
        fetchTimelines(pointData.properties.forecast, pointData.properties.forecastHourly);
    } catch (err) {
        document.getElementById("obs-phrase").innerText = "Data telemetry offline.";
    }
}

async function fetchCurrentObservations(stationsUrl) {
    try {
        const resStations = await fetch(stationsUrl);
        const dataStations = await resStations.json();
        
        const latestObsRes = await fetch(`${dataStations.features[0].id}/observations/latest`);
        const obs = await latestObsRes.json();
        const p = obs.properties;

        const tempF = p.temperature.value ? Math.round((p.temperature.value * 9/5) + 32) : 68;
        const dewF = p.dewpoint.value ? Math.round((p.dewpoint.value * 9/5) + 32) : 50;
        const heatF = p.heatIndex.value ? Math.round((p.heatIndex.value * 9/5) + 32) : tempF;
        const rainIn = p.precipitationLastHour.value ? (p.precipitationLastHour.value / 25.4).toFixed(2) : "0.00";

        document.getElementById("obs-temp").innerText = `${tempF}°F`;
        document.getElementById("obs-dewpoint").innerText = `${dewF}°F`;
        document.getElementById("obs-heatindex").innerText = `${heatF}°F`;
        document.getElementById("obs-rain").innerText = `${rainIn} in`;
        document.getElementById("obs-phrase").innerText = p.textDescription || "Clear Systems";

        parseTWCLocalIcon(p.icon || "", p.textDescription || "");
    } catch(e) { console.error("Observations system issue:", e); }
}

async function fetchTimelines(dailyUrl, hourlyUrl) {
    try {
        const hRes = await fetch(hourlyUrl);
        const hData = await hRes.json();
        const container = document.getElementById("hourly-container");
        container.innerHTML = "";

        hData.properties.periods.slice(0, 72).forEach(slot => {
            const time = new Date(slot.startTime).toLocaleTimeString([], {hour: '2-digit'});
            container.innerHTML += `
                <div style="flex:0 0 115px; background:#050505; padding:16px; border-radius:10px; border:1px solid #1a1a1a; text-align:center;">
                    <div style="font-size:0.72rem; color:#555; text-transform:uppercase; font-weight:700;">${time}</div>
                    <div style="font-weight:300; font-size:1.4rem; color:#eab308; margin:8px 0;">${slot.temperature}°</div>
                    <div style="font-size:0.68rem; color:#8e8e93; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${slot.shortForecast}</div>
                </div>`;
        });

        const dRes = await fetch(dailyUrl);
        const dData = await dRes.json();
        const dContainer = document.getElementById("daily-container");
        dContainer.innerHTML = "";

        dData.properties.periods.forEach(slot => {
            dContainer.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; background:#050505; padding:16px 24px; border-radius:10px; border:1px solid #1a1a1a; margin-bottom:10px;">
                    <div style="font-weight:700; width:30%; font-size:0.9rem;">${slot.name}</div>
                    <div style="color:#eab308; font-weight:300; font-size:1.3rem; width:15%;">${slot.temperature}°F</div>
                    <div style="font-size:0.82rem; color:#8e8e93; width:55%; text-align:right;">${slot.shortForecast}</div>
                </div>`;
        });
    } catch(e) { console.error("Forecast timeline issue:", e); }
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
        const response = await fetch("https://api.weather.gov/alerts/active?area=US");
        const data = await response.json();
        
        const severeAlerts = data.features.filter(f => {
            const type = f.properties.event.toLowerCase();
            return type.includes("watch") || type.includes("discussion") || type.includes("mesoscale") || type.includes("warning");
        }).slice(0, 25);

        if(severeAlerts.length === 0) {
            listContainer.innerHTML = `<p style="color:#6e6e73; font-size:0.85rem;">No active severe convective or mesoscale discussions issued across the CONUS.</p>`;
            return;
        }

        listContainer.innerHTML = "";
        severeAlerts.forEach(alert => {
            const p = alert.properties;
            const isHighPriority = p.event.toLowerCase().includes("watch") || p.event.toLowerCase().includes("warning");
            
            listContainer.innerHTML += `
                <div class="bulletin-item ${isHighPriority ? 'alert-priority' : ''}">
                    <h4>${p.event}</h4>
                    <p><strong>Sector:</strong> ${p.areaDesc}</p>
                    <p style="margin-top:6px; color:#a1a1aa; font-size:0.78rem; line-height:1.4;">${p.headline || "Telemetry wire text parsing live..."}</p>
                </div>`;
        });
    } catch (err) {
        listContainer.innerHTML = `<p style="color:var(--alert-crimson); font-size:0.85rem;">Alert connection error.</p>`;
    }
}
