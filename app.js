let currentCoords = "40.7128,-74.0060"; // Default coordinates anchor (New York City)

const secureHeaders = {
    "User-Agent": "SynopticWeather/1.0 (Terminal Line Diagnostic Handshake)"
};

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("location-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleSearch();
    });
    runPrimaryWeatherPipeline();
});

function switchSection(sectId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.querySelectorAll('.section-pill').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    document.getElementById(sectId).classList.add('active-view');
    
    if (sectId === 'sec-today') {
        document.querySelector('.section-pill[onclick*="sec-today"]').classList.add('active');
        document.querySelector('.nav-item[onclick*="sec-today"]').classList.add('active');
    } else if (sectId === 'sec-hourly') {
        document.querySelector('.section-pill[onclick*="sec-hourly"]').classList.add('active');
    } else if (sectId === 'sec-daily') {
        document.querySelector('.section-pill[onclick*="sec-daily"]').classList.add('active');
    } else if (sectId === 'sec-storms') {
        document.querySelector('.section-pill[onclick*="sec-storms"]').classList.add('active');
        document.querySelector('.nav-item[onclick*="sec-storms"]').classList.add('active');
    } else if (sectId === 'sec-radar') {
        document.querySelector('.nav-item[onclick*="sec-radar"]').classList.add('active');
    }
}

async function handleSearch() {
    const term = document.getElementById("location-input").value.trim();
    if (!term) return;

    document.getElementById("obs-phrase").innerText = "Locating Coordinates...";
    
    try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=1&language=en&format=json`);
        const data = await res.json();

        if (!data.results || data.results.length === 0) {
            document.getElementById("obs-phrase").innerText = "Unknown Location.";
            return;
        }

        const match = data.results[0];
        currentCoords = `${match.latitude.toFixed(4)},${match.longitude.toFixed(4)}`;
        document.getElementById("location-input").placeholder = match.name;
        document.getElementById("location-input").value = "";
        
        runPrimaryWeatherPipeline();
    } catch (err) {
        document.getElementById("obs-phrase").innerText = "Geocoding Timeout.";
    }
}

async function runPrimaryWeatherPipeline() {
    const lat = currentCoords.split(',')[0];
    const lon = currentCoords.split(',')[1];
    
    document.getElementById("radar-frame").src = `https://radar.weather.gov/withandwithout.php?title=Radar&lat=${lat}&lon=${lon}`;
    
    let pipelineSuccess = false;

    // Route 1: National Weather Service Observation Pipeline
    try {
        const pointRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`, { headers: secureHeaders });
        const pointData = await pointRes.json();
        
        const stationRes = await fetch(pointData.properties.observationStations, { headers: secureHeaders });
        const stationData = await stationRes.json();
        
        if (stationData.features && stationData.features.length > 0) {
            const obsRes = await fetch(`${stationData.features[0].id}/observations/latest`, { headers: secureHeaders });
            const obsData = await obsRes.json();
            const p = obsData.properties;

            if (p.temperature.value !== null) {
                renderNWSMetrics(p);
                pipelineSuccess = true;
            }
        }
        
        executeTimelineFetch(pointData.properties.forecast, pointData.properties.forecastHourly);
    } catch (err) {
        console.warn("Primary database cluster timeout. Routing to secondary high-availability nodes.");
    }

    // Route 2: Open-Meteo High-Availability Backup Stream (Direct Numeric Mapping)
    if (!pipelineSuccess) {
        try {
            const fallback = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code,probability_of_precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timeformat=unixtime&timezone=auto`);
            const fallbackData = await fallback.json();
            
            renderFallbackMetrics(fallbackData.current);
            renderFallbackTimelines(fallbackData.hourly, fallbackData.daily);
        } catch (failErr) {
            document.getElementById("obs-phrase").innerText = "Network Stream Denied.";
        }
    }

    syncActiveWarnings(lat, lon);
}

