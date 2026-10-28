import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const providerCache = new Map();
const requestWindows = new Map();

function rateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.baseUrl || ""}${req.path}:${req.ip || req.socket.remoteAddress}`;
    const current = requestWindows.get(key);
    const bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;
    bucket.count += 1;
    requestWindows.set(key, bucket);
    if (requestWindows.size > 10000) {
      for (const [requestKey, value] of requestWindows) {
        if (value.resetAt <= now) requestWindows.delete(requestKey);
      }
    }
    if (bucket.count > max) {
      res.set("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ error: "Too many requests. Please wait before retrying." });
    }
    next();
  };
}

async function cachedProviderData(key, ttlMs, load) {
  const cached = providerCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const pending = cached?.pending || load();
  providerCache.set(key, { pending, expiresAt: Date.now() + ttlMs });
  try {
    const value = await pending;
    providerCache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  } catch (error) {
    providerCache.delete(key);
    throw error;
  }
}

const configuredFrontendOrigin =
  process.env.FRONTEND_URL || "http://localhost:5173";

app.use(cors({
  origin(origin, callback) {
    if (
      !origin ||
      origin === configuredFrontendOrigin ||
      /^https?:\/\/(localhost|127\.0\.0\.1):(?:517[3-9]|518\d|519\d)$/.test(origin)
    ) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin is not allowed by CORS."));
  }
}));
app.use(express.json({ limit: "1mb" }));
app.use("/api", rateLimit({ windowMs: 60 * 1000, max: 90 }));

const BENGALURU = {
  name: "Bengaluru",
  latitude: 12.9716,
  longitude: 77.5946
};

const WEATHER_CODE_DESCRIPTIONS = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail"
};

function getCoordinates(query) {
  if (
    query.latitude == null ||
    query.longitude == null ||
    String(query.latitude).trim() === "" ||
    String(query.longitude).trim() === ""
  ) return null;
  const latitude = Number(query.latitude);
  const longitude = Number(query.longitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

async function fetchWeather(latitude, longitude) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code",
    hourly: "temperature_2m,precipitation_probability,weather_code",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
    timezone: "auto",
    forecast_days: "5"
  }).toString();

  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Weather provider returned an error");
  const data = await response.json();
  if (!data.current || typeof data.current !== "object") {
    throw new Error("Weather provider response was invalid");
  }
  return data;
}

function getLocationName(query, coordinates) {
  const name = String(query.name || "").trim().slice(0, 100);
  const country = String(query.country || "").trim().slice(0, 100);
  return {
    name: name || "Selected location",
    country,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude
  };
}

function sanitizeAiInterpretation(answer, climateAnomaly) {
  const pollutantPattern =
    /\b(?:pm\s*2(?:[._ ]?5)?|pm\s*10|ozone|carbon monoxide|nitrogen dioxide|sulphur dioxide|sulfur dioxide)\b/i;
  const unitPattern =
    /(?:[μµu]g\s*\/\s*m(?:³|3)|mg\s*\/\s*m(?:³|3)|g\s*\/\s*m(?:³|3)|\bppb\b|\bppm\b|micrograms? per cubic meter)/i;
  let removedValues = false;
  const lines = answer.split(/\r?\n/).filter((line) => {
    const mentionsPollutant = pollutantPattern.test(line);
    const containsConcentration =
      /\d/.test(line) ||
      unitPattern.test(line) ||
      /\b(current|source unit|concentration)\b/i.test(line);
    if (mentionsPollutant && containsConcentration) {
      removedValues = true;
      return false;
    }
    if (removedValues && /^\s*[*#\s]*source unit\s*:?\s*[*#\s]*$/i.test(line)) {
      return false;
    }
    return true;
  });
  const caveat = climateAnomaly
    ? "Historical comparison limitation: this is one current model-temperature value compared with a 1991–2020 daily baseline using a ±7-calendar-day matching window; it is not a climate trend."
    : "Long-term climate limitation: no multi-year trend dataset was supplied, so these current conditions cannot establish a local climate trend.";
  const sanitizedLines = [];
  let suppressClimateSection = false;
  let caveatAdded = false;
  for (const line of lines) {
    const isHeading = /^\s*(?:\*\*[^*]+\*\*|#{1,6}\s+.+)\s*$/.test(line);
    if (isHeading) {
      const headingText = line.replace(/[*#]/g, "").trim();
      if (/\b(?:long[- ]term climate|climate trend|climate outlook|long[- ]term trend)\b/i.test(headingText)) {
        sanitizedLines.push(caveat);
        suppressClimateSection = true;
        caveatAdded = true;
        continue;
      }
      suppressClimateSection = false;
    }
    if (suppressClimateSection) continue;

    if (/\b(?:trend shows|trend indicates|steady increase|steadily increasing|region experiences a gradual|typical for the .{0,40}season)\b/i.test(line)) {
      sanitizedLines.push(caveat);
      caveatAdded = true;
      continue;
    }
    if (
      !climateAnomaly &&
      /\b(?:no|not)\b.{0,80}\bhistorical daily comparison\b.{0,60}\b(?:available|included|provided|supplied)\b/i.test(line)
    ) {
      sanitizedLines.push("A historical daily comparison was not included in this analysis. Select the Climate anomalies layer to load the 1991–2020 comparison.");
      continue;
    }
    if (
      climateAnomaly &&
      /\b(?:only|just)\b.{0,100}\b(?:spans?|covers?|lasts?)\s+(?:only\s+)?7 days?\b/i.test(line)
    ) {
      sanitizedLines.push("The ±7-calendar-day matching window is applied within the 1991–2020 archive; it is not the duration of the historical baseline.");
      caveatAdded = true;
      continue;
    }
    sanitizedLines.push(line);
  }
  if (!caveatAdded) sanitizedLines.push(caveat);

  return {
    answer: sanitizedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    removedValues
  };
}

app.get("/api/health", (_req, res) => {
  const aiProvider = (process.env.AI_PROVIDER || "ollama").trim().toLowerCase();
  res.json({
    status: "online",
    project: "ClimateTech GenAI",
    aiProvider,
    aiModel: aiProvider === "openai-compatible"
      ? process.env.AI_MODEL || null
      : process.env.OLLAMA_MODEL || "llama3.2:3b"
  });
});

app.get("/api/environment/events", async (_req, res) => {
  try {
    const events = await cachedProviderData("eonet-open-events", 5 * 60 * 1000, async () => {
      const response = await fetch("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100", {
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error("NASA EONET returned an error");
      const payload = await response.json();
      if (!Array.isArray(payload.events)) throw new Error("NASA EONET response was invalid");

      return payload.events.flatMap((event) => {
        const geometries = Array.isArray(event.geometry) ? event.geometry : [];
        const latest = geometries.at(-1);
        const coordinates = latest?.coordinates;
        if (!coordinates) return [];
        const points = [];
        const collectPoints = (value) => {
          if (
            Array.isArray(value) && value.length >= 2 &&
            Number.isFinite(value[0]) && Number.isFinite(value[1])
          ) {
            points.push(value);
          } else if (Array.isArray(value)) {
            value.forEach(collectPoints);
          }
        };
        collectPoints(coordinates);
        if (!points.length) return [];
        const longitude = points.reduce((sum, point) => sum + point[0], 0) / points.length;
        const latitude = points.reduce((sum, point) => sum + point[1], 0) / points.length;
        return [{
          id: event.id,
          title: event.title,
          description: event.description || "",
          link: event.link || "",
          closed: event.closed || null,
          categories: (event.categories || []).map(({ id, title }) => ({ id, title })),
          sources: (event.sources || []).map(({ id, url }) => ({ id, url })),
          date: latest.date || null,
          magnitude: latest.magnitudeValue ?? null,
          magnitudeUnit: latest.magnitudeUnit || null,
          magnitudeDescription: latest.magnitudeDescription || null,
          latitude,
          longitude,
          coordinateApproximation: points.length > 1 ? "geometry centroid" : null
        }];
      });
    });

    res.json({ events, source: "NASA EONET", status: "open", cachedForSeconds: 300 });
  } catch (error) {
    console.error("NASA EONET error:", error.message);
    res.status(502).json({ error: "Unable to load NASA environmental events right now." });
  }
});

app.get("/api/climate/indicators", async (_req, res) => {
  try {
    const indicators = await cachedProviderData("climate-indicators", 6 * 60 * 60 * 1000, async () => {
      const [temperatureResult, co2Result] = await Promise.allSettled([
        (async () => {
          const response = await fetch(
            "https://berkeley-earth-temperature.s3.us-west-1.amazonaws.com/Global/Land_and_Ocean_complete.txt",
            { signal: AbortSignal.timeout(15000) }
          );
          if (!response.ok) throw new Error("Berkeley Earth returned an error");
          return response.text();
        })(),
        (async () => {
          const response = await fetch("https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_mlo.txt", {
            signal: AbortSignal.timeout(15000)
          });
          if (!response.ok) throw new Error("NOAA returned an error");
          return response.text();
        })()
      ]);

      const temperatureRecords = temperatureResult.status === "fulfilled"
        ? temperatureResult.value.split(/\r?\n/).flatMap((line) => {
            const fields = line.trim().split(/\s+/);
            const year = Number(fields[0]);
            const month = Number(fields[1]);
            const anomalyC = Number(fields[2]);
            return Number.isInteger(year) && month >= 1 && month <= 12 && Number.isFinite(anomalyC)
              ? [{ year, month, anomalyC }]
              : [];
          })
        : [];
      const co2Records = co2Result.status === "fulfilled"
        ? co2Result.value.split(/\r?\n/).flatMap((line) => {
        const fields = line.trim().split(/\s+/);
        if (!/^\d{4}$/.test(fields[0] || "")) return [];
        const year = Number(fields[0]);
        const month = Number(fields[1]);
        const ppm = Number(fields[3]);
        const standardDeviation = Number(fields[6]);
        const uncertainty = Number(fields[7]);
        return month >= 1 && month <= 12 && Number.isFinite(ppm) && ppm > 0
          ? [{
              year,
              month,
              ppm,
              quality: standardDeviation < 0 || uncertainty < 0 ? "interpolated" : "measured"
            }]
          : [];
        })
        : [];
      const latest = (records) => records.at(-1);
      if (!temperatureRecords.length && !co2Records.length) {
        throw new Error("Neither climate indicator provider returned valid data");
      }
      const latestTemperature = latest(temperatureRecords);
      const latestCo2 = latest(co2Records);
      return {
        globalTemperature: latestTemperature ? {
          ...latestTemperature,
          unit: "°C",
          baseline: "1951–1980",
          source: "Berkeley Earth global land-ocean temperature",
          sourceUrl: "https://berkeley-earth-temperature.s3.us-west-1.amazonaws.com/Global/Land_and_Ocean_complete.txt",
          updatedAt: `${latestTemperature.year}-${String(latestTemperature.month).padStart(2, "0")}`
        } : null,
        atmosphericCo2: latestCo2 ? {
          ...latestCo2,
          unit: "ppm",
          location: "Mauna Loa Observatory",
          source: "NOAA Global Monitoring Laboratory",
          sourceUrl: "https://gml.noaa.gov/ccgg/trends/data.html",
          updatedAt: `${latestCo2.year}-${String(latestCo2.month).padStart(2, "0")}`
        } : null,
        history: {
          temperature: temperatureRecords.slice(-24),
          co2: co2Records.slice(-24)
        },
        fetchedAt: new Date().toISOString(),
        warnings: [
          temperatureResult.status === "rejected" ? "Global temperature data is temporarily unavailable." : null,
          co2Result.status === "rejected" ? "Atmospheric CO₂ data is temporarily unavailable." : null
        ].filter(Boolean)
      };
    });
    res.json(indicators);
  } catch (error) {
    console.error("Climate indicators error:", error.message);
    res.status(502).json({ error: "Unable to load global climate indicators right now." });
  }
});

app.get("/api/weather", async (req, res) => {
  const coordinates = getCoordinates(req.query);
  if (!coordinates) {
    return res.status(400).json({ error: "Valid latitude and longitude are required." });
  }

  try {
    const data = await fetchWeather(coordinates.latitude, coordinates.longitude);

    res.json({
      location: getLocationName(req.query, coordinates),
      timezone: data.timezone || null,
      current: data.current,
      units: data.current_units,
      hourly: {
        time: data.hourly?.time?.slice(0, 12) || [],
        temperature: data.hourly?.temperature_2m?.slice(0, 12) || [],
        rainChance: data.hourly?.precipitation_probability?.slice(0, 12) || [],
        weatherCode: data.hourly?.weather_code?.slice(0, 12) || []
      },
      daily: data.daily,
      dailyUnits: data.daily_units,
      source: "Open-Meteo"
    });
  } catch (error) {
    console.error("Weather error:", error.message);
    res.status(502).json({
      error: "Unable to load weather data right now."
    });
  }
});

app.get("/api/air-quality", async (req, res) => {
  const coordinates = getCoordinates(req.query);
  if (!coordinates) {
    return res.status(400).json({ error: "Valid latitude and longitude are required." });
  }

  try {
    const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
    url.search = new URLSearchParams({
      latitude: String(coordinates.latitude),
      longitude: String(coordinates.longitude),
      current: "pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone",
      timezone: "auto"
    }).toString();

    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Air quality provider returned an error");
    const data = await response.json();
    if (!data.current || typeof data.current !== "object") {
      throw new Error("Air quality provider response was invalid");
    }

    res.json({
      current: data.current,
      units: data.current_units,
      source: "Open-Meteo Air Quality",
      location: getLocationName(req.query, coordinates)
    });
  } catch (error) {
    console.error("Air quality error:", error.message);
    res.status(502).json({ error: "Unable to load air quality data right now." });
  }
});

app.get("/api/geocode", async (req, res) => {
  const query = String(req.query.q || "").trim().slice(0, 100);
  if (query.length < 2) {
    return res.status(400).json({ error: "Search for at least two characters." });
  }

  try {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.search = new URLSearchParams({
      name: query,
      count: "8",
      language: "en",
      format: "json"
    }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Geocoding provider returned an error");
    const data = await response.json();
    if (data.results != null && !Array.isArray(data.results)) {
      throw new Error("Geocoding provider response was invalid");
    }

    res.json({
      results: (data.results || []).map((item) => ({
        name: item.name,
        country: item.country,
        admin1: item.admin1 || "",
        latitude: item.latitude,
        longitude: item.longitude
      }))
    });
  } catch (error) {
    console.error("Geocoding error:", error.message);
    res.status(502).json({ error: "Unable to search locations right now." });
  }
});

app.post("/api/monitoring", async (req, res) => {
  const requestedLocations = req.body?.locations;
  if (
    !Array.isArray(requestedLocations) ||
    requestedLocations.length < 1 ||
    requestedLocations.length > 12
  ) {
    return res.status(400).json({
      error: "Provide between 1 and 12 monitoring locations."
    });
  }

  const locations = requestedLocations.map((location) => {
    const coordinates = getCoordinates(location || {});
    if (!coordinates) return null;
    return {
      ...getLocationName(location, coordinates),
      name: String(location.name || "Monitoring location").trim().slice(0, 100),
      country: String(location.country || "").trim().slice(0, 100)
    };
  });

  if (locations.some((location) => location === null)) {
    return res.status(400).json({
      error: "Every monitoring location must have valid coordinates."
    });
  }

  try {
    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
    weatherUrl.search = new URLSearchParams({
      latitude: locations.map(({ latitude }) => latitude).join(","),
      longitude: locations.map(({ longitude }) => longitude).join(","),
      current: "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,weather_code",
      timezone: "auto"
    }).toString();

    const airUrl = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
    airUrl.search = new URLSearchParams({
      latitude: locations.map(({ latitude }) => latitude).join(","),
      longitude: locations.map(({ longitude }) => longitude).join(","),
      current: "pm2_5,pm10",
      timezone: "auto"
    }).toString();

    const [weatherResult, airResult] = await Promise.allSettled([
      fetch(weatherUrl, { signal: AbortSignal.timeout(12000) }),
      fetch(airUrl, { signal: AbortSignal.timeout(12000) })
    ]);
    if (weatherResult.status === "rejected") throw weatherResult.reason;
    const weatherResponse = weatherResult.value;
    const airResponse = airResult.status === "fulfilled" ? airResult.value : null;
    if (!weatherResponse.ok) throw new Error("Open-Meteo monitoring request failed");
    const [weatherData, airData] = await Promise.all([
      weatherResponse.json(),
      airResponse?.ok ? airResponse.json() : Promise.resolve([])
    ]);

    const weatherStations = Array.isArray(weatherData) ? weatherData : [weatherData];
    const airStations = Array.isArray(airData) ? airData : [airData];
    res.json({
      locations: locations.map((location, index) => ({
        ...location,
        weather: weatherStations[index]?.current || null,
        airQuality: airStations[index]?.current || null
      })),
      source: "Open-Meteo",
      airQualityAvailable: Boolean(airResponse?.ok),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Monitoring data error:", error.message);
    res.status(502).json({
      error: "Unable to load global monitoring data right now."
    });
  }
});

app.get("/api/climate-anomaly", async (req, res) => {
  const coordinates = getCoordinates(req.query);
  if (!coordinates) {
    return res.status(400).json({
      error: "Valid latitude and longitude are required."
    });
  }

  try {
    const archiveUrl = new URL("https://archive-api.open-meteo.com/v1/archive");
    archiveUrl.search = new URLSearchParams({
      latitude: String(coordinates.latitude),
      longitude: String(coordinates.longitude),
      start_date: "1991-01-01",
      end_date: "2020-12-31",
      daily: "temperature_2m_mean",
      timezone: "auto"
    }).toString();

    const [weather, archiveResponse] = await Promise.all([
      fetchWeather(coordinates.latitude, coordinates.longitude),
      fetch(archiveUrl, { signal: AbortSignal.timeout(20000) })
    ]);
    if (!archiveResponse.ok) {
      throw new Error("Open-Meteo historical baseline request failed");
    }
    const archive = await archiveResponse.json();
    const currentAt = weather.current?.time;
    const currentTemperatureC = weather.current?.temperature_2m;
    if (!currentAt || !Number.isFinite(currentTemperatureC)) {
      return res.status(502).json({
        error: "Current temperature is unavailable for comparison."
      });
    }

    const currentDate = new Date(`${currentAt.slice(0, 10)}T00:00:00Z`);
    const referenceDay = new Date(Date.UTC(
      2001,
      currentDate.getUTCMonth(),
      currentDate.getUTCDate()
    ));
    const referenceDayOfYear = Math.floor(
      (referenceDay.getTime() - Date.UTC(2001, 0, 1)) / 86400000
    );
    const baselineValues = (archive.daily?.time || []).flatMap((date, index) => {
      const value = archive.daily?.temperature_2m_mean?.[index];
      if (!Number.isFinite(value)) return [];
      const archiveDate = new Date(`${date}T00:00:00Z`);
      const normalizedDate = new Date(Date.UTC(
        2001,
        archiveDate.getUTCMonth(),
        archiveDate.getUTCDate()
      ));
      const dayOfYear = Math.floor(
        (normalizedDate.getTime() - Date.UTC(2001, 0, 1)) / 86400000
      );
      const difference = Math.abs(dayOfYear - referenceDayOfYear);
      return [Math.min(difference, 365 - difference) <= 7 ? value : null];
    }).filter(Number.isFinite);

    if (baselineValues.length < 30) {
      throw new Error("Historical baseline has insufficient daily observations");
    }

    const baselineMeanC =
      baselineValues.reduce((sum, value) => sum + value, 0) / baselineValues.length;
    res.json({
      location: getLocationName(req.query, coordinates),
      currentAt,
      currentTemperatureC,
      baselineMeanC: Number(baselineMeanC.toFixed(2)),
      departureC: Number((currentTemperatureC - baselineMeanC).toFixed(2)),
      baselinePeriod: "1991–2020",
      calendarWindowDays: "±7 days",
      sampleCount: baselineValues.length,
      source: "Open-Meteo current weather model and historical archive",
      note: "A single current model-temperature comparison with a historical daily baseline; not evidence of a climate trend."
    });
  } catch (error) {
    console.error("Climate anomaly error:", error.message);
    res.status(502).json({
      error: "Unable to calculate the historical temperature comparison."
    });
  }
});

app.get("/api/flood", async (req, res) => {
  const coordinates = getCoordinates(req.query);
  if (!coordinates) {
    return res.status(400).json({ error: "Valid latitude and longitude are required." });
  }

  try {
    const url = new URL("https://flood-api.open-meteo.com/v1/flood");
    url.search = new URLSearchParams({
      latitude: String(coordinates.latitude),
      longitude: String(coordinates.longitude),
      daily: "river_discharge,river_discharge_mean,river_discharge_max",
      forecast_days: "30"
    }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Open-Meteo Flood API returned an error");
    const data = await response.json();
    if (!data.daily || !Array.isArray(data.daily.time)) {
      throw new Error("Open-Meteo Flood API response was invalid");
    }
    res.json({
      location: getLocationName(req.query, coordinates),
      daily: data.daily,
      units: data.daily_units || {},
      source: "Open-Meteo Flood API",
      limitation: "River-discharge model forecast only. No flood probability or validated risk category is provided."
    });
  } catch (error) {
    console.error("Flood forecast error:", error.message);
    res.status(502).json({ error: "Unable to load modeled river-discharge data right now." });
  }
});

app.get("/api/flood-alerts", async (_req, res) => {
  try {
    const result = await cachedProviderData("gdacs-flood-alerts", 5 * 60 * 1000, async () => {
      const response = await fetch("https://www.gdacs.org/xml/rss_24h.xml", {
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error("GDACS flood feed returned an error");
      const xml = await response.text();
      if (!xml.includes("<rss") || !xml.includes("<channel>")) {
        throw new Error("GDACS flood feed response was invalid");
      }

      const readTag = (item, tag) =>
        item.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, "i"))?.[1]?.trim() || "";
      const alerts = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
        .flatMap(([, item]) => {
          if (readTag(item, "gdacs:eventtype") !== "FL") return [];
          const alertLevel = readTag(item, "gdacs:alertlevel");
          const latitude = Number(readTag(item, "geo:lat"));
          const longitude = Number(readTag(item, "geo:long"));
          const id = readTag(item, "gdacs:eventid");
          if (
            !["Green", "Orange", "Red"].includes(alertLevel) ||
            readTag(item, "gdacs:iscurrent").toLowerCase() !== "true" ||
            !id ||
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
          ) return [];

          return [{
            id,
            title: readTag(item, "title") || "GDACS flood event",
            alertLevel,
            latitude,
            longitude,
            updatedAt: readTag(item, "gdacs:datemodified") || readTag(item, "pubDate"),
            url: `https://www.gdacs.org/report.aspx?eventtype=FL&eventid=${encodeURIComponent(id)}`
          }];
        });
      return { alerts, source: "GDACS", checkedAt: new Date().toISOString() };
    });
    res.json(result);
  } catch (error) {
    console.error("GDACS flood alerts error:", error.message);
    res.status(502).json({ error: "Unable to load verified GDACS flood alerts right now." });
  }
});

