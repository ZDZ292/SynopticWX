let currentCoords = "40.7128,-74.0060"; // Base global anchor coordinates

const secureHeaders = {
    "User-Agent": "SlateWeatherPRO/5.0 (contact: github-deploy-matrix)"
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
    
    // Sync both pill and bottom navigation buttons simultaneously
    if (sectId === 'sec-today') {
        document.querySelector('.section-pill[onclick*="sec-today"]').classList.add('active');
        document.querySelector('.nav-item[onclick*="sec-today"]').classList.add('active');
    } else if (sectId === 'sec-hourly') {
        document.querySelector('.section-pill[onclick*="sec-hourly"]').classList.add('active');
    } else if (sectId === 'sec-storms') {
        document.querySelector('.section-pill[onclick*="sec-storms"]').classList.add('active');
        document.querySelector('.nav-item[onclick*="sec-storms"]').classList.add('active');
    } else if (sectId === 'sec-radar') {
        document.querySelector('.nav-item[onclick*="sec-radar"]').classList.add('active');
    }
}

// Quick smooth viewport scroll helper to mimic application behavior
function sectionScroll(sectId) {
    switchSection('sec-today');
    setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 50);
}

async function handleSearch() {
    const term = document.getElementById("location-input").value.trim();
    if (!term) return;

    document.getElementById("obs-phrase").innerText = "Locating grid context...";
    
    try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=1&language=en&format=json`);
        const data = await res.json();

        if (!data.results || data.results.length === 0) {
            document.getElementById("obs-phrase").innerText = "Location untracked.";
            return;
        }

        const match = data.results[0];
        currentCoords = `${match.latitude.toFixed(4)},${match.longitude.toFixed(4)}`;
        document.getElementById("location-input").placeholder = match.name;
        document.getElementById("location-input").value = "";
        
        runPrimaryWeatherPipeline();
    } catch (err) {
        document.getElementById("obs-phrase").innerText = "Geocoding connection lost.";
    }
}

async function runPrimaryWeatherPipeline() {
    const lat = currentCoords.split(',')[0];
    const lon = currentCoords.split(',')[1];
    
    document.getElementById("radar-frame").src = `https://radar.weather.gov/withandwithout.php?title=Radar&lat=${lat}&lon=${lon}`;
    
    let pipelineSuccess = false;

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
        console.warn("Primary database node reporting null telemetry. Engaging failback logic.");
    }

    // Emergency Core Fallback Stream (Runs instantly if airport telemetry goes offline)
    if (!pipelineSuccess) {
        try {
            const fallback = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code,probability_of_precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timeformat=unixtime&timezone=auto`);
            const fallbackData = await fallback.json();
            
            renderFallbackMetrics(fallbackData.current);
            renderFallbackTimelines(fallbackData.hourly, fallbackData.daily);
        } catch (failErr) {
            document.getElementById("obs-phrase").innerText = "All network pipelines rejected.";
        }
    }

    syncActiveWarnings(lat, lon);
}

function renderNWSMetrics(p) {
    const temp = p.temperature.value ? Math.round((p.temperature.value * 9/5) + 32) : 70;
    const dew = p.dewpoint.value ? Math.round((p.dewpoint.value * 9/5) + 32) : 55;
    const heat = p.heatIndex.value ? Math.round((p.heatIndex.value * 9/5) + 32) : temp;
    const wind = p.windSpeed.value ? Math.round(p.windSpeed.value * 0.621371) : 0;
    const rain = p.precipitationLastHour.value ? (p.precipitationLastHour.value / 25.4).toFixed(2) : "0.00";
    const hum = p.relativeHumidity.value ? Math.round(p.relativeHumidity.value) : 50;

    document.getElementById("obs-temp").innerText = `${temp}°`;
    document.getElementById("obs-feels").innerText = `Feels like ${heat}°`;
    document.getElementById("obs-wind").innerText = `${wind} mph`;
    document.getElementById("obs-humidity").innerText = `${hum}%`;
    document.getElementById("obs-dewpoint").innerText = `${dew}°F`;
    document.getElementById("obs-heat").innerText = `${heat}°F`;
    document.getElementById("obs-rain-val").innerText = `${rain} in`;
    document.getElementById("obs-phrase").innerText = p.textDescription || "Clear Skies";
    document.getElementById("current-weather-icon").src = fetchAnimatedCDNPath(p.textDescription);
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
            hourBox.innerHTML += `
                <div class="h-node">
                    <div class="h-time">${timeLabel}</div>
                    <img class="h-svg" src="${fetchAnimatedCDNPath(slot.shortForecast)}" alt="Status">
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
            dailyBox.innerHTML += `
                <div class="v-row">
                    <div class="v-day">${slot.name}</div>
                    <div class="v-icon-frame">
                        <img class="v-svg" src="${fetchAnimatedCDNPath(slot.shortForecast)}" alt="Status">
                    </div>
                    <div class="v-temp">${slot.temperature}°</div>
                    <div class="v-desc">${slot.shortForecast}</div>
                </div>`;
        });
    } catch(err) { console.warn("Timeline fetch bypassed."); }
}

