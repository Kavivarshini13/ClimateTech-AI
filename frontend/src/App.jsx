import React, { useCallback, useEffect, useRef, useState } from "react";
import Globe from "globe.gl";
import "./App.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const START_LOCATION = {
  name: "Bengaluru",
  country: "India",
  latitude: 12.9716,
  longitude: 77.5946
};

const CITY_MARKERS = [
  START_LOCATION,
  { name: "Tokyo", country: "Japan", latitude: 35.6762, longitude: 139.6503 },
  { name: "Nairobi", country: "Kenya", latitude: -1.2921, longitude: 36.8219 },
  { name: "London", country: "United Kingdom", latitude: 51.5072, longitude: -0.1276 },
  { name: "New York", country: "United States", latitude: 40.7128, longitude: -74.006 },
  { name: "Reykjavik", country: "Iceland", latitude: 64.1466, longitude: -21.9426 }
];

const MONITORING_LAYERS = [
  "3D Earth",
  "Weather",
  "Temperature",
  "Climate anomalies",
  "Air quality",
  "Earthquakes",
  "Wildfires",
  "Extreme weather",
  "Precipitation",
  "Satellite / day-night",
  "CO₂ & greenhouse gases",
  "Flood risk",
  "Climate risk zones"
];

const NAVIGATION_ITEMS = [
  { label: "Overview", icon: "◈", layer: "3D Earth", target: "top" },
  { label: "Weather", icon: "☼", layer: "Weather", target: "globe-card" },
  { label: "Air Quality", icon: "◌", layer: "Air quality", target: "globe-card" },
  { label: "Earthquakes", icon: "⌁", layer: "Earthquakes", target: "events-panel" },
  { label: "Wildfires", icon: "♨", layer: "Wildfires", target: "globe-card" },
  { label: "Climate Risks", icon: "△", layer: "Climate anomalies", target: "globe-card" },
  { label: "Satellite View", icon: "▧", layer: "Satellite / day-night", target: "globe-card" },
  { label: "Climate AI", icon: "✳", target: "ai-panel" },
  { label: "Saved Locations", icon: "☆", target: "saved-panel" },
  { label: "Settings", icon: "⚙", target: "settings" }
];

const EARTH_TEXTURE =
  "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg";
const EARTH_FALLBACK_TEXTURE = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 512"><defs><radialGradient id="o"><stop stop-color="#163447"/><stop offset=".68" stop-color="#081c27"/><stop offset="1" stop-color="#02070c"/></radialGradient></defs><rect width="1024" height="512" fill="url(#o)"/><g fill="#1b3a3b" stroke="#376a62" stroke-width="3"><path d="M55 105 89 79 139 72 168 88 206 86 230 107 215 130 189 138 180 167 151 172 143 197 116 194 96 171 74 162 67 139 48 130Z"/><path d="m206 208 29 12 21 34-8 39-20 32-8 42-20 38-20-23-3-39-15-33 7-42 19-31Z"/><path d="m456 109 34-20 54 5 20 17 38-3 34 24-15 21-35 5-16 22-34-9-15-24-24 2-10-20-30 2-21-14Z"/><path d="m510 183 37-17 43 12 31 34-9 52-27 38-16 67-29 58-20-22-6-58-18-34-12-51 10-38Z"/><path d="m611 156 28-20 57 8 25 24 42 1 26 30-15 30-45 2-24-24-34 5-34-23-32 4-19-18Z"/><path d="m726 302 32-20 48 9 33 28-12 35-39 15-48-14-26-25Z"/><path d="m917 146 25-17 26 13-5 28-24 10-20-15Z"/></g><g fill="none" stroke="#3c8b8b" stroke-opacity=".24"><path d="M0 128h1024M0 256h1024M0 384h1024M256 0v512M512 0v512M768 0v512"/></g></svg>`)}`;

const TOOLBAR_LAYERS = [
  { label: "Weather", icon: "☼" },
  { label: "Temperature", icon: "⌁" },
  { label: "Wildfires", icon: "♨" },
  { label: "Flood risk", icon: "≈" },
  { label: "Satellite / day-night", icon: "▧" },
  { label: "Air quality", icon: "◌" }
];

// Ambient network points are a fixed visual texture, not climate measurements.
const AMBIENT_NETWORK_POINTS = Array.from({ length: 1200 }, (_, index) => {
  const fraction = (index + 0.5) / 1200;
  const latitude = 90 - Math.acos(1 - 2 * fraction) * (180 / Math.PI);
  const longitude = ((index * 137.508) % 360) - 180;
  const colorIndex = (index * 17) % 97;
  const color = colorIndex > 94
    ? "#ee835b"
    : colorIndex > 71
      ? "#3d9ec0"
      : colorIndex > 38
        ? "#37bfae"
        : "#4a9a84";
  return {
    lat: latitude,
    lng: longitude,
    altitude: 0.005 + (index % 4) * 0.001,
    size: 0.095 + (index % 3) * 0.012,
    color,
    kind: "ambient"
  };
});
const ORBITAL_PARTICLES = Array.from({ length: 360 }, (_, index) => {
  const band = Math.floor(index / 120);
  return {
    lat: band === 0 ? 23 : band === 1 ? -23 : 0,
    lng: ((index % 120) * 3) - 180,
    altitude: 0.075 + (index % 3) * 0.006,
    size: 0.075,
    color: band === 2 ? "#cdb15f" : band === 1 ? "#4ca7c0" : "#48c8b5",
    kind: "ambient"
  };
});

function yesterdayUtc() {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10);
}

function nasaImageryUrl(layer, date) {
  return `${API}/api/imagery?${new URLSearchParams({ layer, date })}`;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("NASA GIBS image could not be loaded."));
    image.src = url;
  });
}