const NASA_LAYERS = {
  satellite: {
    layer: "MODIS_Terra_CorrectedReflectance_TrueColor",
    format: "image/jpeg"
  },
  wildfires: {
    layer: "VIIRS_NOAA20_Thermal_Anomalies_375m_All",
    format: "image/png"
  }
};

app.get("/api/imagery", async (req, res) => {
  const config = NASA_LAYERS[req.query.layer];
  const requestedDate = String(req.query.date || "");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ? requestedDate
    : new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (!config) {
    return res.status(400).json({
      error: "Choose a supported NASA image layer."
    });
  }

  try {
    const url = new URL("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi");
    url.search = new URLSearchParams({
      SERVICE: "WMS",
      VERSION: "1.3.0",
      REQUEST: "GetMap",
      LAYERS: config.layer,
      STYLES: "",
      FORMAT: config.format,
      CRS: "EPSG:4326",
      BBOX: "-90,-180,90,180",
      WIDTH: "2048",
      HEIGHT: "1024",
      TIME: date,
      TRANSPARENT: "TRUE"
    }).toString();

    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const contentType = response.headers.get("content-type")?.split(";")[0];
    if (!response.ok || !contentType?.startsWith("image/")) {
      throw new Error(`NASA GIBS returned HTTP ${response.status}`);
    }

    res.set({
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
      "X-Data-Source": "NASA GIBS"
    });
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error("NASA imagery error:", error.message);
    res.status(502).json({
      error: "NASA GIBS imagery is temporarily unavailable."
    });
  }
});