function renderNWSMetrics(p) {
    const temp = p.temperature.value ? Math.round((p.temperature.value * 9/5) + 32) : 72;
    const dew = p.dewpoint.value ? Math.round((p.dewpoint.value * 9/5) + 32) : 54;
    const heat = p.heatIndex.value ? Math.round((p.heatIndex.value * 9/5) + 32) : temp;
    const wind = p.windSpeed.value ? Math.round(p.windSpeed.value * 0.621371) : 4;
    const rain = p.precipitationLastHour.value ? (p.precipitationLastHour.value / 25.4).toFixed(2) : "0.00";
    const hum = p.relativeHumidity.value ? Math.round(p.relativeHumidity.value) : 55;

    document.getElementById("obs-temp").innerText = `${temp}°`;
    document.getElementById("obs-feels").innerText = `Feels like ${heat}°`;
    document.getElementById("obs-wind").innerText = `${wind} mph`;
    document.getElementById("obs-humidity").innerText = `${hum}%`;
    document.getElementById("obs-dewpoint").innerText = `${dew}°F`;
    document.getElementById("obs-heat").innerText = `${heat}°F`;
    document.getElementById("obs-rain-val").innerText = `${rain} in`;
    
    document.getElementById("obs-phrase").innerText = p.textDescription || "Clear";
    
    // Parse numeric code from NWS icon URL string structure
    let extractedCode = 0;
    if (p.icon) {
        extractedCode = convertNwsUrlToWmoCode(p.icon);
    }
    document.getElementById("current-weather-icon").src = generateIconString(extractedCode);
}

async function executeTimelineFetch(dailyUrl, hourlyUrl) {
    try {
        const hRes = await fetch(hourlyUrl, { headers: secureHeaders });
        const hData = await hRes.json();
        const hourBox = document.getElementById("hourly-scroller");
        hourBox.innerHTML = "";

        const currentPeriod = hData.properties.periods[0];
        if(currentPeriod && currentPeriod.probabilityOfPrecipitation) {
            document.getElementById("obs-rain-chance").innerText = `${currentPeriod.probabilityOfPrecipitation.value || 0}%`;
        }

        hData.properties.periods.slice(0, 24).forEach(slot => {
            const timeLabel = new Date(slot.startTime).toLocaleTimeString([], { hour: '2-digit' });
            const wmoCode = convertNwsUrlToWmoCode(slot.icon);
            hourBox.innerHTML += `
                <div class="h-node">
                    <div class="h-time">${timeLabel}</div>
                    <img class="h-svg" src="${generateIconString(wmoCode)}" alt="Weather Icon" onerror="this.src='icons/na.png';">
                    <div class="h-temp">${slot.temperature}°</div>
                </div>`;
        });

        const dRes = await fetch(dailyUrl, { headers: secureHeaders });
        const dData = await dRes.json();
        const dailyBox = document.getElementById("daily-stack");
        dailyBox.innerHTML = "";
        
        if(dData.properties.periods[0]) {
            document.getElementById("outlook-text-summary").innerText = dData.properties.periods[0].detailedForecast;
            document.getElementById("obs-hilo").innerText = `H: ${dData.properties.periods[0].temperature}°  L: ${dData.properties.periods[1] ? dData.properties.periods[1].temperature : '--'}°`;
        }

        dData.properties.periods.forEach(slot => {
            const wmoCode = convertNwsUrlToWmoCode(slot.icon);
            dailyBox.innerHTML += `
                <div class="v-row">
                    <div class="v-day">${slot.name}</div>
                    <div class="v-icon-frame">
                        <img class="v-svg" src="${generateIconString(wmoCode)}" alt="Weather Icon" onerror="this.src='icons/na.png';">
                    </div>
                    <div class="v-temp">${slot.temperature}°</div>
                    <div class="v-desc">${slot.shortForecast}</div>
                </div>`;
        });
    } catch(err) { console.warn("Chronological sorting bypassed."); }
}

function renderFallbackMetrics(c) {
    document.getElementById("obs-temp").innerText = `${Math.round(c.temperature_2m)}°`;
    document.getElementById("obs-feels").innerText = `Feels like ${Math.round(c.apparent_temperature)}°`;
    document.getElementById("obs-wind").innerText = `${Math.round(c.wind_speed_10m)} mph`;
    document.getElementById("obs-humidity").innerText = `${Math.round(c.relative_humidity_2m)}%`;
    document.getElementById("obs-dewpoint").innerText = `--`;
    document.getElementById("obs-heat").innerText = `${Math.round(c.apparent_temperature)}°F`;
    document.getElementById("obs-rain-val").innerText = `${c.precipitation.toFixed(2)} in`;
    
    const phrase = getWmoPhraseString(c.weather_code);
    document.getElementById("obs-phrase").innerText = phrase;
    document.getElementById("current-weather-icon").src = generateIconString(c.weather_code);
}