async function createFireTexture(date) {
  const [earth, fires] = await Promise.all([
    loadImage(nasaImageryUrl("satellite", date)),
    loadImage(nasaImageryUrl("wildfires", date))
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to prepare the NASA fire imagery.");
  context.drawImage(earth, 0, 0, canvas.width, canvas.height);
  context.drawImage(fires, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function getNightHemisphere() {
  const now = new Date();
  const dayOfYear = Math.floor(
    (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
      Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000
  );
  const utcHours =
    now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  const declination =
    23.44 * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365);
  const subsolarLongitude = ((12 - utcHours) * 15 + 540) % 360 - 180;
  const centerLat = -declination;
  const centerLng = ((subsolarLongitude + 360) % 360) - 180;
  const angularRadius = (89 * Math.PI) / 180;
  const centerLatitudeRadians = (centerLat * Math.PI) / 180;
  const centerLongitudeRadians = (centerLng * Math.PI) / 180;
  const boundary = Array.from({ length: 97 }, (_, index) => {
    const bearing = (2 * Math.PI * index) / 96;
    const latitude = Math.asin(
      Math.sin(centerLatitudeRadians) * Math.cos(angularRadius) +
        Math.cos(centerLatitudeRadians) * Math.sin(angularRadius) * Math.cos(bearing)
    );
    const longitude =
      centerLongitudeRadians +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularRadius) * Math.cos(centerLatitudeRadians),
        Math.cos(angularRadius) -
          Math.sin(centerLatitudeRadians) * Math.sin(latitude)
      );
    return [
      ((((longitude * 180) / Math.PI) + 540) % 360) - 180,
      (latitude * 180) / Math.PI
    ];
  });
  boundary.push(boundary[0]);

  return [{
    type: "Feature",
    properties: { layer: "day-night-terminator" },
    geometry: { type: "Polygon", coordinates: [boundary] }
  }];
}

function conditionColor(layer, weather, airQuality, anomaly) {
  if (layer === "3D Earth") return "#87dca4";
  if (layer === "Climate anomalies") {
    if (!Number.isFinite(anomaly?.departureC)) return "#f6d66b";
    return anomaly.departureC >= 0 ? "#ff9c68" : "#77b9ed";
  }
  if (layer === "Temperature") {
    const temperature = weather?.temperature_2m;
    if (!Number.isFinite(temperature)) return "#8f9d91";
    if (temperature < 5) return "#6eb8ed";
    if (temperature < 15) return "#83d8c0";
    if (temperature < 25) return "#a4e28b";
    if (temperature < 32) return "#f1d06c";
    return "#f18d61";
  }
  if (layer === "Air quality") {
    const pm25 = airQuality?.pm2_5;
    if (!Number.isFinite(pm25)) return "#8f9d91";
    if (pm25 < 10) return "#7dd89d";
    if (pm25 < 25) return "#c7d978";
    if (pm25 < 50) return "#f1b365";
    return "#ed796b";
  }
  if (layer === "Precipitation") {
    return weather?.precipitation > 5
      ? "#75aef2"
      : weather?.precipitation > 0
        ? "#85c8e5"
        : "#9bca9f";
  }
  const code = weather?.weather_code;
  if ([95, 96, 99, 65, 67, 82].includes(code)) return "#ef9971";
  if ([51, 53, 55, 61, 63, 80, 81].includes(code)) return "#80b9ec";
  if ([2, 3, 45, 48].includes(code)) return "#aeb9a4";
  return "#91dfa4";
}

const WEATHER_DESCRIPTIONS = {
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

const EarthGlobe = React.memo(function EarthGlobe({
  earthquakes,
  environmentalEvents,
  floodAlerts,
  selectedLocation,
  selectedWeather,
  selectedAirQuality,
  globalConditions,
  climateAnomaly,
  activeLayer,
  visibleLayers,
  viewMode,
  autoRotateEnabled,
  ambientEnabled,
  minimumMagnitude,
  onSelect,
  onSelectEvent,
  onImageryStatus,
  onMapControl
}) {
  const containerRef = useRef(null);
  const globeRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const onSelectEventRef = useRef(onSelectEvent);
  const onImageryStatusRef = useRef(onImageryStatus);
  const onMapControlRef = useRef(onMapControl);
  const flatZoomControlsRef = useRef(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    onSelectEventRef.current = onSelectEvent;
  }, [onSelectEvent]);

  useEffect(() => {
    onImageryStatusRef.current = onImageryStatus;
  }, [onImageryStatus]);

  useEffect(() => {
    onMapControlRef.current = onMapControl;
  }, [onMapControl]);

  useEffect(() => {
    if (!containerRef.current) return;

    const globe = Globe()(containerRef.current)
      .globeImageUrl(
        "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
      )
      .backgroundColor("#07110d")
      .showAtmosphere(true)
      .atmosphereColor("#48c8b5")
      .atmosphereAltitude(0.14)
      .pointLat("lat")
      .pointLng("lng")
      .pointColor("color")
      .pointAltitude("altitude")
      .pointRadius("size")
      .pointLabel("label")
      .onPointClick((point) => {
        if (point.kind === "ambient") return;
        if (point.kind === "earthquake" || point.kind === "environment-event" || point.kind === "flood-alert") {
          onSelectEventRef.current?.(point.eventDetails);
          onSelectRef.current({
            name: point.locationName,
            country: "",
            latitude: point.lat,
            longitude: point.lng
          });
          return;
        }
        onSelectRef.current(point.location || {
          name: point.name,
          country: point.country || "",
          latitude: point.lat,
          longitude: point.lng
        });
      });

    globe.pointOfView(
      { lat: START_LOCATION.latitude, lng: START_LOCATION.longitude, altitude: 1.9 },
      1000
    );
    globe.controls().autoRotate = autoRotateEnabled;
    globe.controls().autoRotateSpeed = 0.24;
    globe.controls().enableDamping = true;
    globe.controls().dampingFactor = 0.08;
    globe.controls().minDistance = 120;
    globe.controls().maxDistance = 480;
    onMapControlRef.current?.({
      reset: () => {
        globe.pointOfView({ lat: 12, lng: 0, altitude: 2.2 }, 900);
        flatZoomControlsRef.current?.reset();
      },
      zoomIn: () => {
        if (flatZoomControlsRef.current) return flatZoomControlsRef.current.zoomIn();
        const view = globe.pointOfView();
        globe.pointOfView({ altitude: Math.max(0.35, view.altitude * 0.78) }, 260);
      },
      zoomOut: () => {
        if (flatZoomControlsRef.current) return flatZoomControlsRef.current.zoomOut();
        const view = globe.pointOfView();
        globe.pointOfView({ altitude: Math.min(4.7, view.altitude * 1.28) }, 260);
      },
      fullscreen: () => containerRef.current?.closest(".globe-card")?.requestFullscreen?.()
    });

    globe
      .arcStartLat("startLat")
      .arcStartLng("startLng")
      .arcEndLat("endLat")
      .arcEndLng("endLng")
      .arcColor(() => ["rgba(87, 221, 215, 0.72)", "rgba(232, 190, 100, 0.18)"])
      .arcAltitude(0.16)
      .arcStroke(0.35)
      .arcDashLength(0.28)
      .arcDashGap(0.82)
      .arcDashAnimateTime(4800);

    globeRef.current = globe;

    const resize = (width, height) => {
      if (!containerRef.current) return;
      globe.width(width ?? containerRef.current.clientWidth);
      globe.height(height ?? containerRef.current.clientHeight);
    };

    resize();
    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      resize(width, height);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      onMapControlRef.current?.(null);
      containerRef.current?.replaceChildren();
      globeRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (globeRef.current) {
      globeRef.current.controls().autoRotate = autoRotateEnabled && viewMode === "3d";
    }
  }, [autoRotateEnabled, viewMode]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return undefined;

    let cancelled = false;
    const date = yesterdayUtc();
    const setBaseTexture = async () => {
      if (activeLayer === "Wildfires" || activeLayer === "Satellite / day-night") {
        onImageryStatusRef.current({ loading: true, error: "" });
      } else {
        onImageryStatusRef.current({ loading: false, error: "" });
      }

      try {
        if (activeLayer === "Wildfires") {
          const texture = await createFireTexture(date);
          if (cancelled) return;
          globe.globeImageUrl(texture);
          onImageryStatusRef.current({ loading: false, error: "", date });
        } else if (activeLayer === "Satellite / day-night") {
          await loadImage(nasaImageryUrl("satellite", date));
          if (cancelled) return;
          globe.globeImageUrl(nasaImageryUrl("satellite", date));
          onImageryStatusRef.current({ loading: false, error: "", date });
        } else {
          await loadImage(EARTH_TEXTURE);
          if (cancelled) return;
          globe.globeImageUrl(EARTH_TEXTURE);
          onImageryStatusRef.current({ loading: false, error: "" });
        }
      } catch (error) {
        if (cancelled) return;
        globe.globeImageUrl(EARTH_FALLBACK_TEXTURE);
        onImageryStatusRef.current({
          loading: false,
          error: `${error.message} Showing the built-in vector Earth fallback.`
        });
      }
    };
    setBaseTexture();

    return () => {
      cancelled = true;
    };
  }, [activeLayer]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    if (activeLayer !== "Satellite / day-night") {
      globe.polygonsData([]);
      return undefined;
    }

    const updateNightOverlay = () => {
      if (!globeRef.current) return;
      globe
        .polygonsData(getNightHemisphere())
        .polygonAltitude(0.003)
        .polygonCapColor(() => "rgba(3, 8, 10, 0.45)")
        .polygonSideColor(() => "rgba(3, 8, 10, 0.12)")
        .polygonStrokeColor(() => "rgba(190, 221, 205, 0.22)");
    };
    updateNightOverlay();
    const intervalId = window.setInterval(updateNightOverlay, 60000);
    return () => window.clearInterval(intervalId);
  }, [activeLayer]);

  useEffect(() => {
    if (!globeRef.current) return;

    const hasPointWeatherLayer = visibleLayers.some((layer) =>
      ["Weather", "Temperature", "Air quality", "Precipitation"].includes(layer)
    );
    const isEventLayer = ["Earthquakes", "Wildfires", "Extreme weather"].includes(activeLayer) && !hasPointWeatherLayer;
    const isRasterLayer = activeLayer === "Wildfires";
    const stationLocations = globalConditions.length
      ? globalConditions
      : CITY_MARKERS.map((location) => ({ ...location, weather: null, airQuality: null }));
    const locations = isEventLayer || isRasterLayer || activeLayer === "Climate anomalies"
      ? []
      : stationLocations
        .filter((station) =>
          Math.abs(station.latitude - selectedLocation.latitude) >= 0.02 ||
          Math.abs(station.longitude - selectedLocation.longitude) >= 0.02
        )
        .map((station) => {
          const isSelected =
            Math.abs(station.latitude - selectedLocation.latitude) < 0.02 &&
            Math.abs(station.longitude - selectedLocation.longitude) < 0.02;
          const stationWeather = isSelected
            ? selectedWeather?.current || station.weather
            : station.weather;
          const stationAir = isSelected
            ? selectedAirQuality?.current || station.airQuality
            : station.airQuality;
          const reading =
            activeLayer === "Air quality"
              ? stationAir?.pm2_5
              : activeLayer === "Precipitation"
                ? stationWeather?.precipitation
                : stationWeather?.temperature_2m;
          const layerValue = activeLayer === "Weather"
            ? (WEATHER_DESCRIPTIONS[stationWeather?.weather_code] || "Condition unavailable")
            : activeLayer === "3D Earth"
              ? "Interactive city marker"
            : activeLayer === "Temperature"
              ? `${stationWeather?.temperature_2m ?? "--"} °C`
              : activeLayer === "Air quality"
                ? `PM2.5 ${stationAir?.pm2_5 ?? "unavailable"} μg/m³`
                : activeLayer === "Precipitation"
                  ? `${stationWeather?.precipitation ?? "--"} mm (previous hour)`
                  : activeLayer === "Satellite / day-night"
                    ? "Satellite station"
                    : "City weather marker";
          return {
            lat: station.latitude,
            lng: station.longitude,
            color: conditionColor(activeLayer, stationWeather, stationAir, isSelected ? climateAnomaly : null),
            size: activeLayer === "Precipitation" && Number.isFinite(reading)
              ? Math.min(0.38 + reading * 0.1, 1)
              : 0.62,
            altitude: 0.018,
            label: `${station.name}, ${station.country} · ${layerValue}`,
            kind: "city",
            name: station.name,
            country: station.country || "",
            location: {
              name: station.name,
              country: station.country || "",
              latitude: station.latitude,
              longitude: station.longitude
            }
          };
        });
    const selected = {
      lat: selectedLocation.latitude,
      lng: selectedLocation.longitude,
      color: conditionColor(
        activeLayer,
        selectedWeather?.current,
        selectedAirQuality?.current,
        climateAnomaly
      ),
      size: 1.05,
      altitude: 0.04,
      label: `Selected · ${selectedLocation.name}${selectedLocation.country ? `, ${selectedLocation.country}` : ""}${activeLayer === "Climate anomalies" && Number.isFinite(climateAnomaly?.departureC) ? ` · ${climateAnomaly.departureC > 0 ? "+" : ""}${climateAnomaly.departureC}°C vs baseline` : ""}`,
      kind: "selected",
      name: selectedLocation.name,
      country: selectedLocation.country || "",
      location: selectedLocation
    };
    const earthquakeMarkers =
      (visibleLayers.includes("Earthquakes") || activeLayer === "Earthquakes")
        ? earthquakes
          .filter((quake) => Number(quake.magnitude ?? 0) >= Number(minimumMagnitude))
          .map((quake) => ({
        lat: quake.coordinates[1],
        lng: quake.coordinates[0],
        color: "#ff9a65",
        size: Math.min(0.24 + (quake.magnitude || 1) * 0.075, 0.95),
        altitude: 0.025,
        label: `M${Number(quake.magnitude || 0).toFixed(1)} · ${quake.place || "Earthquake"}`,
        kind: "earthquake",
        locationName: quake.place || "Earthquake event",
        eventDetails: {
          title: quake.place || "Earthquake event",
          type: "Earthquake",
          date: quake.time ? new Date(quake.time).toISOString() : null,
          source: "USGS",
          magnitude: quake.magnitude,
          latitude: quake.coordinates[1],
          longitude: quake.coordinates[0]
        }
          }))
        : [];

    const environmentMarkers = (visibleLayers.includes("Wildfires") || visibleLayers.includes("Extreme weather") || ["Wildfires", "Extreme weather"].includes(activeLayer))
      ? environmentalEvents
          .filter((event) => {
            const categories = event.categories.map((category) => category.id.toLowerCase());
            return (visibleLayers.includes("Wildfires") || activeLayer === "Wildfires")
              && categories.includes("wildfires")
              || (visibleLayers.includes("Extreme weather") || activeLayer === "Extreme weather")
              && categories.some((category) => ["severestorms", "drought", "dustandhaze"].includes(category));
          })
          .map((event) => ({
            lat: event.latitude,
            lng: event.longitude,
            color: event.categories.some((category) => category.id.toLowerCase() === "wildfires")
              ? "#ff784f"
              : "#f2b84b",
            size: 0.75,
            altitude: 0.03,
            label: `${event.title} · ${event.categories.map((category) => category.title).join(", ")}`,
            kind: "environment-event",
            locationName: event.title,
            eventDetails: {
              title: event.title,
              type: event.categories.map((category) => category.title).join(", "),
              date: event.date,
              source: event.sources?.map((source) => source.id).filter(Boolean).join(", ") || "NASA EONET",
              magnitude: event.magnitude,
              magnitudeUnit: event.magnitudeUnit,
              latitude: event.latitude,
              longitude: event.longitude,
              url: event.link
            }
          }))
      : [];

    const floodMarkers = visibleLayers.includes("Flood risk")
      ? floodAlerts.map((alert) => ({
          lat: alert.latitude,
          lng: alert.longitude,
          color: alert.alertLevel === "Red" ? "#f05e5e" : alert.alertLevel === "Orange" ? "#f2a13f" : "#7ebd8d",
          size: alert.alertLevel === "Red" ? 1.05 : 0.85,
          altitude: 0.04,
          label: `${alert.alertLevel} GDACS flood alert · ${alert.title}`,
          kind: "flood-alert",
          locationName: alert.title,
          eventDetails: {
            title: alert.title,
            type: `${alert.alertLevel} GDACS flood alert`,
            date: alert.updatedAt,
            source: "GDACS",
            latitude: alert.latitude,
            longitude: alert.longitude,
            url: alert.url
          }
        }))
      : [];

    globeRef.current.pointsData([
      ...(ambientEnabled ? [...AMBIENT_NETWORK_POINTS, ...ORBITAL_PARTICLES] : []),
      ...locations,
      selected,
      ...earthquakeMarkers,
      ...environmentMarkers,
      ...floodMarkers
    ]);
    const connectedStations = globalConditions
      .filter((station) =>
        Math.abs(station.latitude - selectedLocation.latitude) >= 0.02 ||
        Math.abs(station.longitude - selectedLocation.longitude) >= 0.02
      )
      .slice(0, 8);
    globeRef.current.arcsData(connectedStations.map((station) => ({
      startLat: selectedLocation.latitude,
      startLng: selectedLocation.longitude,
      endLat: station.latitude,
      endLng: station.longitude
    })));
  }, [
    earthquakes,
    environmentalEvents,
    floodAlerts,
    selectedLocation,
    selectedWeather,
    selectedAirQuality,
    globalConditions,
    climateAnomaly,
    activeLayer,
    minimumMagnitude,
    visibleLayers,
    ambientEnabled
  ]);

  useEffect(() => {
    globeRef.current?.pointOfView(
      {
        lat: selectedLocation.latitude,
        lng: selectedLocation.longitude,
        altitude: 1.9
      },
      1100
    );
  }, [selectedLocation]);

  const reportFlatZoomControls = useCallback((controls) => {
    flatZoomControlsRef.current = controls;
  }, []);

  return (
    <div className="earth-view-stack">
      <div className={`globe ${viewMode === "2d" ? "globe-hidden" : ""}`} ref={containerRef} />
      {viewMode === "2d" && (
        <StreetMap
          environmentalEvents={environmentalEvents}
          earthquakes={earthquakes}
          globalConditions={globalConditions}
          floodAlerts={floodAlerts}
          selectedLocation={selectedLocation}
          selectedWeather={selectedWeather}
          visibleLayers={visibleLayers}
          onSelect={onSelect}
          onSelectEvent={onSelectEvent}
          onZoomControls={reportFlatZoomControls}
        />
      )}
    </div>
  );
});
function Metric({ label, value, unit, icon }) {
  return (
    <article className="metric">
      <span className="metric-icon">{icon}</span>
      <p>{label}</p>
      <strong>{value ?? "--"}<small>{unit}</small></strong>
    </article>
  );
}