app.get("/api/earthquakes", async (_req, res) => {
  try {
    const result = await cachedProviderData("usgs-earthquakes-24h", 5 * 60 * 1000, async () => {
      const response = await fetch(
        "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
        { signal: AbortSignal.timeout(12000) }
      );
      if (!response.ok) throw new Error("USGS request failed");
      const geojson = await response.json();
      if (!Array.isArray(geojson.features)) throw new Error("USGS event response was invalid");
      return {
        count: geojson.metadata?.count ?? geojson.features.length,
        earthquakes: geojson.features.slice(0, 30).map((item) => ({
          id: item.id,
          place: item.properties?.place,
          magnitude: item.properties?.mag,
          time: item.properties?.time,
          coordinates: item.geometry?.coordinates
        })).filter((item) => Array.isArray(item.coordinates) && item.coordinates.length >= 2),
        source: "USGS",
        updatedAt: new Date().toISOString()
      };
    });
    res.json(result);
  } catch (error) {
    console.error("Earthquake error:", error.message);
    res.status(502).json({
      error: "Unable to load earthquake data."
    });
  }
});

app.post("/api/insight", rateLimit({ windowMs: 60 * 1000, max: 8 }), async (req, res) => {
  try {
    const body = req.body || {};
    const question = String(body.question || "").trim();

    if (!question || question.length > 1000) {
      return res.status(400).json({
        error: "Enter a question of up to 1000 characters."
      });
    }

    const location = body.location && typeof body.location === "object"
      ? body.location
      : BENGALURU;
    const weather = body.weather && typeof body.weather === "object"
      ? body.weather
      : null;
    const airQuality = body.airQuality && typeof body.airQuality === "object"
      ? body.airQuality
      : null;
    const climateAnomaly =
      body.climateAnomaly && typeof body.climateAnomaly === "object"
        ? body.climateAnomaly
        : null;
    const globalIndicators =
      body.globalIndicators && typeof body.globalIndicators === "object"
        ? body.globalIndicators
        : null;
    const conversation = Array.isArray(body.conversation)
      ? body.conversation.slice(-8).flatMap((message) => {
          if (
            !message ||
            !["user", "assistant"].includes(message.role) ||
            typeof message.content !== "string"
          ) return [];
          const content = message.content.trim().slice(0, 1200);
          return content ? [{ role: message.role, content }] : [];
      })
      : [];
    const environmentalEvents = Array.isArray(body.environmentalEvents)
      ? body.environmentalEvents.slice(0, 12).flatMap((event) => {
          if (!event || typeof event.title !== "string") return [];
          return [{
            title: event.title.slice(0, 160),
            date: typeof event.date === "string" ? event.date.slice(0, 40) : null,
            categories: Array.isArray(event.categories)
              ? event.categories.slice(0, 5).map((category) => String(category?.title || "").slice(0, 80))
              : [],
            magnitude: Number.isFinite(event.magnitude) ? event.magnitude : null,
            magnitudeUnit: typeof event.magnitudeUnit === "string" ? event.magnitudeUnit.slice(0, 30) : null,
            source: Array.isArray(event.sources)
              ? event.sources.slice(0, 5).map((source) => String(source?.id || "NASA EONET").slice(0, 60))
              : ["NASA EONET"]
          }];
        })
      : [];
    const currentWeather = weather?.current || {};
    const dailyForecast = weather?.daily || {};
    const currentAir = airQuality?.current || {};
    const verifiedAirQuality = airQuality
      ? {
          source: airQuality.source || "Open-Meteo Air Quality",
          currentAt: currentAir.time || null,
          pollutants: [
            ["PM2.5", "pm2_5"],
            ["PM10", "pm10"],
            ["Carbon monoxide", "carbon_monoxide"],
            ["Nitrogen dioxide", "nitrogen_dioxide"],
            ["Sulphur dioxide", "sulphur_dioxide"],
            ["Ozone", "ozone"]
          ]
            .filter(([, field]) =>
              Number.isFinite(currentAir[field]) &&
              typeof airQuality.units?.[field] === "string"
            )
            .map(([label, field]) => ({
              label,
              value: currentAir[field],
              unit: airQuality.units[field]
            }))
        }
      : null;
    const environmentalData = {
      location: {
        name: String(location.name || BENGALURU.name).slice(0, 100),
        country: String(location.country || "").slice(0, 100),
        latitude: location.latitude,
        longitude: location.longitude
      },
      currentWeatherModel: weather
        ? {
            source: weather.source || "Open-Meteo",
            units: weather.units || {},
            currentAt: currentWeather.time || null,
            temperatureC: currentWeather.temperature_2m ?? null,
            feelsLikeC: currentWeather.apparent_temperature ?? null,
            humidityPercent: currentWeather.relative_humidity_2m ?? null,
            windSpeedKmh: currentWeather.wind_speed_10m ?? null,
            precipitationMm: currentWeather.precipitation ?? null,
            weatherCondition:
              WEATHER_CODE_DESCRIPTIONS[currentWeather.weather_code] || null,
            weatherCode: currentWeather.weather_code ?? null
          }
        : null,
      forecast: dailyForecast.time
        ? dailyForecast.time.slice(0, 3).map((date, index) => ({
            date,
            minimumC: dailyForecast.temperature_2m_min?.[index] ?? null,
            maximumC: dailyForecast.temperature_2m_max?.[index] ?? null,
            temperatureUnit: weather?.dailyUnits?.temperature_2m_min || "unavailable",
            precipitationProbabilityPercent:
              dailyForecast.precipitation_probability_max?.[index] ?? null
          }))
        : null,
      currentAirQualityModel: airQuality
        ? {
            source: airQuality.source || "Open-Meteo Air Quality",
            units: airQuality.units || {},
            currentAt: currentAir.time || null,
            pm2_5: currentAir.pm2_5 ?? null,
            pm10: currentAir.pm10 ?? null,
            ozone: currentAir.ozone ?? null,
            nitrogenDioxide: currentAir.nitrogen_dioxide ?? null,
            sulphurDioxide: currentAir.sulphur_dioxide ?? null,
            carbonMonoxide: currentAir.carbon_monoxide ?? null
          }
        : null,
      historicalDailyComparison: climateAnomaly
        ? {
            currentAt: climateAnomaly.currentAt || null,
            currentTemperatureC: climateAnomaly.currentTemperatureC ?? null,
            baselineMeanC: climateAnomaly.baselineMeanC ?? null,
            departureC: climateAnomaly.departureC ?? null,
            baselinePeriod: climateAnomaly.baselinePeriod || null,
            calendarWindowDays: climateAnomaly.calendarWindowDays || null,
            calendarWindowMeaning:
              "Selects same-season calendar dates within the stated window across the full baseline period; it is not the baseline duration.",
            source: climateAnomaly.source || null,
            limitation: climateAnomaly.note || null
          }
        : null,
      globalClimateIndicators: globalIndicators
        ? {
            sourceNote: "Monthly global and station observations; not live readings.",
            temperature: globalIndicators.globalTemperature && {
              anomalyC: Number.isFinite(globalIndicators.globalTemperature.anomalyC)
                ? globalIndicators.globalTemperature.anomalyC
                : null,
              month: globalIndicators.globalTemperature.month || null,
              year: globalIndicators.globalTemperature.year || null,
              baseline: globalIndicators.globalTemperature.baseline || null,
              source: "NASA GISTEMP"
            },
            atmosphericCo2: globalIndicators.atmosphericCo2 && {
              ppm: Number.isFinite(globalIndicators.atmosphericCo2.ppm)
                ? globalIndicators.atmosphericCo2.ppm
                : null,
              month: globalIndicators.atmosphericCo2.month || null,
              year: globalIndicators.atmosphericCo2.year || null,
              quality: globalIndicators.atmosphericCo2.quality || null,
              source: "NOAA GML Mauna Loa"
            }
          }
        : null,
      recentEnvironmentalEvents: environmentalEvents
    };
    const weatherContext = JSON.stringify(environmentalData).slice(0, 4000);

    const aiProvider = (process.env.AI_PROVIDER || "ollama").trim().toLowerCase();
    const model = aiProvider === "openai-compatible"
      ? String(process.env.AI_MODEL || "").trim()
      : process.env.OLLAMA_MODEL || "llama3.2:3b";
    const messages = [
          {
            role: "system",
            content: `You are ClimateTech, a careful climate science assistant.
Use only the supplied environmental data for location-specific values.
Clearly distinguish current weather-model values, air-quality model estimates,
forecast data, historical comparisons, and your interpretation. Never describe
Open-Meteo model output as a direct station measurement.
Use the supplied weatherCondition description instead of interpreting a raw
weatherCode. Do not describe model output as recorded or directly observed.
If a value is null or missing, state that it is unavailable; never invent it.
Use the unit labels from source metadata exactly; do not infer or convert units.
Do not repeat numeric pollutant concentrations or units; show them only in the
verified source-data panel. You may discuss air quality qualitatively.
Do not assign an AQI, health category, or pollution-risk level unless that
classification is supplied. Do not describe conditions as high-risk or unsafe
without a source-provided risk threshold.
If a historical daily comparison is supplied, explain it as a single-day
comparison only and not a climate trend or climate anomaly attribution.
The calendar-date window is applied within the full baseline period; never
describe that window as the duration of the historical record.
Environmental event records are curated reports, may be delayed, and do not
represent every event or satellite detection. Use only listed dates and sources.
If no historical daily comparison is supplied, say it was not included in this
analysis; do not claim the comparison is unavailable for the location.
Do not claim short-term weather proves long-term climate change. Explain uncertainty
and give practical, non-medical recommendations. No multi-year climate trend data
is supplied, so do not assert a regional climate trend or describe current conditions
as typical for a season. Use clear language and headings.
Selected-location data: ${weatherContext}`
          },
          ...conversation,
          { role: "user", content: question }
    ];

    let aiResponse;
    if (aiProvider === "ollama") {
      const ollamaUrl = (
        process.env.OLLAMA_URL || "http://127.0.0.1:11434"
      ).replace(/\/$/, "");
      aiResponse = await fetch(`${ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          messages,
          options: { temperature: 0.4, num_predict: 350 }
        }),
        signal: AbortSignal.timeout(120000)
      });
    } else if (aiProvider === "openai-compatible") {
      const baseUrl = String(process.env.AI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/$/, "");
      const apiKey = String(process.env.AI_API_KEY || "").trim();
      if (!apiKey || !model) {
        const configurationError = new Error("Set AI_API_KEY and AI_MODEL for the openai-compatible provider.");
        configurationError.code = "AI_CONFIGURATION";
        throw configurationError;
      }
      aiResponse = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 350 }),
        signal: AbortSignal.timeout(120000)
      });
    } else {
      const configurationError = new Error("AI_PROVIDER must be ollama or openai-compatible.");
      configurationError.code = "AI_CONFIGURATION";
      throw configurationError;
    }

    if (!aiResponse.ok) {
      throw new Error(
        `${aiProvider} returned HTTP ${aiResponse.status}. Check the configured model service.`
      );
    }

    const result = await aiResponse.json();

    const generatedAnswer = (aiProvider === "ollama"
      ? result.message?.content
      : result.choices?.[0]?.message?.content) || "The AI returned no answer.";
    const sanitizedAnswer = sanitizeAiInterpretation(generatedAnswer, climateAnomaly);
    const answer = sanitizedAnswer.answer ||
      "The AI response contained no usable interpretation. Refer to the verified source data below.";
    const sources = [
      ...(weather ? [{ name: "Open-Meteo weather", url: "https://open-meteo.com/en/docs" }] : []),
      ...(airQuality ? [{ name: "Open-Meteo Air Quality", url: "https://open-meteo.com/en/docs/air-quality-api" }] : []),
      ...(climateAnomaly ? [{ name: "Open-Meteo historical archive", url: "https://open-meteo.com/en/docs/historical-weather-api" }] : []),
      ...(globalIndicators?.globalTemperature ? [{ name: "NASA GISTEMP", url: "https://data.giss.nasa.gov/gistemp/" }] : []),
      ...(globalIndicators?.atmosphericCo2 ? [{ name: "NOAA GML CO₂ trends", url: "https://gml.noaa.gov/ccgg/trends/data.html" }] : []),
      ...(environmentalEvents.length ? [{ name: "NASA EONET events", url: "https://eonet.gsfc.nasa.gov/docs/v3" }] : [])
    ];

    res.json({
      answer,
      verifiedAirQuality,
      sources,
      model,
      provider: aiProvider,
      context: `${environmentalData.location.name} local environmental data, when available`,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("AI error:", error.message);

    const isTimeout = error.name === "TimeoutError" || error.name === "AbortError";

    res.status(503).json({
      error: error.code === "AI_CONFIGURATION"
        ? error.message
        : isTimeout
        ? "The AI took too long. Try a shorter question."
        : (process.env.AI_PROVIDER || "ollama").trim().toLowerCase() === "openai-compatible"
          ? "The configured AI service is unavailable. Check AI_BASE_URL, AI_MODEL, and AI_API_KEY on the backend."
          : "The AI service is unavailable. Start Ollama and install the configured model (OLLAMA_MODEL), or set OLLAMA_URL to your Ollama server."
    });
  }
});

if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`ClimateTech backend: http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
}

export default app;