function renderFallbackTimelines(h, d) {
    const hourBox = document.getElementById("hourly-scroller");
    hourBox.innerHTML = "";
    
    document.getElementById("obs-rain-chance").innerText = `${h.probability_of_precipitation[0] || 0}%`;

    for(let i=0; i<24; i++) {
        const timeLabel = new Date(h.time[i] * 1000).toLocaleTimeString([], { hour: '2-digit' });
        hourBox.innerHTML += `
            <div class="h-node">
                <div class="h-time">${timeLabel}</div>
                <img class="h-svg" src="${generateIconString(h.weather_code[i])}" alt="Weather Icon" onerror="this.src='icons/na.png';">
                <div class="h-temp">${Math.round(h.temperature_2m[i])}°</div>
            </div>`;
    }

    const dailyBox = document.getElementById("daily-stack");
    dailyBox.innerHTML = "";
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    
    document.getElementById("obs-hilo").innerText = `H: ${Math.round(d.temperature_2m_max[0])}° L: ${Math.round(d.temperature_2m_min[0])}°`;
    document.getElementById("outlook-text-summary").innerText = `Expect ${getWmoPhraseString(d.weather_code[0]).toLowerCase()} conditions today. Surface temperatures tracking towards parameters near ${Math.round(d.temperature_2m_max[0])}°F.`;

    for(let j=0; j<7; j++) {
        const dayLabel = days[new Date(d.time[j] * 1000).getDay()];
        const phrase = getWmoPhraseString(d.weather_code[j]);
        dailyBox.innerHTML += `
            <div class="v-row">
                <div class="v-day">${j === 0 ? 'Today' : dayLabel}</div>
                <div class="v-icon-frame">
                    <img class="v-svg" src="${generateIconString(d.weather_code[j])}" alt="Weather Icon" onerror="this.src='icons/na.png';">
                </div>
                <div class="v-temp">${Math.round(d.temperature_2m_max[j])}°</div>
                <div class="v-desc">${phrase}</div>
            </div>`;
    }
}

// Pads numeric strings to match file system logic (e.g., code 3 becomes "icons/03.png")
function generateIconString(code) {
    const parsed = parseInt(code, 10);
    if (isNaN(parsed) || parsed < 0 || parsed > 99) return "icons/na.png";
    const outputString = String(parsed).padStart(2, '0');
    return `icons/${outputString}.png`;
}

// Back-converts NWS structural text strings into native numerical matches
function convertNwsUrlToWmoCode(url) {
    if (!url) return 0;
    const str = url.toLowerCase();
    if (str.includes("tornado")) return 99;
    if (str.includes("tsra") || str.includes("thunderstorm")) return 95;
    if (str.includes("scttsra")) return 95;
    if (str.includes("snow") || str.includes("blizzard")) return 73;
    if (str.includes("fzra") || str.includes("sleet")) return 66;
    if (str.includes("rain") || str.includes("shra")) return 63;
    if (str.includes("hi_shwrs") || str.includes("drizzle")) return 53;
    if (str.includes("skc") || str.includes("clear") || str.includes("sunny")) return 0;
    if (str.includes("few") || str.includes("sct") || str.includes("partly")) return 2;
    if (str.includes("bkn") || str.includes("ovc") || str.includes("cloudy")) return 3;
    if (str.includes("fog") || str.includes("haze") || str.includes("smoke")) return 45;
    return 0;
}

function getWmoPhraseString(code) {
    if (code === 0) return "Clear Skies";
    if (code === 1) return "Mainly Clear";
    if (code === 2) return "Partly Cloudy";
    if (code === 3) return "Overcast";
    if (code === 45 || code === 48) return "Fog Assets";
    if (code >= 51 && code <= 55) return "Drizzle Activity";
    if (code >= 61 && code <= 65) return "Rain Array";
    if (code === 66 || code === 67) return "Freezing Rain";
    if (code >= 71 && code <= 75) return "Snow Cover";
    if (code === 77) return "Snow Grains";
    if (code >= 80 && code <= 82) return "Rain Showers";
    if (code === 85 || code === 86) return "Snow Showers";
    if (code >= 95) return "Convective Thunderstorms";
    return "Atmospheric Core";
}

async function syncActiveWarnings(lat, lon) {
    const box = document.getElementById("alert-feed-box");
    try {
        const res = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, { headers: secureHeaders });
        const data = await res.json();
        const list = data.features || [];

        if (list.length === 0) {
            box.innerHTML = `<p class="status-msg">No active hazard briefs tracked for this sector grid.</p>`;
            return;
        }

        box.innerHTML = "";
        list.forEach(item => {
            const p = item.properties;
            const nm = p.event.toLowerCase();
            const priority = nm.includes("watch") || nm.includes("warning") || nm.includes("emergency");
            box.innerHTML += `
                <div class="bulletin-card ${priority ? 'priority' : ''}">
                    <h4>${p.event}</h4>
                    <p>${p.headline || "Processing real-time diagnostic hazard arrays..."}</p>
                </div>`;
        });
    } catch(err) {
        box.innerHTML = `<p class="status-msg text-danger">Alert data sync handshake lost.</p>`;
    }
}