function distanceKm(firstLatitude, firstLongitude, secondLatitude, secondLongitude) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(secondLatitude - firstLatitude);
  const longitudeDelta = radians(secondLongitude - firstLongitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(firstLatitude)) *
      Math.cos(radians(secondLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function findLocationMention(question, locations) {
  const bengaluru = locations.find((location) =>
    location?.name?.toLocaleLowerCase() === "bengaluru"
  );
  if (bengaluru && /\bbengalure\b/i.test(question)) return bengaluru.name;

  const knownLocation = locations
    .filter((location) => location?.name)
    .sort((first, second) => second.name.length - first.name.length)
    .find((location) =>
      new RegExp(
        `(^|[^\\p{L}])${location.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`,
        "iu"
      ).test(question)
    );
  if (knownLocation) return knownLocation.name;

  const stopWords = "weather|climate|air quality|pollution|environment|conditions|forecast|temperature|rainfall|analysis|like|look|there|what|how|is|are|today|tomorrow|currently|now";
  const connectorMatch = question.match(/\b(?:in|at|for|near|around|about)\s+(.+)$/i);
  if (connectorMatch?.[1]) {
    const candidate = connectorMatch[1]
      .split(new RegExp(`\\b(?:${stopWords})\\b`, "i"))[0]
      .replace(/[?!.,].*$/, "")
      .replace(/^(?:the|a|an)\s+/i, "")
      .trim();
    if (candidate && !/^(?:last|next|coming|future|past)\b/i.test(candidate)) {
      return candidate;
    }
  }

  const simpleQuery = question
    .trim()
    .replace(new RegExp(`\\s+(?:${stopWords})\\b.*$`, "i"), "")
    .replace(/^[\s?!.,]+|[\s?!.,]+$/g, "");
  const words = simpleQuery.split(/\s+/);
  const questionWords = /\b(?:what|why|when|where|who|how|can|could|would|should|is|are|the|tell|show|give|analyze|compare|explain)\b/i;
  return words.length > 0 && words.length <= 4 && !questionWords.test(simpleQuery)
    ? simpleQuery
    : null;
}

function sameLocation(first, second) {
  return first.latitude === second.latitude && first.longitude === second.longitude;
}

const MAP_TILE_SIZE = 256;

function projectMapPoint(latitude, longitude, zoom) {
  const scale = MAP_TILE_SIZE * 2 ** zoom;
  const clampedLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const sine = Math.sin((clampedLatitude * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale
  };
}

function unprojectMapPoint(x, y, zoom) {
  const scale = MAP_TILE_SIZE * 2 ** zoom;
  return {
    latitude: (Math.atan(Math.sinh(Math.PI - (2 * Math.PI * y) / scale)) * 180) / Math.PI,
    longitude: (x / scale) * 360 - 180
  };
}

function weatherIcon(code) {
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "⛅";
  if ([3].includes(code)) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)) return "🌧️";
  return "·";
}

function StreetMap({
  environmentalEvents,
  earthquakes,
  globalConditions,
  floodAlerts,
  selectedLocation,
  selectedWeather,
  visibleLayers,
  onSelect,
  onSelectEvent,
  onZoomControls
}) {
  const [center, setCenter] = useState(selectedLocation);
  const [zoom, setZoom] = useState(11);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const mapRef = useRef(null);
  const dragRef = useRef(null);
  const zoomControlsRef = useRef(onZoomControls);
  const selectedLocationRef = useRef(selectedLocation);

  useEffect(() => {
    zoomControlsRef.current = onZoomControls;
  }, [onZoomControls]);

  useEffect(() => {
    selectedLocationRef.current = selectedLocation;
    setCenter(selectedLocation);
    setZoom(11);
  }, [selectedLocation]);

  useEffect(() => {
    if (!mapRef.current) return undefined;
    const resize = () => {
      if (!mapRef.current) return;
      setMapSize({
        width: mapRef.current.clientWidth,
        height: mapRef.current.clientHeight
      });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mapRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    zoomControlsRef.current({
      zoomIn: () => setZoom((value) => Math.min(18, value + 1)),
      zoomOut: () => setZoom((value) => Math.max(3, value - 1)),
      reset: () => {
        setCenter(selectedLocationRef.current);
        setZoom(11);
      }
    });
    return () => zoomControlsRef.current(null);
  }, []);

  const centerPixel = projectMapPoint(center.latitude, center.longitude, zoom);
  const mapLeft = centerPixel.x - mapSize.width / 2;
  const mapTop = centerPixel.y - mapSize.height / 2;
  const tileCount = 2 ** zoom;
  const tiles = [];
  for (
    let tileX = Math.floor(mapLeft / MAP_TILE_SIZE);
    tileX <= Math.floor((mapLeft + mapSize.width) / MAP_TILE_SIZE);
    tileX += 1
  ) {
    for (
      let tileY = Math.max(0, Math.floor(mapTop / MAP_TILE_SIZE));
      tileY <= Math.min(tileCount - 1, Math.floor((mapTop + mapSize.height) / MAP_TILE_SIZE));
      tileY += 1
    ) {
      const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
      tiles.push({
        key: `${zoom}-${tileX}-${tileY}`,
        url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`,
        left: tileX * MAP_TILE_SIZE - mapLeft,
        top: tileY * MAP_TILE_SIZE - mapTop
      });
    }
  }

  const markers = [
    ...((visibleLayers.includes("Weather") || visibleLayers.includes("Temperature") || visibleLayers.includes("Air quality"))
      ? globalConditions
        .filter((item) => !sameLocation(item, selectedLocation))
        .map((item) => ({
          id: `station-${item.latitude}-${item.longitude}`,
          latitude: item.latitude,
          longitude: item.longitude,
          label: `${item.name} · model data point`,
          kind: "station",
          location: item
        }))
      : []),
    ...floodAlerts.map((alert) => ({
          id: `flood-${alert.id}`,
          latitude: alert.latitude,
          longitude: alert.longitude,
          label: `${alert.alertLevel} GDACS flood alert · ${alert.title}`,
          kind: `flood-alert ${alert.alertLevel.toLowerCase()}`,
          event: {
            title: alert.title,
            type: `${alert.alertLevel} GDACS flood alert`,
            date: alert.updatedAt,
            source: "GDACS",
            latitude: alert.latitude,
            longitude: alert.longitude,
            url: alert.url
          }
        })),
    ...(visibleLayers.includes("Wildfires") || visibleLayers.includes("Extreme weather")
      ? environmentalEvents.filter((event) => {
          const ids = event.categories.map((category) => category.id.toLowerCase());
          return visibleLayers.includes("Wildfires") && ids.includes("wildfires") ||
            visibleLayers.includes("Extreme weather") && ids.some((id) => ["severestorms", "drought", "dustandhaze"].includes(id));
        }).map((event) => ({
          id: event.id, latitude: event.latitude, longitude: event.longitude,
          label: event.title, kind: "environment-event", event
        }))
      : []),
    ...(visibleLayers.includes("Earthquakes")
      ? earthquakes.map((quake) => ({
          id: quake.id, latitude: quake.coordinates[1], longitude: quake.coordinates[0],
          label: quake.place || "USGS earthquake", kind: "earthquake", quake
        }))
      : []),
    {
      id: "selected-location",
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
      label: selectedLocation.name,
      kind: "selected",
      location: selectedLocation
    }
  ].flatMap((marker) => {
    const point = projectMapPoint(marker.latitude, marker.longitude, zoom);
    const halfWorld = MAP_TILE_SIZE * tileCount / 2;
    let x = point.x - centerPixel.x;
    if (x > halfWorld) x -= MAP_TILE_SIZE * tileCount;
    if (x < -halfWorld) x += MAP_TILE_SIZE * tileCount;
    const left = mapSize.width / 2 + x;
    const top = mapSize.height / 2 + point.y - centerPixel.y;
    return left < -24 || left > mapSize.width + 24 || top < -24 || top > mapSize.height + 24
      ? []
      : [{ ...marker, left, top }];
  });

  return (
    <div
      className="street-map"
      aria-label="Interactive street map with selected-location weather and alerts"
      ref={mapRef}
      onPointerDown={(event) => {
        if (event.button !== 0 || event.target.closest(".street-map-marker")) return;
        const pixel = projectMapPoint(center.latitude, center.longitude, zoom);
        dragRef.current = { x: event.clientX, y: event.clientY, pixel };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!dragRef.current) return;
        const { pixel, x, y } = dragRef.current;
        setCenter(unprojectMapPoint(
          pixel.x - (event.clientX - x),
          pixel.y - (event.clientY - y),
          zoom
        ));
      }}
      onPointerUp={(event) => {
        const drag = dragRef.current;
        dragRef.current = null;
        if (!drag || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const coordinates = unprojectMapPoint(
          drag.pixel.x - mapSize.width / 2 + event.clientX - bounds.left,
          drag.pixel.y - mapSize.height / 2 + event.clientY - bounds.top,
          zoom
        );
        onSelect({
          name: `Map point ${coordinates.latitude.toFixed(3)}, ${coordinates.longitude.toFixed(3)}`,
          country: "",
          ...coordinates
        });
      }}
      onPointerCancel={() => { dragRef.current = null; }}
      onWheel={(event) => {
        event.preventDefault();
        setZoom((value) => Math.max(3, Math.min(18, value + (event.deltaY < 0 ? 1 : -1))));
      }}
    >
      <div className="street-map-tiles" aria-hidden="true">
        {tiles.map((tile) => (
          <img
            key={tile.key}
            className="street-map-tile"
            src={tile.url}
            alt=""
            draggable="false"
            style={{ left: tile.left, top: tile.top }}
          />
        ))}
      </div>
      <div className="street-map-grid" aria-hidden="true" />
      {markers.map((marker) => (
        <button
          className={`street-map-marker ${marker.kind}`}
          type="button"
          key={marker.id}
          style={{ left: marker.left, top: marker.top }}
          title={marker.label}
          aria-label={marker.label}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            if (marker.event) onSelectEvent(marker.event);
            else if (marker.quake) onSelectEvent({
              title: marker.label,
              type: "Earthquake",
              date: marker.quake.time ? new Date(marker.quake.time).toISOString() : null,
              source: "USGS",
              magnitude: marker.quake.magnitude,
              latitude: marker.latitude,
              longitude: marker.longitude
            });
            onSelect(marker.location || { name: marker.label, country: "", latitude: marker.latitude, longitude: marker.longitude });
          }}
        />
      ))}
      <div className="street-map-weather" aria-live="polite">
        <span className="street-map-weather-icon">{weatherIcon(selectedWeather?.current?.weather_code)}</span>
        <span>
          <strong>{selectedWeather?.current?.temperature_2m ?? "--"}°C</strong>
          <small>{WEATHER_DESCRIPTIONS[selectedWeather?.current?.weather_code] || "Weather loading"}</small>
        </span>
      </div>
      <span className="street-map-caption">
        STREET MAP · CLICK FOR LOCAL WEATHER · DRAG TO PAN · SCROLL TO ZOOM
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
      </span>
    </div>
  );
}

function sparkline(records, field) {
  const values = (records || []).map((record) => Number(record[field])).filter(Number.isFinite);
  if (values.length < 2) return "";
  const minimum = Math.min(...values);
  const range = Math.max(...values) - minimum || 1;
  return values.map((value, index) => {
    const x = (index / (values.length - 1)) * 120;
    const y = 30 - ((value - minimum) / range) * 25;
    return `${index === 0 ? "M" : "L"}${x},${y}`;
  }).join(" ");
}

export default function App() {
  const [selectedLocation, setSelectedLocation] = useState(START_LOCATION);
  const [viewMode, setViewMode] = useState("3d");
  const [autoRotateEnabled, setAutoRotateEnabled] = useState(true);
  const [ambientEnabled, setAmbientEnabled] = useState(true);
  const [selectedMapEvent, setSelectedMapEvent] = useState(null);
  const [savedLocations, setSavedLocations] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("climatetech-saved-locations") || "[]");
      return Array.isArray(saved)
        ? saved.filter((location) =>
          location &&
          typeof location.name === "string" &&
          Number.isFinite(location.latitude) &&
          Number.isFinite(location.longitude)
        )
        : [];
    } catch (error) {
      console.error("Could not load saved locations.", error);
      return [];
    }
  });
  const [savedLocationsError, setSavedLocationsError] = useState("");
  const [weather, setWeather] = useState(null);
  const [airQuality, setAirQuality] = useState(null);
  const [earthquakes, setEarthquakes] = useState([]);
  const [environmentalEvents, setEnvironmentalEvents] = useState([]);
  const [environmentalEventsError, setEnvironmentalEventsError] = useState("");
  const [globalIndicators, setGlobalIndicators] = useState(null);
  const [indicatorsError, setIndicatorsError] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [forecastVariable, setForecastVariable] = useState("temperature");
  const [forecastPeriod, setForecastPeriod] = useState("daily");
  const [mapControls, setMapControls] = useState(null);
  const [question, setQuestion] = useState(
    "Analyze the current local weather and air-quality model values and suggest practical environmental actions. Distinguish current conditions from long-term climate."
  );
  const [answer, setAnswer] = useState("");
  const [verifiedAirQuality, setVerifiedAirQuality] = useState(null);
  const [aiSources, setAiSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [airQualityError, setAirQualityError] = useState("");
  const [earthquakeError, setEarthquakeError] = useState("");
  const [dataLoading, setDataLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [activeTab, setActiveTab] = useState("Map");
  const [connectionStatus, setConnectionStatus] = useState("checking");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");
  const [activeLayer, setActiveLayer] = useState("3D Earth");
  const [visibleLayers, setVisibleLayers] = useState(["Weather"]);
  const [layersOpen, setLayersOpen] = useState(false);
  const [utcNow, setUtcNow] = useState(() => new Date());
  const [globalConditions, setGlobalConditions] = useState([]);
  const [monitoringAirQualityAvailable, setMonitoringAirQualityAvailable] = useState(true);
  const [monitoringError, setMonitoringError] = useState("");
  const [climateAnomaly, setClimateAnomaly] = useState(null);
  const [anomalyLoading, setAnomalyLoading] = useState(false);
  const [anomalyError, setAnomalyError] = useState("");
  const [floodForecast, setFloodForecast] = useState(null);
  const [floodLoading, setFloodLoading] = useState(false);
  const [floodError, setFloodError] = useState("");
  const [floodAlerts, setFloodAlerts] = useState([]);
  const [floodAlertsError, setFloodAlertsError] = useState("");
  const [imageryStatus, setImageryStatus] = useState({ loading: false, error: "", date: "" });
  const [eventCategory, setEventCategory] = useState("All categories");
  const [minimumMagnitude, setMinimumMagnitude] = useState("0");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);
  const requestId = useRef(0);
  const anomalyRequestId = useRef(0);
  const initialLoadStarted = useRef(false);
  const supportingDataLoaded = useRef(false);
  const searchInputRef = useRef(null);

  useEffect(() => {
    const clockTimer = window.setInterval(() => setUtcNow(new Date()), 1000);
    return () => window.clearInterval(clockTimer);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("climatetech-saved-locations", JSON.stringify(savedLocations));
      setSavedLocationsError("");
    } catch (error) {
      console.error("Could not save locations to this browser.", error);
      setSavedLocationsError("Saved locations could not be stored in this browser.");
    }
  }, [savedLocations]);

  const reportImageryStatus = useCallback((status) => {
    setImageryStatus(status);
  }, []);
  const reportMapControls = useCallback((controls) => {
    setMapControls(controls);
  }, []);
  const selectMapEvent = useCallback((event) => {
    setSelectedMapEvent(event || null);
  }, []);

  const loadDashboard = useCallback(async (location, refreshEvents = false) => {
    const currentRequest = ++requestId.current;
    if (refreshEvents) supportingDataLoaded.current = false;
    const query = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      name: location.name,
      country: location.country || ""
    });
    setWeatherError("");
    setAirQualityError("");
    setDataLoading(true);

    try {
      const requests = [
        fetch(`${API}/api/health`).then(async (response) => {
          const data = await response.json();
          if (!response.ok || data.status !== "online") {
            throw new Error(data.error || "Backend health check failed.");
          }
          return data;
        }),
        fetch(`${API}/api/weather?${query}`).then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Weather data is unavailable.");
          return data;
        }),
        fetch(`${API}/api/air-quality?${query}`).then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Air quality data is unavailable.");
          return data;
        })
      ];
      const shouldRefreshSupportingData =
        refreshEvents || !supportingDataLoaded.current;
      if (shouldRefreshSupportingData) {
        requests.push(fetch(`${API}/api/earthquakes`).then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Earthquake data is unavailable.");
          return data;
        }));
        requests.push(fetch(`${API}/api/monitoring`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locations: CITY_MARKERS })
        }).then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Global monitoring data is unavailable.");
          return data;
        }));
      }
      const results = await Promise.allSettled(requests);
      if (currentRequest !== requestId.current) return;

      const [healthResult, weatherResult, airResult, quakeResult, monitoringResult] = results;
      const loadedWeather = weatherResult.status === "fulfilled" ? weatherResult.value : null;
      const loadedAirQuality = airResult.status === "fulfilled" ? airResult.value : null;
      setConnectionStatus(healthResult.status === "fulfilled" ? "online" : "offline");
      if (loadedWeather) {
        setWeather(loadedWeather);
      } else {
        setWeather(null);
        setWeatherError(weatherResult.reason.message);
      }
      if (loadedAirQuality) {
        setAirQuality(loadedAirQuality);
      } else {
        setAirQuality(null);
        setAirQualityError(airResult.reason.message);
      }
      if (quakeResult) {
        if (quakeResult.status === "fulfilled") {
          setEarthquakes(quakeResult.value.earthquakes || []);
          setEarthquakeError("");
        } else {
          setEarthquakeError(quakeResult.reason.message);
        }
      }
      if (monitoringResult) {
        if (monitoringResult.status === "fulfilled") {
          setGlobalConditions(monitoringResult.value.locations || []);
          setMonitoringAirQualityAvailable(monitoringResult.value.airQualityAvailable !== false);
          setMonitoringError("");
        } else {
          setGlobalConditions([]);
          setMonitoringAirQualityAvailable(false);
          setMonitoringError(monitoringResult.reason.message);
        }
      }
      if (
        quakeResult?.status === "fulfilled" &&
        monitoringResult?.status === "fulfilled"
      ) {
        supportingDataLoaded.current = true;
      }
      setLastUpdated(new Date().toLocaleTimeString());
      return { weather: loadedWeather, airQuality: loadedAirQuality };
    } catch (error) {
      if (currentRequest === requestId.current) {
        setWeatherError(`${error.message} Check that the backend is running.`);
      }
      return { weather: null, airQuality: null };
    } finally {
      if (currentRequest === requestId.current) setDataLoading(false);
    }
  }, []);const selectLocation = useCallback((location) => {
    setSelectedLocation(location);
    setSearch(location.name);
    setSearchResults([]);
    setSearchError("");
    setAnswer("");
    setVerifiedAirQuality(null);
    setAiError("");
    setClimateAnomaly(null);
    return loadDashboard(location);
  }, [loadDashboard]);

  async function searchLocations(event) {
    event.preventDefault();
    const term = search.trim();
    if (term.length < 2 || searching) return;

    setSearching(true);
    setSearchResults([]);
    setSearchError("");
    try {
      const response = await fetch(
        `${API}/api/geocode?q=${encodeURIComponent(term)}`
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Location search failed.");
      setSearchResults(result.results || []);
      if (!result.results?.length) setSearchError("No matching locations found.");
    } catch (error) {
      setSearchError(`${error.message} Check that the backend is running.`);
    } finally {
      setSearching(false);
    }
  }

  async function askAI(event) {
    event.preventDefault();
    if (!question.trim() || loading) return;

    const submittedQuestion = question.trim();
    setLoading(true);
    setAnswer("");
    setVerifiedAirQuality(null);
    setAiSources([]);
    setAiError("");
    setChatMessages((messages) => [...messages, { role: "user", content: submittedQuestion }]);

    try {
      const mention = findLocationMention(submittedQuestion, [
        selectedLocation,
        ...CITY_MARKERS,
        ...globalConditions
      ]);
      let contextLocation = selectedLocation;
      let contextWeather = weather;
      let contextAirQuality = airQuality;
      let contextClimateAnomaly = climateAnomaly;

      if (mention && mention.toLocaleLowerCase() !== selectedLocation.name.toLocaleLowerCase()) {
        const geocodeResponse = await fetch(
          `${API}/api/geocode?q=${encodeURIComponent(mention)}`
        );
        const geocodeResult = await geocodeResponse.json();
        if (!geocodeResponse.ok) {
          throw new Error(geocodeResult.error || `Could not find ${mention}.`);
        }
        const result = geocodeResult.results?.[0];
        if (result) {
          contextLocation = {
            name: result.name,
            country: result.country || "",
            latitude: result.latitude,
            longitude: result.longitude
          };
          if (!sameLocation(contextLocation, selectedLocation)) {
            const locationData = await selectLocation(contextLocation);
            contextWeather = locationData?.weather || null;
            contextAirQuality = locationData?.airQuality || null;
            contextClimateAnomaly = null;
          } else {
            contextLocation = selectedLocation;
          }
        }
      }

      const response = await fetch(`${API}/api/insight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: submittedQuestion,
          location: contextLocation,
          weather: contextWeather,
          airQuality: contextAirQuality,
          climateAnomaly: contextClimateAnomaly,
          globalIndicators,
          environmentalEvents: environmentalEvents.slice(0, 12),
          conversation: chatMessages.slice(-8)
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "AI request failed.");
      }

      setAnswer(result.answer);
      setVerifiedAirQuality(result.verifiedAirQuality || null);
      setAiSources(Array.isArray(result.sources) ? result.sources : []);
      setChatMessages((messages) => [...messages, { role: "assistant", content: result.answer }]);
    } catch (error) {
      setAiError(
        error instanceof TypeError
          ? `${error.message} Check that the backend is running and Ollama is reachable.`
          : error.message
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    setSearch(START_LOCATION.name);
    loadDashboard(START_LOCATION, true);
  }, [loadDashboard]);

  useEffect(() => {
    let cancelled = false;
    const loadEvents = async () => {
      try {
        const response = await fetch(`${API}/api/environment/events`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Environmental event feed is unavailable.");
        if (!cancelled) {
          setEnvironmentalEvents(result.events || []);
          setEnvironmentalEventsError("");
        }
      } catch (error) {
        if (!cancelled) setEnvironmentalEventsError(error.message);
      }
    };
    const loadIndicators = async () => {
      try {
        const response = await fetch(`${API}/api/climate/indicators`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Global climate indicators are unavailable.");
        if (!cancelled) {
          setGlobalIndicators(result);
          setIndicatorsError("");
        }
      } catch (error) {
        if (!cancelled) setIndicatorsError(error.message);
      }
    };
    const loadEarthquakes = async () => {
      try {
        const response = await fetch(`${API}/api/earthquakes`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Earthquake feed is unavailable.");
        if (!cancelled) {
          setEarthquakes(result.earthquakes || []);
          setEarthquakeError("");
        }
      } catch (error) {
        if (!cancelled) setEarthquakeError(error.message);
      }
    };
    const loadFloodAlerts = async () => {
      try {
        const response = await fetch(`${API}/api/flood-alerts`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Verified flood alerts are unavailable.");
        if (!cancelled) {
          setFloodAlerts(result.alerts || []);
          setFloodAlertsError("");
        }
      } catch (error) {
        if (!cancelled) setFloodAlertsError(error.message);
      }
    };

    loadEvents();
    loadIndicators();
    loadEarthquakes();
    loadFloodAlerts();
    const eventTimer = window.setInterval(loadEvents, 10 * 60 * 1000);
    const indicatorTimer = window.setInterval(loadIndicators, 6 * 60 * 60 * 1000);
    const earthquakeTimer = window.setInterval(loadEarthquakes, 5 * 60 * 1000);
    const floodAlertTimer = window.setInterval(loadFloodAlerts, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(eventTimer);
      window.clearInterval(indicatorTimer);
      window.clearInterval(earthquakeTimer);
      window.clearInterval(floodAlertTimer);
    };
  }, []);

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [settingsOpen]);

  useEffect(() => {
    if (activeLayer !== "Climate anomalies") {
      setAnomalyLoading(false);
      setAnomalyError("");
      return undefined;
    }
    const currentRequest = ++anomalyRequestId.current;
    const query = new URLSearchParams({
      latitude: String(selectedLocation.latitude),
      longitude: String(selectedLocation.longitude),
      name: selectedLocation.name,
      country: selectedLocation.country || ""
    });
    setAnomalyLoading(true);
    setAnomalyError("");
    setClimateAnomaly(null);
    fetch(`${API}/api/climate-anomaly?${query}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Historical comparison is unavailable.");
        return result;
      })
      .then((result) => {
        if (currentRequest === anomalyRequestId.current) setClimateAnomaly(result);
      })
      .catch((error) => {
        if (currentRequest === anomalyRequestId.current) setAnomalyError(error.message);
      })
      .finally(() => {
        if (currentRequest === anomalyRequestId.current) setAnomalyLoading(false);
      });
    return () => {
      anomalyRequestId.current += 1;
    };
  }, [activeLayer, selectedLocation]);

  useEffect(() => {
    if (activeLayer !== "Flood risk") {
      setFloodLoading(false);
      setFloodError("");
      return undefined;
    }
    let cancelled = false;
    const query = new URLSearchParams({
      latitude: String(selectedLocation.latitude),
      longitude: String(selectedLocation.longitude),
      name: selectedLocation.name,
      country: selectedLocation.country || ""
    });
    setFloodLoading(true);
    setFloodError("");
    setFloodForecast(null);
    fetch(`${API}/api/flood?${query}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "River-discharge forecast is unavailable.");
        return result;
      })
      .then((result) => {
        if (!cancelled) setFloodForecast(result);
      })
      .catch((error) => {
        if (!cancelled) setFloodError(error.message);
      })
      .finally(() => {
        if (!cancelled) setFloodLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeLayer, selectedLocation]);

  const current = weather?.current || {};
  const air = airQuality?.current || {};
  const weatherDescription = WEATHER_DESCRIPTIONS[current.weather_code] || "Conditions unavailable";
  const airQualityValues = [
    ["PM2.5", air.pm2_5, "μg/m³"],
    ["PM10", air.pm10, "μg/m³"],
    ["Ozone", air.ozone, "μg/m³"]
  ];
  const forecastDays = (weather?.daily?.time || []).map((date, index) => ({
    date,
    high: weather.daily.temperature_2m_max?.[index],
    low: weather.daily.temperature_2m_min?.[index],
    precipitation: weather.daily.precipitation_probability_max?.[index],
    weatherCode: weather.daily.weather_code?.[index]
  })) || [];
  const nextThreeDays = forecastDays.slice(0, 3);
  const hourlyForecast = (weather?.hourly?.time || []).slice(0, 12).map((time, index) => ({
    time: time.slice(11, 16),
    temperature: weather.hourly.temperature?.[index],
    rainChance: weather.hourly.rainChance?.[index],
    weatherCode: weather.hourly.weatherCode?.[index]
  }));
  const filteredEarthquakes = earthquakes.filter((quake) =>
    Number(quake.magnitude ?? 0) >= Number(minimumMagnitude)
  );
  const nearbyEarthquakes = earthquakes
    .map((quake) => ({
      ...quake,
      distance: distanceKm(
        selectedLocation.latitude,
        selectedLocation.longitude,
        quake.coordinates[1],
        quake.coordinates[0]
      )
    }))
    .filter((quake) => quake.distance <= 500)
    .sort((first, second) => first.distance - second.distance)
    .slice(0, 3);
  const nearbyFloodAlerts = floodAlerts
    .map((alert) => ({
      ...alert,
      distance: distanceKm(
        selectedLocation.latitude,
        selectedLocation.longitude,
        alert.latitude,
        alert.longitude
      )
    }))
    .filter((alert) => alert.distance <= 500)
    .sort((first, second) => first.distance - second.distance);
  const tickerEvents = [
    ...environmentalEvents.map((event) => ({
      id: `eonet-${event.id}`,
      title: event.title,
      date: event.date,
      latitude: event.latitude,
      longitude: event.longitude,
      layer: event.categories.some((category) => category.id.toLowerCase() === "wildfires") ? "Wildfires" : "Extreme weather",
      source: "NASA EONET"
    })),
    ...earthquakes.map((event) => ({
      id: `usgs-${event.id}`,
      title: event.place || "Earthquake event",
      date: event.time,
      latitude: event.coordinates[1],
      longitude: event.coordinates[0],
      layer: "Earthquakes",
      source: "USGS"
    }))
  ].sort((first, second) => new Date(second.date || 0) - new Date(first.date || 0)).slice(0, 10);
  const availableEventCount = environmentalEvents.length + earthquakes.length;
  const dashboardDataStatus = connectionStatus === "offline"
    ? "OFFLINE"
    : connectionStatus === "checking"
      ? "CHECKING"
      : availableEventCount || globalIndicators || weather
        ? "DELAYED"
        : "OFFLINE";
  const sourceFailures = [
    weatherError,
    airQualityError,
    environmentalEventsError,
    earthquakeError,
    floodAlertsError,
    indicatorsError
  ].filter(Boolean).length;
  const sourceStatus = connectionStatus !== "online"
    ? "WAITING FOR BACKEND"
    : sourceFailures
      ? `${sourceFailures} SOURCE${sourceFailures === 1 ? "" : "S"} UNAVAILABLE`
      : "PUBLIC FEEDS CONNECTED";
  const forecastValues = forecastPeriod === "daily"
    ? forecastVariable === "temperature"
      ? forecastDays.map((day) => day.high)
      : forecastDays.map((day) => day.precipitation)
    : forecastVariable === "temperature"
      ? weather?.hourly?.temperature?.slice(0, 12) || []
      : weather?.hourly?.rainChance?.slice(0, 12) || [];
  const forecastChartValues = forecastValues
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map(Number)
    .filter(Number.isFinite);
  const forecastChartPath = forecastChartValues.length > 1
    ? forecastChartValues.map((value, index) => {
        const x = (index / (forecastChartValues.length - 1)) * 600;
        const range = Math.max(...forecastChartValues) - Math.min(...forecastChartValues) || 1;
        const y = 150 - ((value - Math.min(...forecastChartValues)) / range) * 120;
        return `${index === 0 ? "M" : "L"}${x},${y}`;
      }).join(" ")
    : "";

  function navigateTo(item) {
    setActiveTab(item.label);
    if (item.layer) setActiveLayer(item.layer);
    if (item.target === "settings") {
      setSettingsOpen(true);
      return;
    }
    document.getElementById(item.target)?.scrollIntoView({
      behavior: "smooth",
      block: item.target === "top" ? "start" : "center"
    });
  }

  function toggleSavedLocation(location) {
    const isSaved = savedLocations.some((saved) =>
      saved.latitude === location.latitude && saved.longitude === location.longitude
    );
    setSavedLocations((current) => isSaved
      ? current.filter((saved) =>
        saved.latitude !== location.latitude || saved.longitude !== location.longitude
      )
      : [...current, location]
    );
  }

  function toggleLayer(layer) {
    const next = visibleLayers.includes(layer)
      ? visibleLayers.filter((item) => item !== layer)
      : [...visibleLayers, layer];
    setVisibleLayers(next);
    if (!visibleLayers.includes(layer)) setActiveLayer(layer);
    else if (activeLayer === layer) setActiveLayer(next.at(-1) || "3D Earth");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-symbol" aria-hidden="true">◉</span>
          <div>
            <strong>CLIMATE<span>TECH</span></strong>
            <small>EARTH OBSERVATION</small>
          </div>
        </div>

        <p className="side-label">MONITORING</p>

        <nav aria-label="Main navigation">
          {NAVIGATION_ITEMS.map((item) => (
            <button
              key={item.label}
              className={`nav-item ${activeTab === item.label ? "selected" : ""}`}
              aria-current={activeTab === item.label ? "page" : undefined}
              onClick={() => navigateTo(item)}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <span className={`live-dot ${connectionStatus === "offline" ? "offline" : ""}`} />
          <span>{connectionStatus === "online" ? "SYSTEM CONNECTED" : connectionStatus === "offline" ? "BACKEND OFFLINE" : "CHECKING CONNECTION"}</span>
          <small>Open-Meteo · USGS · NASA</small>
          <small className="version">CLIMATE INTELLIGENCE · 1.0</small>
        </div>
      </aside>

      <section className="main-content" id="top">
        <header className="topbar">
          <div className="topbar-title">
            <p className="eyebrow">CLIMATETECH · GLOBAL ENVIRONMENTAL MONITORING</p>
              <h1><span className="topbar-mark">◉</span> ClimateTech <span>Global Intelligence</span></h1>
          </div>
          <nav className="top-navigation" aria-label="Workspace navigation">
            {[
              ["Map", "top"],
              ["Analytics", "climate-analytics"],
              ["Forecast", "forecast-panel"],
              ["AI Assistant", "ai-panel"],
              ["Alerts", "events-panel"]
            ].map(([label, target]) => (
              <button
                type="button"
                key={label}
                className={activeTab === label ? "top-nav-button active" : "top-nav-button"}
                onClick={() => {
                  setActiveTab(label);
                  document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >{label}</button>
            ))}
            <button type="button" className="top-nav-button" onClick={() => setSettingsOpen(true)}>Settings</button>
          </nav>
          <div className="header-actions">
            <div className={`connection-badge ${connectionStatus}`} role="status" aria-live="polite">
              <span className={`live-dot ${connectionStatus === "offline" ? "offline" : ""}`} />
              {connectionStatus === "online" ? "CONNECTED" : connectionStatus === "offline" ? "OFFLINE" : "CONNECTING"}
            </div>
            <div className="header-location">
              <span className="live-dot selected-location-dot" />
              <div>
                <small>{dataLoading ? "UPDATING DATA" : "MONITORING LOCATION"}</small>
                <strong>{selectedLocation.name}{selectedLocation.country ? `, ${selectedLocation.country}` : ""}</strong>
                <span>{lastUpdated ? `Updated ${lastUpdated}` : "Waiting for available readings"}</span>
              </div>
            </div>
            <button
              className="refresh-button"
              onClick={() => loadDashboard(selectedLocation, true)}
              disabled={dataLoading}
            >
              <span className={dataLoading ? "refresh-icon spinning" : "refresh-icon"}>↻</span>
              <span>Refresh data</span>
            </button>
          </div>
        </header>

        <div className="global-status-strip" role="status" aria-live="polite">
          <span className={`status-mode ${dashboardDataStatus.toLowerCase()}`}><i /> DATA · {dashboardDataStatus}</span>
          <span>UTC <strong>{utcNow.toISOString().slice(11, 19)}</strong></span>
          <span>LAYERS <strong>{visibleLayers.length}</strong></span>
          <span>EVENTS <strong>{availableEventCount}</strong></span>
          <span className="source-status">{sourceStatus} · NASA / NOAA / USGS / OPEN-METEO</span>
          <button type="button" onClick={() => setActiveTab("AI Assistant")}>✳ AI ASSISTANT</button>
          <button type="button" onClick={() => setSettingsOpen(true)}>⚙ SETTINGS</button>
        </div>

        <form className="location-search" onSubmit={searchLocations}>
          <label htmlFor="location-search">FIND A LOCATION</label>
          <div className="search-controls">
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input
              ref={searchInputRef}
              id="location-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              autoComplete="off"
              placeholder="Search city or country..."
            />
            <button className="refresh-button" disabled={searching}>
              {searching ? "Searching..." : "Search"}
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="search-results" role="listbox" aria-label="Location results">
              {searchResults.map((result) => (
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  key={`${result.name}-${result.latitude}-${result.longitude}`}
                  onClick={() => selectLocation(result)}
                >
                  <strong>{result.name}</strong>
                  <span>{[result.admin1, result.country].filter(Boolean).join(", ")}</span>
                </button>
              ))}
            </div>
          )}
          {searchError && <p className="search-error">{searchError}</p>}
        </form>

        {weatherError && (
          <div className="error-banner">{weatherError} Weather readings are unavailable.</div>
        )}

        <section className="hero-grid" aria-label="Global conditions">
          <article className="globe-card" id="globe-card">
            <div className="panel-heading globe-heading">
              <div>
                <p className="eyebrow">PLANETARY VIEW</p>
                <h2>Earth observation                 <span className="globe-heading-note">· Interactive global and street-level views</span></h2>
              </div>
              <span className="pill"><span className="live-dot" /> {viewMode === "3d" ? "INTERACTIVE 3D" : "STREET MAP"}</span>
            </div>

            <nav className="earth-tool-rail" aria-label="Climate map tools">
              {TOOLBAR_LAYERS.map((tool) => (
                <button
                  key={tool.label}
                  type="button"
                  className={`earth-tool ${activeLayer === tool.label || visibleLayers.includes(tool.label) ? "active" : ""}`}
                  aria-label={tool.label}
                  aria-pressed={visibleLayers.includes(tool.label)}
                  title={tool.label}
                  onClick={() => toggleLayer(tool.label)}
                >
                  <span aria-hidden="true">{tool.icon}</span>
                </button>
              ))}
              <button
                type="button"
                className={`earth-tool ${layersOpen ? "active" : ""}`}
                aria-expanded={layersOpen}
                aria-label="Toggle climate layers"
                title="Climate layers"
                onClick={() => setLayersOpen((open) => !open)}
              ><span aria-hidden="true">☷</span></button>
              <button
                type="button"
                className="earth-tool"
                aria-label="Open climate event alerts"
                title="Climate alerts"
                onClick={() => document.getElementById("events-panel")?.scrollIntoView({ behavior: "smooth" })}
              ><span aria-hidden="true">⌖</span></button>
            </nav>

            {layersOpen && <div className="layer-controls" aria-label="Global monitoring layers">
              {MONITORING_LAYERS.map((layer) => (
                <button
                  type="button"
                  key={layer}
                  className={`layer-button ${visibleLayers.includes(layer) ? "active" : ""}`}
                  role="switch"
                  aria-checked={visibleLayers.includes(layer)}
                  onClick={() => toggleLayer(layer)}
                >
                  {layer === "Climate anomalies" ? "Temperature anomalies" : layer}
                </button>
              ))}
            </div>}

            <EarthGlobe
              earthquakes={earthquakes}
              floodAlerts={floodAlerts}
              selectedLocation={selectedLocation}
              selectedWeather={weather}
              selectedAirQuality={airQuality}
              globalConditions={globalConditions}
              climateAnomaly={climateAnomaly}
              environmentalEvents={environmentalEvents}
              activeLayer={activeLayer}
              visibleLayers={visibleLayers}
              viewMode={viewMode}
              autoRotateEnabled={autoRotateEnabled}
              ambientEnabled={ambientEnabled}
              minimumMagnitude={minimumMagnitude}
              onSelect={selectLocation}
              onSelectEvent={selectMapEvent}
              onImageryStatus={reportImageryStatus}
              onMapControl={reportMapControls}
            />

            {selectedMapEvent && (
              <section className="map-feature-detail" aria-live="polite" aria-label="Selected climate event">
                <button type="button" className="map-detail-close" aria-label="Close event details" onClick={() => setSelectedMapEvent(null)}>×</button>
                <p className="eyebrow">{selectedMapEvent.type || "ENVIRONMENTAL EVENT"}</p>
                <strong>{selectedMapEvent.title}</strong>
                <span>{Number.isFinite(selectedMapEvent.latitude) ? `${selectedMapEvent.latitude.toFixed(2)}°, ${selectedMapEvent.longitude.toFixed(2)}°` : "Location coordinates unavailable"}</span>
                {selectedMapEvent.date && <time>{new Date(selectedMapEvent.date).toLocaleString()} UTC</time>}
                {Number.isFinite(selectedMapEvent.magnitude) && <span>Magnitude {selectedMapEvent.magnitude}{selectedMapEvent.magnitudeUnit ? ` ${selectedMapEvent.magnitudeUnit}` : ""}</span>}
                <small>SOURCE · {selectedMapEvent.source || "Source unavailable"}</small>
                {selectedMapEvent.url && <a href={selectedMapEvent.url} target="_blank" rel="noreferrer">OPEN EVENT SOURCE ↗</a>}
              </section>
            )}

            <nav className="earth-right-rail" aria-label="Climate intelligence tools">
              <button type="button" title="Climate layers" aria-label="Open climate layers" onClick={() => setLayersOpen(true)}>☷</button>
              <button type="button" title="Live events" aria-label="Open live events" onClick={() => document.getElementById("events-panel")?.scrollIntoView({ behavior: "smooth" })}>⌁</button>
              <button type="button" title="Analytics" aria-label="Open climate analytics" onClick={() => document.getElementById("climate-analytics")?.scrollIntoView({ behavior: "smooth" })}>▥</button>
              <button type="button" title="Climate alerts" aria-label="Open climate alerts" onClick={() => document.getElementById("events-panel")?.scrollIntoView({ behavior: "smooth" })}>⚠</button>
              <button type="button" title="Climate AI" aria-label="Open AI assistant" onClick={() => setActiveTab((tab) => tab === "AI Assistant" ? "Map" : "AI Assistant")}>✳</button>
              <button type="button" title="Search location" aria-label="Search a location" onClick={() => searchInputRef.current?.focus()}>⌕</button>
              <button type="button" title="Data sources" aria-label="Open data source settings" onClick={() => setSettingsOpen(true)}>◉</button>
              <button type="button" title="Settings" aria-label="Open settings" onClick={() => setSettingsOpen(true)}>⚙</button>
            </nav>

            <div className="map-actions" aria-label="Map controls">
              <button type="button" onClick={() => mapControls?.zoomIn()} aria-label="Zoom in" title="Zoom in">+</button>
              <button type="button" onClick={() => mapControls?.zoomOut()} aria-label="Zoom out" title="Zoom out">−</button>
              <button type="button" onClick={() => mapControls?.reset()} aria-label="Reset map view" title="Reset map view">⌖</button>
              <button type="button" onClick={() => mapControls?.fullscreen()} aria-label="Fullscreen map" title="Fullscreen map">⛶</button>
            </div>

            <div className="globe-legend">
              <span className="ambient-points-note">{ambientEnabled ? "1,560 AMBIENT + ORBITAL PARTICLES · VISUAL ONLY" : "AMBIENT PARTICLES · OFF"}</span>
              {activeLayer === "Earthquakes" ? (
                <span>
                  <i className="legend-orange" />
                  USGS earthquakes · past 24 hours · {minimumMagnitude === "0" ? "all magnitudes" : `M${minimumMagnitude}+`} · marker size = magnitude · select to focus
                </span>
              ) : activeLayer === "Wildfires" ? (
                <span><i className="legend-orange" /> NASA VIIRS thermal-anomaly imagery · raster detections, not verified fire reports</span>
              ) : activeLayer === "Climate anomalies" ? (
                <span className="legend-scale">
                  <span className="legend-entry"><i className="legend-orange" />Warmer</span>
                  <span className="legend-entry"><i className="legend-blue" />Cooler</span>
                  <span>vs 1991–2020 daily baseline · not a trend</span>
                </span>
              ) : activeLayer === "Satellite / day-night" ? (
                <span><i className="legend-green" /> NASA MODIS true-color imagery · shaded hemisphere indicates calculated night</span>
              ) : activeLayer === "Flood risk" ? (
                <span className="legend-scale">
                  <span className="legend-entry"><i className="legend-red" />GDACS Red</span>
                  <span className="legend-entry"><i className="legend-orange" />GDACS Orange</span>
                  <span className="legend-entry"><i className="legend-green" />GDACS Green</span>
                  <span>Official alert levels only · no inferred risk</span>
                </span>
              ) : activeLayer === "Temperature" ? (
                <span className="legend-scale">
                  <span className="legend-entry"><i className="legend-blue" />&lt;5°C</span>
                  <span className="legend-entry"><i className="legend-teal" />5–14°C</span>
                  <span className="legend-entry"><i className="legend-green" />15–24°C</span>
                  <span className="legend-entry"><i className="legend-yellow" />25–31°C</span>
                  <span className="legend-entry"><i className="legend-orange" />32°C+</span>
                </span>
              ) : activeLayer === "Air quality" ? (
                <span className="legend-scale">
                  <span className="legend-entry"><i className="legend-green" />PM2.5 &lt;10</span>
                  <span className="legend-entry"><i className="legend-yellow" />10–24</span>
                  <span className="legend-entry"><i className="legend-orange" />25–49</span>
                  <span className="legend-entry"><i className="legend-red" />50+ μg/m³</span>
                  <span>Color bands are visual only, not health grades.</span>
                </span>
              ) : activeLayer === "Precipitation" ? (
                <span className="legend-scale">
                  <span className="legend-entry"><i className="legend-green" />None</span>
                  <span className="legend-entry"><i className="legend-teal" />Up to 5 mm</span>
                  <span className="legend-entry"><i className="legend-blue" />Over 5 mm</span>
                  <span>Marker size scales with previous-hour precipitation.</span>
                </span>
              ) : (
                <span className="legend-scale">
                  <span className="legend-entry"><i className="legend-green" />Clear / mild</span>
                  <span className="legend-entry"><i className="legend-blue" />Rain</span>
                  <span className="legend-entry"><i className="legend-orange" />Severe</span>
                  <span>Open-Meteo current conditions · select a station for local details.</span>
                </span>
              )}
            </div>
            {(imageryStatus.loading || imageryStatus.error || activeLayer === "Wildfires" || activeLayer === "Satellite / day-night" || ["CO₂ & greenhouse gases", "Flood risk", "Climate risk zones"].includes(activeLayer)) && (
              <p className="layer-data-note" aria-live="polite">
                {imageryStatus.loading
                  ? "Loading yesterday’s NASA GIBS imagery…"
                  : imageryStatus.error
                    ? imageryStatus.error
                    : activeLayer === "CO₂ & greenhouse gases"
                      ? "CO₂ has no point layer. The global indicator below uses NOAA monthly Mauna Loa observations, not a global station map."
                    : activeLayer === "Flood risk"
                      ? floodAlertsError
                        ? `GDACS flood alerts are unavailable: ${floodAlertsError}. No risk level is inferred.`
                        : `${floodAlerts.length} current flood event${floodAlerts.length === 1 ? "" : "s"} from the GDACS 24-hour feed. Markers show reported event locations and official GDACS alert levels, not flood boundaries.`
                    : activeLayer === "Climate risk zones"
                      ? "No validated global climate-risk zone dataset is connected. No risk zones are inferred or drawn."
                    : activeLayer === "Wildfires"
                      ? `NASA EONET open event locations · ${environmentalEvents.filter((item) => item.categories.some((category) => category.id.toLowerCase() === "wildfires")).length} wildfire records${environmentalEventsError ? ` · ${environmentalEventsError}` : ""}. EONET is a curated event feed, not all satellite hotspots.`
                      : `NASA MODIS Terra true-color imagery${imageryStatus.date ? ` · ${imageryStatus.date}` : ""}. The dark overlay is a calculated solar terminator, not a satellite night-lights layer.`}
              </p>
            )}
          </article>

          <article className={`weather-card ${dataLoading ? "updating" : ""}`} id="weather-panel" aria-live="polite">
            <div className="weather-location-heading">
              <div>
                <p className="eyebrow">SELECTED LOCATION</p>
                <h2>{selectedLocation.name}{selectedLocation.country ? `, ${selectedLocation.country}` : ""}</h2>
              </div>
              <div className="location-actions">
                <button
                  className={`save-location-button ${savedLocations.some((saved) =>
                    saved.latitude === selectedLocation.latitude &&
                    saved.longitude === selectedLocation.longitude
                  ) ? "saved" : ""}`}
                  type="button"
                  onClick={() => toggleSavedLocation(selectedLocation)}
                  aria-pressed={savedLocations.some((saved) =>
                    saved.latitude === selectedLocation.latitude &&
                    saved.longitude === selectedLocation.longitude
                  )}
                >
                  {savedLocations.some((saved) =>
                    saved.latitude === selectedLocation.latitude &&
                    saved.longitude === selectedLocation.longitude
                  ) ? "★ Saved" : "☆ Save"}
                </button>
                {dataLoading && <span className="loading-indicator"><i /> Updating</span>}
              </div>
            </div>
            <p className="coordinates">
              {Math.abs(selectedLocation.latitude).toFixed(4)}° {selectedLocation.latitude >= 0 ? "N" : "S"} /{" "}
              {Math.abs(selectedLocation.longitude).toFixed(4)}° {selectedLocation.longitude >= 0 ? "E" : "W"}
            </p>

            <div className="temperature">
              {current.temperature_2m ?? "--"}
              <span>°C</span>
            </div>

            <p className="feels-like">
              {weatherDescription}{current.apparent_temperature != null ? ` · feels like ${current.apparent_temperature}°C` : ""}
            </p>

            <div className="weather-divider" />

            <div className="weather-detail">
              <span>Humidity</span>
              <strong>{current.relative_humidity_2m ?? "--"}%</strong>
            </div>
            <div className="weather-detail">
              <span>Wind speed</span>
              <strong>{current.wind_speed_10m ?? "--"} km/h</strong>
            </div>
            <div className="weather-detail">
              <span>Precipitation</span>
              <strong>{current.precipitation ?? "--"} mm · prior hour</strong>
            </div>
            <div className="weather-detail">
              <span>Air quality · PM2.5</span>
              <strong>{air.pm2_5 == null ? "Unavailable" : `${air.pm2_5} μg/m³`}</strong>
            </div>
            <div className="nearby-events">
              <p className="eyebrow">NEARBY EARTHQUAKES · USGS 24H</p>
              {nearbyEarthquakes.length ? nearbyEarthquakes.map((quake) => (
                <button
                  className="nearby-event"
                  key={quake.id}
                  type="button"
                  onClick={() => selectLocation({
                    name: quake.place || "Earthquake event",
                    country: "",
                    latitude: quake.coordinates[1],
                    longitude: quake.coordinates[0]
                  })}
                >
                  <span className="nearby-magnitude">M{Number(quake.magnitude ?? 0).toFixed(1)}</span>
                  <span className="nearby-place">{quake.place || "Location unavailable"}</span>
                  <span className="nearby-distance">{Math.round(quake.distance)} km</span>
                </button>
              )) : (
                <p className="nearby-empty">
                  No event within 500 km in the currently available USGS feed.
                </p>
              )}
            </div>
            <section className="flood-alerts" aria-live="polite">
              <p className="eyebrow">VERIFIED FLOOD ALERTS · WITHIN 500 KM</p>
              {floodAlertsError ? (
                <p className="nearby-empty">{floodAlertsError} Alert status is unavailable; no risk is inferred.</p>
              ) : nearbyFloodAlerts.some((alert) => alert.alertLevel === "Red" || alert.alertLevel === "Orange") ? (
                nearbyFloodAlerts
                  .filter((alert) => alert.alertLevel === "Red" || alert.alertLevel === "Orange")
                  .map((alert) => (
                    <a
                      className={`flood-alert-row ${alert.alertLevel.toLowerCase()}`}
                      key={alert.id}
                      href={alert.url}
                      target="_blank"
                      rel="noreferrer"
                      title={`Open GDACS report · ${Math.round(alert.distance)} km away`}
                    >
                      <span className="flood-alert-level">{alert.alertLevel}</span>
                      <span>{alert.title}<small>{Math.round(alert.distance)} km · GDACS active flood event</small></span>
                      <span aria-hidden="true">↗</span>
                    </a>
                  ))
              ) : (
                <p className="nearby-empty">
                  {nearbyFloodAlerts.length
                    ? "No active GDACS Orange/Red flood alerts within 500 km. Nearby events, if any, are Green level."
                    : "No active GDACS Orange/Red flood alerts within 500 km."}
                  {` ${floodAlerts.length} current flood event${floodAlerts.length === 1 ? "" : "s"} in the global GDACS 24-hour feed.`}
                </p>
              )}
              <p className="source-note">
                Source: <a href="https://www.gdacs.org/" target="_blank" rel="noreferrer">GDACS</a> · checked every 5 minutes. Alert levels are GDACS classifications, not a local flood-depth prediction.
              </p>
            </section>
            {hourlyForecast.length > 0 && (
              <section className="hourly-forecast" aria-label="Hourly weather forecast">
                <p className="eyebrow">HOURLY FORECAST · {weather?.timezone || "LOCAL TIME"}</p>
                <div className="hourly-forecast-list">
                  {hourlyForecast.map((hour, index) => (
                    <div className="hourly-forecast-item" key={`${hour.time}-${index}`}>
                      <time>{hour.time}</time>
                      <span className="hourly-weather-icon" aria-label={WEATHER_DESCRIPTIONS[hour.weatherCode] || "Weather unavailable"}>
                        {weatherIcon(hour.weatherCode)}
                      </span>
                      <strong>{hour.temperature == null ? "--" : `${hour.temperature}°`}</strong>
                      <small>🌧 {hour.rainChance == null ? "--" : `${hour.rainChance}%`}</small>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {nextThreeDays.length > 0 && (
              <div className="forecast-block">
                <p className="eyebrow">NEXT 3 DAYS · OPEN-METEO FORECAST</p>
                {nextThreeDays.map((day) => (
                  <div className="weather-detail forecast-detail" key={day.date}>
                    <span>{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })} · {day.low ?? "--"}° / {day.high ?? "--"}°C</span>
                    <strong>{day.precipitation == null ? "--" : `${day.precipitation}% rain`}</strong>
                  </div>
                ))}
              </div>
            )}
            {airQualityError && <p className="data-note">{airQualityError}</p>}
            {activeLayer === "Climate anomalies" && (
              <div className="anomaly-card" aria-live="polite">
                <p className="eyebrow">HISTORICAL DAILY COMPARISON</p>
                {anomalyLoading ? (
                  <p className="data-note">Comparing current temperature with the historical baseline…</p>
                ) : anomalyError ? (
                  <p className="data-note">{anomalyError}</p>
                ) : climateAnomaly ? (
                  <>
                    <strong className="anomaly-value">
                      {climateAnomaly.departureC > 0 ? "+" : ""}{climateAnomaly.departureC}°C
                    </strong>
                    <p className="data-note">
                      Current model {climateAnomaly.currentTemperatureC}°C vs {climateAnomaly.baselineMeanC}°C daily mean
                      ({climateAnomaly.baselinePeriod}, same calendar date ±{climateAnomaly.calendarWindowDays.replace("±", "")}).
                    </p>
                    <p className="data-note">{climateAnomaly.note} · {climateAnomaly.source}</p>
                    <p className="data-note">
                      {activeTab === "Climate Risks"
                        ? "No location-specific climate-risk alert feed is configured. This temperature comparison is not a risk assessment."
                        : "No long-term risk level is inferred from this short-term weather comparison."}
                    </p>
                  </>
                ) : (
                  <p className="data-note">No historical comparison is available.</p>
                )}
              </div>
            )}
            {activeLayer === "Flood risk" && (
              <div className="anomaly-card" aria-live="polite">
                <p className="eyebrow">MODELED RIVER DISCHARGE · 30 DAY FORECAST</p>
                {floodLoading ? <p className="data-note">Loading location-based river forecast…</p>
                  : floodError ? <p className="data-note">{floodError}</p>
                    : floodForecast ? (
                      <>
                        <strong className="anomaly-value">
                          {floodForecast.daily.river_discharge?.[0] ?? "Unavailable"} {floodForecast.units.river_discharge || ""}
                        </strong>
                        <p className="data-note">{floodForecast.daily.time?.[0] || "Date unavailable"} · {floodForecast.location.name}</p>
                        <p className="data-note">{floodForecast.limitation}</p>
                        <p className="source-note">SOURCE: {floodForecast.source} · model output, not a flood warning.</p>
                      </>
                    ) : <p className="data-note">No river-discharge forecast is available for this location.</p>}
              </div>
            )}

            <p className="source-note">
              SOURCE: {weather?.source || "Open-Meteo"} current model · {current.time || "Current model value unavailable"}
            </p>
            {activeLayer !== "Earthquakes" && activeLayer !== "Wildfires" && activeLayer !== "Climate anomalies" && activeLayer !== "3D Earth" && (
              <p className="data-note">
                Global markers show {globalConditions.length || CITY_MARKERS.length} sampled locations
                {monitoringError
                  ? `; global readings unavailable: ${monitoringError}`
                  : ` · Open-Meteo current model data${activeLayer === "Air quality" && !monitoringAirQualityAvailable ? "; air-quality values unavailable for these stations" : ""}`}.
              </p>
            )}
          </article>
        </section>

        <section className="metrics-grid" id="metrics-panel">
          <Metric
            label="CURRENT TEMPERATURE"
            value={current.temperature_2m}
            unit="°C"
            icon="☼"
          />
          <Metric
            label="RELATIVE HUMIDITY"
            value={current.relative_humidity_2m}
            unit="%"
            icon="≈"
          />
          <Metric
            label="WIND SPEED"
            value={current.wind_speed_10m}
            unit=" km/h"
            icon="↗"
          />
          <Metric
            label="EARTHQUAKES · 24H"
            value={earthquakes.length}
            unit=""
            icon="⌁"
          />
        </section>

        <section className="climate-intelligence-strip" id="climate-analytics" aria-label="Global climate indicators">
          <div className="strip-heading">
            <span className="eyebrow">GLOBAL CLIMATE SIGNALS</span>
            <span className="data-status">Berkeley Earth · NOAA · NASA EONET</span>
          </div>
          <div className="indicator-ribbon">
            <div className="indicator-value">
              <span>Global temperature anomaly</span>
              <strong>{globalIndicators?.globalTemperature?.anomalyC != null
                ? `${globalIndicators.globalTemperature.anomalyC > 0 ? "+" : ""}${globalIndicators.globalTemperature.anomalyC.toFixed(2)} °C`
                : indicatorsError ? "Unavailable" : "Loading…"}</strong>
              {globalIndicators && <svg className="indicator-sparkline" viewBox="0 0 120 34" role="img" aria-label="Recent 24 monthly global temperature anomaly values"><path d={sparkline(globalIndicators.history.temperature, "anomalyC")} /></svg>}
              <small>{globalIndicators?.globalTemperature
                ? `${globalIndicators.globalTemperature.source} · vs ${globalIndicators.globalTemperature.baseline} · ${globalIndicators.globalTemperature.updatedAt}`
                : globalIndicators?.warnings?.[0] || indicatorsError || "Loading source data…"}</small>
            </div>
            <div className="indicator-value">
              <span>Atmospheric CO₂ · Mauna Loa</span>
              <strong>{globalIndicators?.atmosphericCo2?.ppm != null
                ? `${globalIndicators.atmosphericCo2.ppm.toFixed(2)} ppm`
                : indicatorsError ? "Unavailable" : "Loading…"}</strong>
              {globalIndicators && <svg className="indicator-sparkline" viewBox="0 0 120 34" role="img" aria-label="Recent 24 monthly Mauna Loa carbon dioxide readings"><path d={sparkline(globalIndicators.history.co2, "ppm")} /></svg>}
              <small>{globalIndicators?.atmosphericCo2
                ? `${globalIndicators.atmosphericCo2.source} · ${globalIndicators.atmosphericCo2.updatedAt} · ${globalIndicators.atmosphericCo2.quality} · station record`
                : globalIndicators?.warnings?.find((warning) => warning.includes("CO₂")) || indicatorsError || "Loading source data…"}</small>
            </div>
            <div className="indicator-value">
              <span>Active wildfire events</span>
              <strong>{environmentalEventsError
                ? "Unavailable"
                : environmentalEvents.filter((item) => item.categories.some((category) => category.id.toLowerCase() === "wildfires")).length}</strong>
              <small>NASA EONET event records · not satellite hotspot counts</small>
            </div>
            <div className="indicator-value">
              <span>Severe-weather events</span>
              <strong>{environmentalEventsError ? "Unavailable" : environmentalEvents.filter((item) => item.categories.some((category) => category.id.toLowerCase() === "severestorms")).length}</strong>
              <small>NASA EONET severe-storm event records</small>
            </div>
            <div className="indicator-value">
              <span>Local PM2.5 · model estimate</span>
              <strong>{airQualityError ? "Unavailable" : air.pm2_5 != null ? `${air.pm2_5} µg/m³` : "Loading…"}</strong>
              <small>{airQuality?.source || "Open-Meteo Air Quality"} · {airQuality?.current?.time || "selected location"}</small>
            </div>
          </div>
        </section>

        <section className="forecast-panel panel" id="forecast-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">SELECTED LOCATION · OPEN-METEO FORECAST</p>
              <h2>Forecast &amp; analysis</h2>
            </div>
            <span className="data-status">Model output · not a long-term climate prediction</span>
          </div>
          <div className="forecast-controls">
            <label>Variable
              <select value={forecastVariable} onChange={(event) => setForecastVariable(event.target.value)}>
                <option value="temperature">Temperature</option>
                <option value="precipitation">Precipitation probability</option>
              </select>
            </label>
            <label>Period
              <select value={forecastPeriod} onChange={(event) => setForecastPeriod(event.target.value)}>
                <option value="daily">5 day</option>
                <option value="hourly">12 hour</option>
              </select>
            </label>
            <span>{selectedLocation.name}{selectedLocation.country ? `, ${selectedLocation.country}` : ""} · {weather?.source || "Waiting for provider data"}</span>
          </div>
          {forecastChartValues.length > 1 ? (
            <svg className="forecast-chart" viewBox="0 0 600 170" role="img" aria-label={`${forecastVariable} forecast chart`}>
              <path d="M0,150 H600" className="chart-axis" />
              <path d={`${forecastChartPath} L600,150 L0,150 Z`} className="chart-fill" />
              <path d={forecastChartPath} className="chart-line" />
            </svg>
          ) : (
            <p className="data-note">{weatherError || "Forecast data is loading or unavailable for this location."}</p>
          )}
          <div className="chart-summary">
            {forecastChartValues.map((value, index) => (
              <span key={`${forecastPeriod}-${index}`}>{Number.isFinite(value) ? value : "—"}{forecastVariable === "temperature" ? " °C" : "%"}</span>
            ))}
          </div>
          {hourlyForecast.length > 0 && (
            <section className="hourly-forecast forecast-hourly" aria-label="Next 12 hours weather forecast">
              <p className="eyebrow">NEXT 12 HOURS · LOCAL TIME · {selectedLocation.name}</p>
              <div className="hourly-forecast-list">
                {hourlyForecast.map((hour, index) => (
                  <div className="hourly-forecast-item" key={`${hour.time}-${index}`}>
                    <time>{hour.time}</time>
                    <span
                      className="hourly-weather-icon"
                      role="img"
                      aria-label={WEATHER_DESCRIPTIONS[hour.weatherCode] || "Weather unavailable"}
                      title={WEATHER_DESCRIPTIONS[hour.weatherCode] || "Weather unavailable"}
                    >
                      {weatherIcon(hour.weatherCode)}
                    </span>
                    <strong>{hour.temperature == null ? "--" : `${hour.temperature}°`}</strong>
                    <small>🌧 {hour.rainChance == null ? "--" : `${hour.rainChance}%`}</small>
                  </div>
                ))}
              </div>
              <p className="source-note">Hourly forecast from {weather?.source || "Open-Meteo"} · forecast values, not live observations.</p>
            </section>
          )}
          {nextThreeDays.length > 0 && (
            <section className="three-day-forecast" aria-label="Next three days weather forecast">
              <p className="eyebrow">NEXT 3 DAYS · {selectedLocation.name} · LOCAL FORECAST</p>
              <div className="three-day-forecast-list">
                {nextThreeDays.map((day, index) => (
                  <article className="three-day-forecast-card" key={day.date}>
                    <span className="three-day-name">
                      {index === 0
                        ? "Today"
                        : new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" })}
                    </span>
                    <span
                      className="three-day-weather-icon"
                      role="img"
                      aria-label={WEATHER_DESCRIPTIONS[day.weatherCode] || "Weather unavailable"}
                      title={WEATHER_DESCRIPTIONS[day.weatherCode] || "Weather unavailable"}
                    >
                      {weatherIcon(day.weatherCode)}
                    </span>
                    <span className="three-day-condition">
                      {WEATHER_DESCRIPTIONS[day.weatherCode] || "Conditions unavailable"}
                    </span>
                    <strong>{day.high == null ? "--" : `${day.high}°`} <small>/ {day.low == null ? "--" : `${day.low}°`}C</small></strong>
                    <span className="three-day-rain">🌧 Rain chance {day.precipitation == null ? "--" : `${day.precipitation}%`}</span>
                    <time>{new Date(`${day.date}T12:00:00`).toLocaleDateString()}</time>
                  </article>
                ))}
              </div>
              <p className="source-note">Daily forecast from {weather?.source || "Open-Meteo"} · model prediction, not a long-term climate outlook.</p>
            </section>
          )}
        </section>

        <section className="saved-panel panel" id="saved-panel" aria-labelledby="saved-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">PERSONAL WATCHLIST</p>
              <h2 id="saved-title">Saved locations</h2>
            </div>
            <span className="pill">{savedLocations.length} SAVED</span>
          </div>
          {savedLocationsError && <p className="data-note">{savedLocationsError}</p>}
          {savedLocations.length ? (
            <div className="saved-location-list">
              {savedLocations.map((location) => (
                <div className="saved-location" key={`${location.latitude}-${location.longitude}`}>
                  <button
                    type="button"
                    className="saved-location-select"
                    onClick={() => {
                      selectLocation(location);
                      setActiveLayer("3D Earth");
                      document.getElementById("globe-card")?.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                      });
                    }}
                  >
                    <strong>{location.name}</strong>
                    <span>{location.country || `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`}</span>
                  </button>
                  <button
                    type="button"
                    className="saved-location-remove"
                    aria-label={`Remove ${location.name} from saved locations`}
                    onClick={() => toggleSavedLocation(location)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="saved-empty">Save a selected city or marker to keep it on this browser’s watchlist.</p>
          )}
        </section>

        {activeLayer === "Air quality" && (
          <section className="air-quality-panel panel" id="air-quality-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">CURRENT MODELLED POLLUTANT LEVELS</p>
                <h2>Local air quality</h2>
              </div>
              <span className="pill">{airQuality?.source || "OPEN-METEO"}</span>
            </div>
            <div className="air-quality-grid">
              {airQualityValues.map(([label, value, unit]) => (
                <Metric key={label} label={label} value={value} unit={unit} icon="◌" />
              ))}
            </div>
            {airQualityError && <p className="data-note">{airQualityError}</p>}
            <p className="source-note">Open-Meteo current air-quality model estimates for the selected location, not direct station measurements or a health advisory.</p>
          </section>
        )}

        <section className="content-grid">
          <article className={`panel ai-panel ${activeTab === "AI Assistant" || activeTab === "Climate AI" ? "open" : ""}`} id="ai-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">GENERATIVE AI</p>
                <h2>Climate analyst</h2>
              </div>
              <span className="ai-badge">✳ LOCAL LLM</span>
            </div>

            <p className="panel-description">
              Analyze the selected location using its available current weather-model and air-quality estimates. Select Climate anomalies to include the 1991–2020 daily comparison.
            </p>

            <form onSubmit={askAI} className="ai-form">
              <label htmlFor="climate-question">YOUR QUESTION</label>
              <textarea
                id="climate-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                maxLength={1000}
                rows={4}
                placeholder={`Ask about conditions in ${selectedLocation.name}...`}
              />
              <button className="primary-button" disabled={loading || dataLoading}>
                {loading ? <><span className="button-spinner" /> Analyzing local climate...</> : "✳ Analyze Local Climate"}
              </button>
            </form>

            {aiError && <div className="error-banner">{aiError}</div>}

            {(answer || chatMessages.length > 0) && (
              <div className="answer-card">
                <p className="eyebrow">SESSION CONVERSATION · AI-GENERATED RESPONSES</p>
                <div className="chat-history" aria-live="polite">
                  {chatMessages.map((message, index) => (
                    <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                      <span>{message.role === "user" ? "YOU" : "CLIMATE ANALYST"}</span>
                      <p>{message.content}</p>
                    </div>
                  ))}
                </div>
                {verifiedAirQuality && (
                  <div className="answer-source-data">
                    <p className="eyebrow">VERIFIED SOURCE DATA · MODEL ESTIMATES</p>
                    {verifiedAirQuality.pollutants.length > 0 ? (
                      <div className="verified-pollutants">
                        {verifiedAirQuality.pollutants.map((pollutant) => (
                          <div key={pollutant.label}>
                            <span>{pollutant.label}</span>
                            <strong>{pollutant.value} {pollutant.unit}</strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="data-note">Current pollutant values or source units are unavailable.</p>
                    )}
                    <p className="source-note">
                      {verifiedAirQuality.source}
                      {verifiedAirQuality.currentAt ? ` · ${verifiedAirQuality.currentAt}` : ""}
                    </p>
                  </div>
                )}
                {aiSources.length > 0 && (
                  <p className="source-note">
                    SOURCES: {aiSources.map((source, index) => (
                      <React.Fragment key={source.url}>
                        {index > 0 ? " · " : ""}<a href={source.url} target="_blank" rel="noreferrer">{source.name}</a>
                      </React.Fragment>
                    ))}
                  </p>
                )}
                <p className="disclaimer">
                  AI-generated information may contain errors. Verify
                  important environmental or safety decisions with trusted sources.
                </p>
              </div>
            )}
          </article>

          <article className="panel" id="events-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">GLOBAL MONITORING</p>
                <h2>Recent earthquake events</h2>
              </div>
              <span className="pill">
                {eventCategory === "Wildfires" || eventCategory === "Extreme weather"
                  ? `${environmentalEvents.length} NASA EVENTS`
                  : `${filteredEarthquakes.length} MATCHING EVENTS`}
              </span>
            </div>

            <p className="panel-description">
              Public USGS earthquake feed for the past day. Select a report to focus the globe and load its local weather.
            </p>

            <div className="event-filters">
              <label>
                Category
                <select
                  value={eventCategory}
                  onChange={(event) => {
                    const category = event.target.value;
                    setEventCategory(category);
                    const targetLayer = category === "Wildfires" || category === "Extreme weather" ? category : "Earthquakes";
                    setVisibleLayers((current) => current.includes(targetLayer) ? current : [...current, targetLayer]);
                    setActiveLayer(targetLayer);
                  }}
                >
                  <option>All categories</option>
                  <option>Earthquakes</option>
                  <option>Wildfires</option>
                  <option>Extreme weather</option>
                </select>
              </label>
              <label>
                Minimum magnitude
                <select
                  value={minimumMagnitude}
                  disabled={eventCategory === "Wildfires" || eventCategory === "Extreme weather"}
                  onChange={(event) => setMinimumMagnitude(event.target.value)}
                >
                  <option value="0">All magnitudes</option>
                  <option value="2.5">M2.5+</option>
                  <option value="4">M4.0+</option>
                  <option value="5">M5.0+</option>
                </select>
              </label>
            </div>

            <div className="event-list">
              {eventCategory === "Wildfires" || eventCategory === "Extreme weather" ? (
                environmentalEvents
                  .filter((item) => item.categories.some((category) => category.id.toLowerCase() === (eventCategory === "Wildfires" ? "wildfires" : "severestorms")))
                  .slice(0, 10)
                  .map((item) => (
                    <a className="event-row environmental-event-row" key={item.id} href={item.link || undefined} target={item.link ? "_blank" : undefined} rel={item.link ? "noreferrer" : undefined}>
                      <span className="magnitude event-category-mark">{eventCategory === "Wildfires" ? "FIRE" : "WX"}</span>
                      <span className="event-info">
                        <strong>{item.title}</strong>
                        <small>
                          {item.categories.map((category) => category.title).join(" · ")}
                          {item.magnitude != null ? ` · ${item.magnitudeDescription || "Magnitude"} ${item.magnitude}${item.magnitudeUnit ? ` ${item.magnitudeUnit}` : ""}` : ""}
                          {` · ${item.sources.map((source) => source.id).join(", ") || "NASA EONET"}`}
                        </small>
                      </span>
                      <time className="event-time" dateTime={item.date || undefined}>{item.date ? new Date(item.date).toLocaleString() : "Date unavailable"}</time>
                    </a>
                  ))
              ) : (eventCategory === "Earthquakes" || eventCategory === "All categories") && filteredEarthquakes
                .slice(0, 8)
                .map((quake) => (
                <button
                  type="button"
                  className="event-row event-row-button"
                  key={quake.id}
                  onClick={() => {
                    setActiveLayer("Weather");
                    selectLocation({
                      name: quake.place || "Earthquake event",
                      country: "",
                      latitude: quake.coordinates[1],
                      longitude: quake.coordinates[0]
                    });
                  }}
                >
                  <div className="magnitude">
                    {(quake.magnitude ?? 0).toFixed(1)}
                  </div>
                  <div className="event-info">
                    <strong>{quake.place || "Location unavailable"}</strong>
                    <small>USGS event report</small>
                  </div>
                  <time className="event-time" dateTime={quake.time ? new Date(quake.time).toISOString() : undefined}>
                    {quake.time
                      ? new Date(quake.time).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })
                      : "Time unavailable"}
                  </time>
                </button>
              ))}

              {((eventCategory === "Wildfires" || eventCategory === "Extreme weather") && !environmentalEventsError && !environmentalEvents.some((item) => item.categories.some((category) => category.id.toLowerCase() === (eventCategory === "Wildfires" ? "wildfires" : "severestorms")))) || (eventCategory !== "Wildfires" && eventCategory !== "Extreme weather" && filteredEarthquakes.length === 0) ? (
                <p className="empty-state">
                  {environmentalEventsError || earthquakeError || (eventCategory === "Wildfires" || eventCategory === "Extreme weather"
                    ? "No matching events are currently returned by NASA EONET."
                    : minimumMagnitude === "0"
                      ? "No earthquake events are currently available."
                      : `No earthquake reports meet the M${minimumMagnitude}+ filter.`)}
                </p>
              ) : null}
            </div>
            <p className="source-note">SOURCE: USGS · {minimumMagnitude === "0" ? "ALL MAGNITUDES" : `M${minimumMagnitude}+`} · PAST 24 HOURS · CLICK A REPORT TO FOCUS</p>
          </article>
        </section>

        <footer className="footer">
          CLIMATE TECH GLOBAL INTELLIGENCE
          <span>Current public data · AI-generated insights</span>
        </footer>
        <div className="planet-controls" role="toolbar" aria-label="Globe and map controls">
          <div className="view-mode-group" aria-label="View mode">
            <button type="button" className={viewMode === "3d" ? "selected" : ""} aria-pressed={viewMode === "3d"} onClick={() => setViewMode("3d")}>3D GLOBE</button>
            <button type="button" className={viewMode === "2d" ? "selected" : ""} aria-pressed={viewMode === "2d"} onClick={() => setViewMode("2d")}>STREET MAP</button>
            <button type="button" className={activeLayer === "Climate anomalies" ? "selected" : ""} aria-pressed={activeLayer === "Climate anomalies"} onClick={() => {
              setViewMode("3d");
              setActiveLayer("Climate anomalies");
              setVisibleLayers((current) => current.includes("Climate anomalies") ? current : [...current, "Climate anomalies"]);
            }}>OBSERVATIONS</button>
          </div>
          <span className="dock-divider" />
          <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => mapControls?.zoomOut()}>−</button>
          <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => mapControls?.zoomIn()}>+</button>
          <button type="button" aria-label="Reset globe camera" title="Reset camera" onClick={() => mapControls?.reset()}>⌖</button>
          <button type="button" aria-label="Fullscreen globe" title="Fullscreen" onClick={() => mapControls?.fullscreen()}>⛶</button>
          <span className="dock-connection"><i className={connectionStatus} />{dashboardDataStatus} DATA</span>
        </div>
        <div className="event-ticker" role="region" aria-label="Recent global environmental events">
          <span className="ticker-label">GLOBAL EVENT FEED</span>
          {environmentalEventsError && environmentalEvents.length === 0 && earthquakes.length === 0 ? (
            <span className="ticker-empty">Environmental event feeds unavailable · {environmentalEventsError}</span>
          ) : tickerEvents.length ? tickerEvents.map((item) => (
            <button
              type="button"
              className="ticker-item"
              key={item.id}
              onClick={() => {
                setVisibleLayers((current) => current.includes(item.layer) ? current : [...current, item.layer]);
                setActiveLayer(item.layer);
                setSelectedMapEvent({
                  title: item.title,
                  type: item.layer,
                  date: item.date,
                  source: item.source,
                  latitude: item.latitude,
                  longitude: item.longitude
                });
                selectLocation({ name: item.title, country: "", latitude: item.latitude, longitude: item.longitude });
              }}
            >
              <i />{item.title}<time>{item.source} · {item.date ? new Date(item.date).toLocaleString() : "Timestamp unavailable"}</time>
            </button>
          )) : <span className="ticker-empty">Loading environmental event feeds…</span>}
        </div>
      </section>
      {settingsOpen && (
        <div
          className="settings-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSettingsOpen(false);
          }}
        >
          <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">PLATFORM CONFIGURATION</p>
                <h2 id="settings-title">Data sources &amp; display</h2>
              </div>
              <button className="settings-close" type="button" onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button>
            </div>
            <p className="panel-description">
              This dashboard uses public data services. Values and availability depend on each provider.
            </p>
            <div className="settings-source-list">
              <div><strong>Weather &amp; forecast</strong><span>Open-Meteo · current model, hourly and daily forecast</span></div>
              <div><strong>Air quality</strong><span>Open-Meteo Air Quality · modeled pollutant estimates</span></div>
              <div><strong>Environmental events</strong><span>NASA EONET · curated open events; checked every 10 minutes</span></div>
              <div><strong>Earthquakes</strong><span>USGS · past-day feed, cached for five minutes</span></div>
              <div><strong>Global temperature and CO₂</strong><span>NASA GISTEMP v4 monthly global anomaly and NOAA GML monthly Mauna Loa CO₂; cached for six hours</span></div>
              <div><strong>River discharge</strong><span>Open-Meteo Flood API · selected-location model forecast; no risk categories inferred</span></div>
              <div><strong>Satellite &amp; thermal anomalies</strong><span>NASA GIBS · previous UTC day; fire detections are not confirmed incidents</span></div>
              <div><strong>Historical comparison</strong><span>Open-Meteo archive · 1991–2020 daily mean, same calendar date ±7 days</span></div>
              <div><strong>Climate risk alerts</strong><span>Not configured · no location-specific risk scores are inferred</span></div>
              <div><strong>Local climate assistant</strong><span>Ollama · {connectionStatus === "online" ? "Express backend connected" : "backend connection unavailable"}</span></div>
            </div>
            <div className="display-settings">
              <label><span><strong>Auto-rotate Earth</strong><small>Pause rotation to inspect a region.</small></span><input type="checkbox" checked={autoRotateEnabled} onChange={(event) => setAutoRotateEnabled(event.target.checked)} /></label>
              <label><span><strong>Ambient network particles</strong><small>Decorative visualization only; not measurements.</small></span><input type="checkbox" checked={ambientEnabled} onChange={(event) => setAmbientEnabled(event.target.checked)} /></label>
            </div>
            <div className="settings-actions">
              <span>Last data refresh: {lastUpdated || "Not refreshed yet"}</span>
              <button className="refresh-button" type="button" onClick={() => {
                setSettingsOpen(false);
                loadDashboard(selectedLocation, true);
              }}>
                ↻ Refresh public data
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}