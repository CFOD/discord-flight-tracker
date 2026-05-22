import { useRef, useState, Suspense, useEffect, useMemo, createContext, useContext } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

const CamDistContext = createContext(5);
import * as THREE from 'three';
import { TextureLoader } from 'three';

const EARTH_TEXTURE = '/textures/earth-blue-marble.jpg';
const BUMP_TEXTURE = '/textures/earth-topology.jpg';
const RADIUS = 2;
const BORDER_RADIUS = RADIUS + 0.003;
const LABEL_RADIUS = RADIUS + 0.012;
const ATC_RADIUS = RADIUS + 0.006;
const MAX_CRUISE_LIFT = 0.04;

const BOUNDARIES_URL = '/boundaries.geojson';

// Facility codes: 1=FSS, 6=CTR draw FIR polygon; 2=DEL,3=GND,4=TWR,5=APP draw airport dot
const FIR_FACILITIES = new Set([1, 6]);
const AIRPORT_FACILITIES = new Set([2, 3, 4, 5]);

function latLngToVec3(lat, lng, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// Realistic flight altitude profile: quick climb, long cruise, quick descent.
// t = 0..1 along route. Returns 0..1 lift factor.
function flightProfile(t) {
  const climbEnd = 0.12;
  const descentStart = 0.82;
  if (t < climbEnd) {
    // Steep climb — use power curve so it rises quickly
    return Math.pow(t / climbEnd, 0.5);
  } else if (t > descentStart) {
    // Descent back to surface
    return Math.pow(1 - (t - descentStart) / (1 - descentStart), 0.5);
  }
  return 1.0; // cruise
}

function buildRoutePoints(waypoints) {
  if (!waypoints || waypoints.length < 2) return null;

  const points = [];
  const n = waypoints.length;

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const lift = flightProfile(t) * MAX_CRUISE_LIFT;
    const { lat, lon } = waypoints[i];
    points.push(latLngToVec3(lat, lon, RADIUS + lift));
  }

  // CatmullRom through the points for a smooth tube
  return new THREE.CatmullRomCurve3(points);
}

function FlightRoute({ flight }) {
  const { waypoints, color } = flight;
  const routeColor = color ?? '#f0cb00';
  const camDist = useContext(CamDistContext);
  const tubeRadius = 0.0015 * (camDist / 5);

  const { tubeGeom, flownLineGeom } = useMemo(() => {
    const curve = buildRoutePoints(waypoints);
    if (!curve) return {};

    const totalPoints = Math.max(waypoints.length * 4, 120);
    const tubeGeom = new THREE.TubeGeometry(curve, totalPoints, tubeRadius, 5, false);

    // Find closest point on the curve to current plane position
    const allPositions = curve.getPoints(totalPoints);
    const planeVec = latLngToVec3(flight.lat, flight.lon, RADIUS);
    let closestIdx = 0;
    let closestDist = Infinity;
    allPositions.forEach((p, i) => {
      const d = p.distanceTo(planeVec);
      if (d < closestDist) { closestDist = d; closestIdx = i; }
    });

    // Flown portion as a simple line (avoids CatmullRom re-interpolation distortion)
    let flownLineGeom = null;
    if (closestIdx >= 1) {
      const flownPositions = new Float32Array(
        allPositions.slice(0, closestIdx + 1).flatMap((p) => [p.x, p.y, p.z])
      );
      flownLineGeom = new THREE.BufferGeometry();
      flownLineGeom.setAttribute('position', new THREE.BufferAttribute(flownPositions, 3));
    }

    return { tubeGeom, flownLineGeom };
  }, [waypoints, flight.lat, flight.lon]);

  if (!tubeGeom) return null;

  return (
    <group>
      {/* Full route — faint tube */}
      <mesh geometry={tubeGeom}>
        <meshBasicMaterial color={routeColor} transparent opacity={0.2} depthWrite={false} />
      </mesh>
      {/* Flown portion — bright line */}
      {flownLineGeom && (
        <line geometry={flownLineGeom}>
          <lineBasicMaterial color={routeColor} transparent opacity={0.9} depthWrite={false} />
        </line>
      )}
    </group>
  );
}