function renderFallbackMetrics(c) {
    const temp = Math.round(c.temperature_2m);
    const feels = Math.round(c.apparent_temperature);
    const phrase = translateWMOCode(c.weather_code);

    document.getElementById("obs-temp").innerText = `${temp}°`;
    document.getElementById("obs-feels").innerText = `Feels like ${feels}°`;
    document.getElementById("obs-wind").innerText = `${Math.round(c.wind_speed_10m)} mph`;
    document.getElementById("obs-humidity").innerText = `${Math.round(c.relative_humidity_2m)}%`;
    document.getElementById("obs-dewpoint").innerText = `--`;
    document.getElementById("obs-heat").innerText = `${feels}°F`;
    document.getElementById("obs-rain-val").innerText = `${c.precipitation.toFixed(2)} in`;
    document.getElementById("obs-phrase").innerText = phrase;
    document.getElementById("current-weather-icon").src = fetchAnimatedCDNPath(phrase);
}

function renderFallbackTimelines(h, d) {
    const hourBox = document.getElementById("hourly-scroller");
    hourBox.innerHTML = "";
    
    document.getElementById("obs-rain-chance").innerText = `${h.probability_of_precipitation[0] || 0}%`;

    for(let i=0; i<24; i++) {
        const timeLabel = new Date(h.time[i] * 1000).toLocaleTimeString([], { hour: '2-digit' });
        const phrase = translateWMOCode(h.weather_code[i]);
        hourBox.innerHTML += `
            <div class="h-node">
                <div class="h-time">${timeLabel}</div>
                <img class="h-svg" src="${fetchAnimatedCDNPath(phrase)}" alt="Status">
                <div class="h-temp">${Math.round(h.temperature_2m[i])}°</div>
            </div>`;
    }

    const dailyBox = document.getElementById("daily-stack");
    dailyBox.innerHTML = "";
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    
    document.getElementById("obs-hilo").innerText = `H: ${Math.round(d.temperature_2m_max[0])}° L: ${Math.round(d.temperature_2m_min[0])}°`;
    document.getElementById("outlook-text-summary").innerText = `Expect ${translateWMOCode(d.weather_code[0]).toLowerCase()} conditions today. Surface temperatures tracking towards peak day boundaries near ${Math.round(d.temperature_2m_max[0])}°F.`;

    for(let j=0; j<7; j++) {
        const dayLabel = days[new Date(d.time[j] * 1000).getDay()];
        const phrase = translateWMOCode(d.weather_code[j]);
        dailyBox.innerHTML += `
            <div class="v-row">
                <div class="v-day">${j === 0 ? 'Today' : dayLabel}</div>
                <div class="v-icon-frame">
                    <img class="v-svg" src="${fetchAnimatedCDNPath(phrase)}" alt="Status">
                </div>
                <div class="v-temp">${Math.round(d.temperature_2m_max[j])}°</div>
                <div class="v-desc">${phrase}</div>
            </div>`;
    }
}

// Content-Aware Text Translation Engine to Pull Live SVGs
function fetchAnimatedCDNPath(desc) {
    const rootPath = "https://basmielen.github.io/weather-icons/production/fill/all/";
    // Secure Fallback Target Base
    const base = "https://basmimus.github.io/weather-icons/production/fill/all/";
    const cdn = "https://basmili3s.github.io/weather-icons/production/fill/all/";
    const targetUrl = "https://basmilis.github.io/weather-icons/production/fill/all/";
    
    if (!desc) return `${targetUrl}cloudy.svg`;
    const text = desc.toLowerCase();

    if (text.includes("tornado")) return `${targetUrl}tornado.svg`;
    if (text.includes("thunderstorm") || text.includes("tsra") || text.includes("severe")) return `${targetUrl}thunderstorms-extreme.svg`;
    if (text.includes("heavy snow")) return `${targetUrl}extreme-snow.svg`;
    if (text.includes("snow showers") || text.includes("flurries") || text.includes("snow")) return `${targetUrl}snow.svg`;
    if (text.includes("heavy rain") || text.includes("squall")) return `${targetUrl}extreme-rain.svg`;
    if (text.includes("rain") || text.includes("drizzle") || text.includes("showers")) return `${targetUrl}rain.svg`;
    if (text.includes("mostly cloudy") || text.includes("broken") || text.includes("overcast")) return `${targetUrl}cloudy.svg`;
    if (text.includes("partly cloudy") || text.includes("scattered")) return `${targetUrl}partly-cloudy-day.svg`;
    if (text.includes("clear") || text.includes("fair") || text.includes("sunny")) return `${targetUrl}clear-day.svg`;
    if (text.includes("fog") || text.includes("mist")) return `${targetUrl}fog.svg`;

    return `${targetUrl}cloudy.svg`;
}

function translateWMOCode(code) {
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

async function syncActiveWarnings(lat, lon) {
    const box = document.getElementById("alert-feed-box");
    try {
        const res = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, { headers: secureHeaders });
        const data = await res.json();
        const list = data.features || [];

        if (list.length === 0) {
            box.innerHTML = `<p class="status-msg">No active severe weather warnings for this micro-grid sector.</p>`;
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
                    <p>${p.headline || "Parsing real-time hazard broadcast strings..."}</p>
                </div>`;
        });
    } catch(err) {
        box.innerHTML = `<p class="status-msg text-danger">Hazard loop handshake timed out.</p>`;
    }
}
