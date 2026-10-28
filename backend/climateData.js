// ========================================
// CLIMATE DATA SERVICE
// ========================================

// -------------------------------
// WEATHER
// -------------------------------

async function getWeather(latitude, longitude) {

    const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${latitude}` +
        `&longitude=${longitude}` +
        `&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code` +
        `&hourly=temperature_2m,precipitation,relative_humidity_2m,wind_speed_10m` +
        `&forecast_days=3` +
        `&timezone=auto`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("Weather API failed");
    }

    const data = await response.json();

    return {
        latitude: data.latitude,
        longitude: data.longitude,
        timezone: data.timezone,

        current: data.current,

        hourly: data.hourly
    };
}


// -------------------------------
// AIR QUALITY
// -------------------------------

async function getAirQuality(latitude, longitude) {

    const url =
        `https://air-quality-api.open-meteo.com/v1/air-quality` +
        `?latitude=${latitude}` +
        `&longitude=${longitude}` +
        `&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_dioxide` +
        `&hourly=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone` +
        `&forecast_days=2` +
        `&timezone=auto`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("Air Quality API failed");
    }

    const data = await response.json();

    return {
        latitude: data.latitude,
        longitude: data.longitude,
        timezone: data.timezone,

        current: data.current,

        hourly: data.hourly
    };
}


// -------------------------------
// FLOOD INTELLIGENCE
// -------------------------------

async function getFloodData(latitude, longitude) {

    const url =
        `https://flood-api.open-meteo.com/v1/flood` +
        `?latitude=${latitude}` +
        `&longitude=${longitude}` +
        `&daily=river_discharge,river_discharge_mean,river_discharge_max` +
        `&forecast_days=30`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("Flood API failed");
    }

    const data = await response.json();

    return {
        latitude: data.latitude,
        longitude: data.longitude,
        daily: data.daily
    };
}


// -------------------------------
// CLIMATE PREDICTION
// -------------------------------

async function getClimatePrediction(latitude, longitude) {

    const url =
        `https://climate-api.open-meteo.com/v1/climate` +
        `?latitude=${latitude}` +
        `&longitude=${longitude}` +
        `&start_date=2026-01-01` +
        `&end_date=2030-12-31` +
        `&models=EC_Earth3P_HR` +
        `&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("Climate API failed");
    }

    const data = await response.json();

    return {
        latitude: data.latitude,
        longitude: data.longitude,
        daily: data.daily
    };
}


// -------------------------------
// NASA SATELLITE IMAGE
// -------------------------------

function getSatelliteImage(latitude, longitude) {

    const today = new Date();

    const date =
        today.toISOString().split("T")[0];

    const bbox = [
        longitude - 5,
        latitude - 5,
        longitude + 5,
        latitude + 5
    ].join(",");

    const url =
        `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi` +
        `?SERVICE=WMS` +
        `&VERSION=1.3.0` +
        `&REQUEST=GetMap` +
        `&LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor` +
        `&STYLES=` +
        `&FORMAT=image/jpeg` +
        `&CRS=EPSG:4326` +
        `&BBOX=${bbox}` +
        `&WIDTH=900` +
        `&HEIGHT=600` +
        `&TIME=${date}`;

    return {
        source: "NASA GIBS",
        date,
        latitude,
        longitude,
        imageUrl: url
    };
}


// -------------------------------
// WILDFIRE / THERMAL ANOMALIES
// -------------------------------

function getWildfireImage(latitude, longitude) {

    const today = new Date();

    const date =
        today.toISOString().split("T")[0];

    const bbox = [
        longitude - 5,
        latitude - 5,
        longitude + 5,
        latitude + 5
    ].join(",");

    const url =
        `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi` +
        `?SERVICE=WMS` +
        `&VERSION=1.1.1` +
        `&REQUEST=GetMap` +
        `&LAYERS=VIIRS_NOAA20_Thermal_Anomalies_375m_All` +
        `&STYLES=` +
        `&FORMAT=image/png` +
        `&SRS=EPSG:4326` +
        `&BBOX=${bbox}` +
        `&WIDTH=900` +
        `&HEIGHT=600` +
        `&TIME=${date}` +
        `&TRANSPARENT=TRUE`;

    return {
        source: "NASA GIBS VIIRS",
        date,
        latitude,
        longitude,
        imageUrl: url
    };
}


// -------------------------------
// EXPORT
// -------------------------------

export {

    getWeather,
    getAirQuality,
    getFloodData,
    getClimatePrediction,
    getSatelliteImage,
    getWildfireImage

};