function polygonToLines(coords, radius) {
  const points = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[i + 1];
    const v1 = latLngToVec3(lat1, lng1, radius);
    const v2 = latLngToVec3(lat2, lng2, radius);
    points.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
  }
  return points;
}

function geojsonToLineSegments(features, radius) {
  const allPoints = [];
  for (const feature of features) {
    const { type, coordinates } = feature.geometry;
    const rings = type === 'Polygon' ? coordinates : type === 'MultiPolygon' ? coordinates.flat() : [];
    for (const ring of rings) {
      allPoints.push(...polygonToLines(ring, radius));
    }
  }
  return new Float32Array(allPoints);
}

function getFeatureName(properties) {
  return properties.name ?? properties.NAME ?? properties.ADMIN ?? '';
}

function countryCentroids(features) {
  return features.map((f) => {
    const { type, coordinates } = f.geometry;
    const ring = type === 'Polygon' ? coordinates[0] : coordinates[0][0];
    let sumLng = 0, sumLat = 0;
    for (const [lng, lat] of ring) { sumLng += lng; sumLat += lat; }
    return { name: getFeatureName(f.properties), lat: sumLat / ring.length, lng: sumLng / ring.length };
  });
}

function makeLabelTexture(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 4;
  ctx.strokeText(name, 128, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(name, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function CountryLabel({ name, lat, lng, opacity = 1 }) {
  const camDist = useContext(CamDistContext);
  const scale = camDist / 5;
  const texture = useMemo(() => makeLabelTexture(name), [name]);
  const pos = useMemo(() => latLngToVec3(lat, lng, LABEL_RADIUS), [lat, lng]);

  const quaternion = useMemo(() => {
    const normal = pos.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const safeUp = Math.abs(normal.dot(up)) > 0.99 ? new THREE.Vector3(1, 0, 0) : up;
    const matrix = new THREE.Matrix4().lookAt(normal, new THREE.Vector3(0, 0, 0), safeUp);
    return new THREE.Quaternion().setFromRotationMatrix(matrix);
  }, [pos]);

  if (opacity <= 0) return null;

  return (
    <mesh position={pos} quaternion={quaternion} scale={[scale, scale, 1]}>
      <planeGeometry args={[0.28, 0.07]} />
      <meshBasicMaterial map={texture} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function CountryBorders({ geojson }) {
  const [geometry, setGeometry] = useState(null);

  useEffect(() => {
    let cancelled = false;
    // Yield to the renderer first, then build geometry off the hot path
    const id = setTimeout(() => {
      const positions = geojsonToLineSegments(geojson.features, BORDER_RADIUS);
      if (cancelled) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      setGeometry(geo);
    }, 0);
    return () => { cancelled = true; clearTimeout(id); };
  }, [geojson]);

  if (!geometry) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#ffffff" transparent opacity={0.25} depthWrite={false} />
    </lineSegments>
  );
}

function CountryLabels({ geojson, opacity = 1 }) {
  const centroids = useMemo(() => countryCentroids(geojson.features), [geojson]);

  return (
    <>
      {centroids.map(({ name, lat, lng }) => (
        <CountryLabel key={name} name={name} lat={lat} lng={lng} opacity={opacity} />
      ))}
    </>
  );
}

function makeCityLabelTexture(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 48);
  ctx.font = '16px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 3;
  ctx.strokeText(name, 128, 24);
  ctx.fillStyle = 'rgba(220,220,220,0.95)';
  ctx.fillText(name, 128, 24);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function CityLabel({ name, lat, lng, opacity }) {
  const camDist = useContext(CamDistContext);
  const scale = (camDist / 5) * 0.6;
  const texture = useMemo(() => makeCityLabelTexture(name), [name]);
  const pos = useMemo(() => latLngToVec3(lat, lng, LABEL_RADIUS), [lat, lng]);

  const quaternion = useMemo(() => {
    const normal = pos.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const safeUp = Math.abs(normal.dot(up)) > 0.99 ? new THREE.Vector3(1, 0, 0) : up;
    const matrix = new THREE.Matrix4().lookAt(normal, new THREE.Vector3(0, 0, 0), safeUp);
    return new THREE.Quaternion().setFromRotationMatrix(matrix);
  }, [pos]);

  if (opacity <= 0) return null;

  return (
    <mesh position={pos} quaternion={quaternion} scale={[scale, scale, 1]}>
      <planeGeometry args={[0.28, 0.053]} />
      <meshBasicMaterial map={texture} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function CityLabels({ cities }) {
  const camDist = useContext(CamDistContext);
  const maxRank = getCityMaxRank(camDist);
  if (maxRank < 0) return null;

  return (
    <>
      {cities
        .filter((c) => c.scalerank <= maxRank)
        .map((c) => (
          <CityLabel
            key={c.name + c.lat + c.lng}
            name={c.name}
            lat={c.lat}
            lng={c.lng}
            opacity={getCityOpacity(camDist, c.scalerank)}
          />
        ))}
    </>
  );
}

function buildAtcSectorLines(boundaries, activeFirIds) {
  const points = [];
  for (const feature of boundaries.features) {
    if (!activeFirIds.has(feature.properties.id)) continue;
    const { type, coordinates } = feature.geometry;
    const rings = type === 'Polygon' ? coordinates : type === 'MultiPolygon' ? coordinates.flat() : [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [lng1, lat1] = ring[i];
        const [lng2, lat2] = ring[i + 1];
        const v1 = latLngToVec3(lat1, lng1, ATC_RADIUS);
        const v2 = latLngToVec3(lat2, lng2, ATC_RADIUS);
        points.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
      }
    }
  }
  return new Float32Array(points);
}

function AtcFirLabel({ id, lat, lng }) {
  const camDist = useContext(CamDistContext);
  const scale = camDist / 5;
  const texture = useMemo(() => makeLabelTexture(id), [id]);
  const pos = useMemo(() => latLngToVec3(lat, lng, LABEL_RADIUS), [lat, lng]);
  const quaternion = useMemo(() => {
    const normal = pos.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const safeUp = Math.abs(normal.dot(up)) > 0.99 ? new THREE.Vector3(1, 0, 0) : up;
    const matrix = new THREE.Matrix4().lookAt(normal, new THREE.Vector3(0, 0, 0), safeUp);
    return new THREE.Quaternion().setFromRotationMatrix(matrix);
  }, [pos]);

  return (
    <mesh position={pos} quaternion={quaternion} scale={[scale, scale, 1]}>
      <planeGeometry args={[0.28, 0.07]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function AtcOverlay({ controllers, boundaries }) {
  const firIds = useMemo(() => {
    const ids = new Set();
    for (const c of controllers) {
      if (FIR_FACILITIES.has(c.facility)) ids.add(c.callsign.split('_')[0]);
    }
    return ids;
  }, [controllers]);

  // Get centroid for each active FIR from boundaries GeoJSON
  const firLabels = useMemo(() => {
    if (!boundaries) return [];
    return boundaries.features
      .filter((f) => firIds.has(f.properties.id))
      .map((f) => {
        const lat = parseFloat(f.properties.label_lat);
        const lng = parseFloat(f.properties.label_lon);
        if (isNaN(lat) || isNaN(lng)) return null;
        return { id: f.properties.id, lat, lng };
      })
      .filter(Boolean);
  }, [boundaries, firIds]);

  const sectorGeometry = useMemo(() => {
    if (!boundaries || firIds.size === 0) return null;
    const positions = buildAtcSectorLines(boundaries, firIds);
    if (positions.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [boundaries, firIds]);

  return (
    <>
      {sectorGeometry && (
        <lineSegments geometry={sectorGeometry}>
          <lineBasicMaterial color="#00eeff" transparent opacity={0.85} depthWrite={false} />
        </lineSegments>
      )}
      {firLabels.map(({ id, lat, lng }) => (
        <AtcFirLabel key={id} id={id} lat={lat} lng={lng} />
      ))}
    </>
  );
}

function Atmosphere() {
  return (
    <mesh>
      <sphereGeometry args={[RADIUS * 1.02, 128, 128]} />
      <shaderMaterial
        side={THREE.BackSide}
        transparent
        uniforms={{
          innerColor: { value: new THREE.Color(0x88bbff) },
          outerColor: { value: new THREE.Color(0xaaddff) },
          intensity: { value: 1.2 },
        }}
        vertexShader={`
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          varying vec3 vNormal;
          uniform vec3 innerColor;
          uniform vec3 outerColor;
          uniform float intensity;
          void main() {
            float rim = 1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0));
            float alpha = pow(rim, 4.5) * intensity * 0.55;
            vec3 color = mix(innerColor, outerColor, pow(rim, 2.0));
            gl_FragColor = vec4(color, alpha);
          }
        `}
      />
    </mesh>
  );
}

// LOD thresholds (camDist): 5 = fully zoomed out, 2.5 = closest
const LABEL_FADE_START = 4.0;   // country labels start fading
const LABEL_FADE_END = 3.2;     // country labels fully gone

// City labels: appear as country labels disappear, more cities revealed closer in
// scalerank 0-2 (capitals + megacities) show from camDist < 3.8
// scalerank 3-4 (large cities) show from camDist < 3.3
// scalerank 5-6 (medium cities) show from camDist < 2.9
// scalerank 7-8 (smaller cities) show from camDist < 2.6
const CITY_RANK_THRESHOLDS = [
  { maxRank: 2, showBelow: 3.8 },
  { maxRank: 4, showBelow: 3.3 },
  { maxRank: 6, showBelow: 2.9 },
  { maxRank: 8, showBelow: 2.6 },
];

const BORDER_MID_THRESHOLD = 3.8;
const BORDER_HIGH_THRESHOLD = 3.2;

function getLabelOpacity(camDist) {
  if (camDist >= LABEL_FADE_START) return 1;
  if (camDist <= LABEL_FADE_END) return 0;
  return (camDist - LABEL_FADE_END) / (LABEL_FADE_START - LABEL_FADE_END);
}

function getCityMaxRank(camDist) {
  for (const { maxRank, showBelow } of CITY_RANK_THRESHOLDS) {
    if (camDist < showBelow) return maxRank;
  }
  return -1; // no cities shown
}

function getCityOpacity(camDist, rank) {
  // Find the threshold band this rank belongs to
  const band = CITY_RANK_THRESHOLDS.find((t) => rank <= t.maxRank);
  if (!band || camDist >= band.showBelow) return 0;
  // Fade in over 0.2 units below the threshold
  const fadeRange = 0.2;
  if (camDist < band.showBelow - fadeRange) return 1;
  return (band.showBelow - camDist) / fadeRange;
}

function EarthMesh({ flights, onFlightClick, geojson, geojson110m, geojson10m, cities, controllers, boundaries, rotating }) {
  const meshRef = useRef();
  const [colorMap, bumpMap] = useLoader(TextureLoader, [EARTH_TEXTURE, BUMP_TEXTURE]);

  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.anisotropy = 16;
  bumpMap.anisotropy = 16;

  useFrame((_, delta) => {
    if (meshRef.current && rotating) meshRef.current.rotation.y += delta * 0.05;
  });

  const camDist = useContext(CamDistContext);
  const labelOpacity = getLabelOpacity(camDist);

  // Pick highest-detail available geojson for current zoom
  const activeBorderGeojson = (() => {
    if (camDist < BORDER_HIGH_THRESHOLD && geojson10m) return geojson10m;
    if (camDist < BORDER_MID_THRESHOLD && geojson110m) return geojson110m;
    return geojson;
  })();

  return (
    <group ref={meshRef}>
      <mesh>
        <sphereGeometry args={[RADIUS, 128, 128]} />
        <meshStandardMaterial map={colorMap} bumpMap={bumpMap} bumpScale={0.02} roughness={0.3} metalness={0.05} />
      </mesh>
      <Atmosphere />
      {activeBorderGeojson && <CountryBorders geojson={activeBorderGeojson} />}
      {geojson && labelOpacity > 0 && <CountryLabels geojson={geojson} opacity={labelOpacity} />}
      {cities.length > 0 && <CityLabels cities={cities} />}
      {controllers.length > 0 && <AtcOverlay controllers={controllers} boundaries={boundaries} />}
      {flights.map((flight) => (
        <group key={flight.discordId}>
          {flight.waypoints?.length >= 2 && <FlightRoute flight={flight} />}
          <FlightMarker flight={flight} onClick={onFlightClick} />
        </group>
      ))}
    </group>
  );
}

function FlightMarker({ flight, onClick }) {
  const [hovered, setHovered] = useState(false);
  const camDist = useContext(CamDistContext);
  const scale = camDist / 5; // 1.0 at default distance, shrinks when zoomed in
  const baseRadius = 0.012 * scale;
  const pos = latLngToVec3(flight.lat, flight.lon, RADIUS + 0.005 + baseRadius);
  const color = flight.color ?? '#f0cb00';

  return (
    <mesh
      position={pos}
      onClick={(e) => { e.stopPropagation(); onClick(flight, e.nativeEvent ?? e); }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <sphereGeometry args={[hovered ? baseRadius * 1.4 : baseRadius, 8, 8]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

function CameraTracker({ onUpdate }) {
  const lastRef = useRef(5);
  useFrame(({ camera }) => {
    const d = camera.position.length();
    // Only trigger update when distance changes meaningfully (avoids thrash)
    if (Math.abs(d - lastRef.current) > 0.05) {
      lastRef.current = d;
      onUpdate(d);
    }
  });
  return null;
}

export function Globe({ flights, controllers, onFlightClick }) {
  const [geojson, setGeojson] = useState(null);
  const [geojson110m, setGeojson110m] = useState(null);
  const [geojson10m, setGeojson10m] = useState(null);
  const geojson10mLoadedRef = useRef(false);
  const [cities, setCities] = useState([]);
  const citiesLoadedRef = useRef(false);
  const [boundaries, setBoundaries] = useState(null);
  const [camDist, setCamDist] = useState(5);
  const [rotating, setRotating] = useState(true);

  useEffect(() => {
    fetch('/countries.geojson')
      .then((r) => r.json())
      .then(setGeojson)
      .catch(console.error);
    fetch('/countries-110m.geojson')
      .then((r) => r.json())
      .then(setGeojson110m)
      .catch(console.error);
  }, []);

  // Lazy-load 10m borders + cities when the user first zooms in
  useEffect(() => {
    if (camDist < BORDER_HIGH_THRESHOLD + 0.3 && !geojson10mLoadedRef.current) {
      geojson10mLoadedRef.current = true;
      fetch('/countries-10m.geojson')
        .then((r) => r.json())
        .then(setGeojson10m)
        .catch(console.error);
    }
    if (camDist < CITY_RANK_THRESHOLDS[0].showBelow + 0.3 && !citiesLoadedRef.current) {
      citiesLoadedRef.current = true;
      fetch('/cities.geojson')
        .then((r) => r.json())
        .then((data) => {
          const parsed = data.features.map((f) => ({
            name: f.properties.name,
            scalerank: f.properties.scalerank,
            lat: f.geometry.coordinates[1],
            lng: f.geometry.coordinates[0],
          }));
          setCities(parsed);
        })
        .catch(console.error);
    }
  }, [camDist]);

  useEffect(() => {
    fetch(BOUNDARIES_URL)
      .then((r) => r.json())
      .then((data) => {
        console.log('[Boundaries] loaded', data.features?.length, 'features');
        setBoundaries(data);
      })
      .catch((e) => console.error('[Boundaries] fetch failed', e));
  }, []);

  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 45 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true, alpha: true }}
      onPointerDown={() => setRotating(false)}
      onWheel={() => setRotating(false)}
    >
      <CamDistContext.Provider value={camDist}>
        <ambientLight intensity={4.0} />
        <pointLight position={[10, 10, 10]} intensity={3.0} />
        <pointLight position={[-10, -10, -10]} intensity={1.5} />
        <pointLight position={[0, 10, -10]} intensity={1.5} />
        <Suspense fallback={null}>
          <EarthMesh flights={flights} onFlightClick={onFlightClick} geojson={geojson} geojson110m={geojson110m} geojson10m={geojson10m} cities={cities} controllers={controllers} boundaries={boundaries} rotating={rotating} />
        </Suspense>
        <CameraTracker onUpdate={setCamDist} />
        <OrbitControls
          enableZoom={true}
          enablePan={false}
          minDistance={2.5}
          maxDistance={8}
          autoRotate={false}
          dampingFactor={0.05}
          enableDamping={true}
          makeDefault
        />
      </CamDistContext.Provider>
    </Canvas>
  );
}
