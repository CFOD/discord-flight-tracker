import { useRef, useState, Suspense, useEffect, useMemo, createContext, useContext } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { Earcut } from 'three/src/extras/Earcut.js';

const CamDistContext = createContext(5);
import * as THREE from 'three';
import { TextureLoader } from 'three';

const EARTH_TEXTURE_4K = '/textures/earth-blue-marble.jpg';
const EARTH_TEXTURE_8K = '/textures/earth-8k.jpg';
const EARTH_TEXTURE_16K = '/textures/earth-16k.jpg';
const BUMP_TEXTURE = '/textures/earth-topology.jpg';
const RADIUS = 2;
const BORDER_RADIUS = RADIUS + 0.003;
const LABEL_RADIUS = RADIUS + 0.012;
const ATC_RADIUS = RADIUS + 0.006;
// MAX_CRUISE_LIFT corresponds to ~40,000 ft above surface on the globe
const MAX_CRUISE_ALT_FT = 40000;
const MAX_CRUISE_LIFT = 0.04;

function altToLift(altFt) {
  if (!altFt || altFt <= 0) return 0;
  return Math.min(altFt / MAX_CRUISE_ALT_FT, 1) * MAX_CRUISE_LIFT;
}

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

// Fallback profile when waypoints have no altitude data.
// t = 0..1 along route. Returns 0..1 lift factor.
function flightProfile(t) {
  const climbEnd = 0.15;
  const descentStart = 0.85;
  if (t < climbEnd) return Math.pow(t / climbEnd, 0.5);
  if (t > descentStart) return Math.pow(1 - (t - descentStart) / (1 - descentStart), 0.5);
  return 1.0;
}

function buildRoutePoints(waypoints) {
  if (!waypoints || waypoints.length < 2) return null;

  const hasAltData = waypoints.some((w) => w.alt != null && w.alt > 0);
  const n = waypoints.length;
  const points = [];

  for (let i = 0; i < n; i++) {
    const { lat, lon, alt } = waypoints[i];
    let lift;
    if (hasAltData) {
      // Use real altitude — null/0 entries (origin, dest) interpolate via CatmullRom naturally
      lift = altToLift(alt ?? 0);
    } else {
      lift = flightProfile(i / (n - 1)) * MAX_CRUISE_LIFT;
    }
    points.push(latLngToVec3(lat, lon, RADIUS + lift));
  }

  return new THREE.CatmullRomCurve3(points);
}

// Soften a hex colour for route lines — desaturate and reduce brightness
function softenColor(hex) {
  const c = new THREE.Color(hex ?? '#f0cb00');
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s * 0.55, Math.min(hsl.l * 0.75 + 0.15, 0.65));
  return '#' + c.getHexString();
}

useGLTF.setDecoderPath('/draco/');

const _waypointDotGeom = new THREE.SphereGeometry(1, 4, 4);
const _waypointDotMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
const _mat4 = new THREE.Matrix4();

function WaypointDots({ positions, color, radius }) {
  const meshRef = useRef();

  useMemo(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const c = new THREE.Color(color);
    positions.forEach((pos, i) => {
      _mat4.makeScale(radius, radius, radius);
      _mat4.setPosition(pos);
      mesh.setMatrixAt(i, _mat4);
      mesh.setColorAt(i, c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[_waypointDotGeom, _waypointDotMat, positions.length]}>
      <meshBasicMaterial color={color} transparent opacity={0.5} depthWrite={false} />
    </instancedMesh>
  );
}

function FlightRoute({ flight, showTrail, showRoute }) {
  const { waypoints, trail, color } = flight;
  const routeColor = softenColor(color);
  const camDist = useContext(CamDistContext);
  const waypointDotRadius = 0.003 * (camDist / 5);
  const zoomFactor = Math.min(camDist / 5, 1);
  const routeOpacity = 0.25 + zoomFactor * 0.5;
  const trailOpacity = 0.7 + zoomFactor * 0.25;

  const waypointsKey = useMemo(() =>
    waypoints ? waypoints.map((w) => `${w.lat},${w.lon}`).join('|') : ''
  , [waypoints]);

  const { routeGeom, waypointPositions } = useMemo(() => {
    const curve = buildRoutePoints(waypoints);
    if (!curve) return {};
    const totalPoints = Math.max(waypoints.length * 4, 120);
    const allPositions = curve.getPoints(totalPoints);
    const toArr = (pts) => new Float32Array(pts.flatMap((p) => [p.x, p.y, p.z]));
    const makeLineGeom = (pts) => {
      if (pts.length < 2) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(toArr(pts), 3));
      return g;
    };
    const routeGeom = makeLineGeom(allPositions);
    const waypointPositions = waypoints.slice(1, -1).map(({ lat, lon, alt }) =>
      latLngToVec3(lat, lon, RADIUS + altToLift(alt ?? 0))
    );
    return { routeGeom, waypointPositions };
  }, [waypointsKey]);

  const trailGeom = useMemo(() => {
    if (!trail || trail.length < 2) return null;
    const pts = trail.map(({ lat, lon, alt }) => latLngToVec3(lat, lon, RADIUS + altToLift(alt ?? 0)));
    const arr = new Float32Array(pts.flatMap((p) => [p.x, p.y, p.z]));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  }, [trail]);

  if (!showTrail && !showRoute) return null;

  return (
    <group>
      {showRoute && routeGeom && (
        <line geometry={routeGeom}>
          <lineBasicMaterial color={routeColor} transparent opacity={routeOpacity} depthWrite={false} linewidth={3} />
        </line>
      )}
      {showRoute && waypointPositions?.length > 0 && (
        <WaypointDots positions={waypointPositions} color={routeColor} radius={waypointDotRadius} />
      )}
      {showTrail && trailGeom && (
        <line geometry={trailGeom}>
          <lineBasicMaterial color={routeColor} transparent opacity={trailOpacity} depthWrite={false} linewidth={3} />
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

function ringArea(ring) {
  // Shoelace formula for approximate polygon area
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(area / 2);
}

function ringCentroid(ring) {
  // Area-weighted centroid via shoelace
  let cx = 0, cy = 0, area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    cx += (ring[j][0] + ring[i][0]) * cross;
    cy += (ring[j][1] + ring[i][1]) * cross;
    area += cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-10) {
    // Degenerate — fall back to average
    let sx = 0, sy = 0;
    for (const [x, y] of ring) { sx += x; sy += y; }
    return [sx / ring.length, sy / ring.length];
  }
  return [cx / (6 * area), cy / (6 * area)];
}

function countryCentroids(features) {
  return features.map((f) => {
    const { type, coordinates } = f.geometry;
    // For MultiPolygon, use the largest polygon's outer ring
    const outerRings = type === 'Polygon'
      ? [coordinates[0]]
      : coordinates.map((poly) => poly[0]);
    const largest = outerRings.reduce((best, ring) =>
      ringArea(ring) > ringArea(best) ? ring : best
    );
    const [lng, lat] = ringCentroid(largest);
    return { name: getFeatureName(f.properties), lat, lng };
  });
}

function makeLabelTexture(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = '500 18px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 4;
  ctx.strokeText(name, 128, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
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
      <lineBasicMaterial color="#c8d8e8" transparent opacity={0.18} depthWrite={false} />
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
  ctx.font = '13px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.lineWidth = 3;
  ctx.strokeText(name, 128, 24);
  ctx.fillStyle = 'rgba(200,210,220,0.95)';
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
  const { camera } = useThree();
  const maxRank = getCityMaxRank(camDist);
  if (maxRank < 0) return null;

  // Cull to the geometrically visible cap — the horizon angle for a sphere of
  // RADIUS viewed from camDist. Adds a small margin so edge labels don't pop in.
  const camDir = camera.position.clone().normalize();
  const horizonDot = Math.sqrt(1 - (RADIUS / camDist) ** 2) - 0.05;
  // Project to NDC, then greedily keep cities that don't overlap already-kept labels.
  // Cities are pre-sorted by rank (most important first) so important ones win.
  const _v3 = new THREE.Vector3();
  const _proj = new THREE.Vector3();
  // Label dimensions in NDC space — approximate based on text length
  const labelH = 0.06;

  const kept = [];
  const occupied = []; // { cx, cy, hw, hh } in NDC

  for (const c of cities) {
    if (c.scalerank > maxRank) continue;
    _v3.copy(latLngToVec3(c.lat, c.lng, 1).normalize());
    if (_v3.dot(camDir) <= horizonDot) continue;

    // Project world pos to NDC (-1..1)
    _proj.copy(latLngToVec3(c.lat, c.lng, LABEL_RADIUS));
    _proj.project(camera);

    const cx = _proj.x;
    const cy = _proj.y;
    const hw = Math.min(0.04 + c.name.length * 0.012, 0.35); // half-width
    const hh = labelH / 2;

    // Check collision against all kept labels
    let overlaps = false;
    for (const o of occupied) {
      if (Math.abs(cx - o.cx) < hw + o.hw && Math.abs(cy - o.cy) < hh + o.hh) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) {
      kept.push(c);
      occupied.push({ cx, cy, hw, hh });
    }
  }
  const visible = kept;

  return (
    <>
      {visible.map((c) => (
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

// Subdivide a spherical triangle so it hugs the globe surface.
// Each edge midpoint is pushed to sphere radius r.
function subdivideSphericalTri(a, b, c, r, depth, outPositions, outIndices) {
  if (depth === 0) {
    const base = outPositions.length / 3;
    outPositions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    outIndices.push(base, base + 1, base + 2);
    return;
  }
  const ab = a.clone().add(b).normalize().multiplyScalar(r);
  const bc = b.clone().add(c).normalize().multiplyScalar(r);
  const ca = c.clone().add(a).normalize().multiplyScalar(r);
  subdivideSphericalTri(a, ab, ca, r, depth - 1, outPositions, outIndices);
  subdivideSphericalTri(ab, b, bc, r, depth - 1, outPositions, outIndices);
  subdivideSphericalTri(ca, bc, c, r, depth - 1, outPositions, outIndices);
  subdivideSphericalTri(ab, bc, ca, r, depth - 1, outPositions, outIndices);
}

function buildAtcSectorFills(boundaries, activeFirIds) {
  const positions = [];
  const indices = [];

  for (const feature of boundaries.features) {
    if (!activeFirIds.has(feature.properties.id)) continue;
    const { type, coordinates } = feature.geometry;
    const polys = type === 'Polygon' ? [coordinates] : type === 'MultiPolygon' ? coordinates : [];

    for (const poly of polys) {
      const outer = poly[0];
      if (!outer || outer.length < 3) continue;

      // Earcut needs flat 2D coords [x0,y0, x1,y1, ...]
      const flat2d = outer.flatMap(([lng, lat]) => [lng, lat]);
      const triIndices = Earcut.triangulate(flat2d, null, 2);

      // For each triangle, project verts onto sphere and subdivide
      for (let i = 0; i < triIndices.length; i += 3) {
        const [ia, ib, ic] = [triIndices[i], triIndices[i + 1], triIndices[i + 2]];
        const va = latLngToVec3(flat2d[ia * 2 + 1], flat2d[ia * 2], ATC_RADIUS);
        const vb = latLngToVec3(flat2d[ib * 2 + 1], flat2d[ib * 2], ATC_RADIUS);
        const vc = latLngToVec3(flat2d[ic * 2 + 1], flat2d[ic * 2], ATC_RADIUS);
        subdivideSphericalTri(va, vb, vc, ATC_RADIUS, 2, positions, indices);
      }
    }
  }

  if (positions.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setIndex(indices);
  return geo;
}

function AtcFirLabel({ id, lat, lng }) {
  const camDist = useContext(CamDistContext);
  const scale = (camDist / 5) * 0.6;
  const texture = useMemo(() => makeCityLabelTexture(id), [id]);
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
      <planeGeometry args={[0.28, 0.053]} />
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

  const fillGeometry = useMemo(() => {
    if (!boundaries || firIds.size === 0) return null;
    return buildAtcSectorFills(boundaries, firIds);
  }, [boundaries, firIds]);

  return (
    <>
      {fillGeometry && (
        <mesh geometry={fillGeometry}>
          <meshBasicMaterial color="#40c8e0" transparent opacity={0.12} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {sectorGeometry && (
        <lineSegments geometry={sectorGeometry}>
          <lineBasicMaterial color="#40c8e0" transparent opacity={0.8} depthWrite={false} />
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
  { maxRank: 2, showBelow: 3.6 },  // 1M+ cities
  { maxRank: 3, showBelow: 3.2 },  // 500k+
  { maxRank: 4, showBelow: 2.95 }, // 100k+
  { maxRank: 5, showBelow: 2.8 },  // 50k+
  { maxRank: 6, showBelow: 2.65 }, // 20k+
  { maxRank: 7, showBelow: 2.55 }, // all towns
];


function getLabelOpacity(camDist) {
  if (camDist >= LABEL_FADE_START) return 1;
  if (camDist <= LABEL_FADE_END) return 0;
  return (camDist - LABEL_FADE_END) / (LABEL_FADE_START - LABEL_FADE_END);
}

function getCityMaxRank(camDist) {
  // Return the highest rank whose threshold has been crossed
  let max = -1;
  for (const { maxRank, showBelow } of CITY_RANK_THRESHOLDS) {
    if (camDist < showBelow) max = maxRank;
  }
  return max;
}

function getCityOpacity(camDist, rank) {
  const band = CITY_RANK_THRESHOLDS.find((t) => rank <= t.maxRank);
  if (!band || camDist >= band.showBelow) return 0;
  return 1;
}

const WEATHER_RADIUS = RADIUS + 0.004;

const RAINVIEWER_API = import.meta.env.DEV
  ? 'https://api.rainviewer.com/public/weather-maps.json'
  : 'https://flightmap.cfod.co.uk/rainviewer/public/weather-maps.json';

function useRainViewerUrl() {
  const [tileUrl, setTileUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchLatest() {
      try {
        console.log('[weather] fetching api', RAINVIEWER_API);
        const res = await fetch(RAINVIEWER_API);
        const data = await res.json();
        console.log('[weather] api ok, host:', data.host, 'past frames:', data.radar?.past?.length);
        const latest = data.radar?.past?.at(-1);
        if (!cancelled && latest) {
          const path = `${latest.path}/256/{z}/{x}/{y}/2/1_1.png`;
          const url = import.meta.env.DEV
            ? `${data.host}${path}`
            : `https://flightmap.cfod.co.uk/rainviewer-tiles${path}`;
          console.log('[weather] tile url template:', url);
          setTileUrl(url);
        }
      } catch (e) {
        console.log('[weather] api error', e);
      }
    }
    fetchLatest();
    const interval = setInterval(fetchLatest, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return tileUrl;
}

async function fetchTileAsBlob(url) {
  try {
    console.log('[weather] fetching tile', url);
    const res = await fetch(url);
    console.log('[weather] tile response', res.status, url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch (e) {
    console.log('[weather] tile error', e, url);
    return null;
  }
}

async function buildWeatherTexture(tileUrl, onReady) {
  const ZOOM = 4;
  const TILES = Math.pow(2, ZOOM);
  const TILE_PX = 256;
  const SIZE = TILES * TILE_PX;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  const tasks = [];
  for (let x = 0; x < TILES; x++) {
    for (let y = 0; y < TILES; y++) {
      const url = tileUrl.replace('{z}', ZOOM).replace('{x}', x).replace('{y}', y);
      tasks.push({ x, y, url });
    }
  }

  await Promise.all(tasks.map(async ({ x, y, url }) => {
    const blobUrl = await fetchTileAsBlob(url);
    if (!blobUrl) return;
    await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX); URL.revokeObjectURL(blobUrl); resolve(); };
      img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(); };
      img.src = blobUrl;
    });
  }));

  onReady(canvas);
}

function WeatherOverlay({ tileUrl }) {
  const [texture, setTexture] = useState(null);
  const prevUrl = useRef(null);

  useEffect(() => {
    if (!tileUrl || tileUrl === prevUrl.current) return;
    prevUrl.current = tileUrl;
    buildWeatherTexture(tileUrl, (canvas) => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      setTexture(tex);
    });
  }, [tileUrl]);

  if (!texture) return null;

  return (
    <mesh>
      <sphereGeometry args={[WEATHER_RADIUS, 128, 128]} />
      <meshBasicMaterial map={texture} transparent opacity={0.6} depthWrite={false} side={THREE.FrontSide} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

function EarthMesh({ flights, onFlightClick, geojson, geojson110m, geojson10m, cities, controllers, boundaries, rotating, showAtc, showWeather, weatherTileUrl, showTrail, showRoute }) {
  const meshRef = useRef();
  const { gl } = useThree();
  const maxTexSize = gl.capabilities.maxTextureSize;
  const earthTexture = maxTexSize >= 16384 ? EARTH_TEXTURE_16K : maxTexSize >= 8192 ? EARTH_TEXTURE_8K : EARTH_TEXTURE_4K;
  const [colorMap, bumpMap] = useLoader(TextureLoader, [earthTexture, BUMP_TEXTURE]);

  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.anisotropy = Math.min(16, gl.capabilities.getMaxAnisotropy());
  bumpMap.anisotropy = Math.min(16, gl.capabilities.getMaxAnisotropy());

  useFrame((_, delta) => {
    if (meshRef.current && rotating) meshRef.current.rotation.y += delta * 0.05;
  });

  const camDist = useContext(CamDistContext);
  const labelOpacity = getLabelOpacity(camDist);

  // Use 10m only when zoomed in and loaded, otherwise 110m, fallback to base
  const activeBorderGeojson = (camDist < BORDER_HIGH_THRESHOLD && geojson10m)
    ? geojson10m
    : geojson110m ?? geojson;

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
      {showWeather && <WeatherOverlay tileUrl={weatherTileUrl} />}
      {showAtc && controllers.length > 0 && <AtcOverlay controllers={controllers} boundaries={boundaries} />}
      <Suspense fallback={null}>
        {flights.map((flight) => (
          <group key={flight.discordId}>
            {(flight.waypoints?.length >= 2 || flight.trail?.length >= 2) && <FlightRoute flight={flight} showTrail={showTrail} showRoute={showRoute} />}
            <FlightMarker flight={flight} onClick={onFlightClick} />
          </group>
        ))}
      </Suspense>
    </group>
  );
}

// Model native axes: nose=+X, up=+Z, left-wing=+Y
// Surface frame: east=+X, north=+Y, normal=+Z
// We need: model nose (+X) → north (+Y), model up (+Z) → normal (+Z), model left-wing (+Y) → west (-X)

function FlightMarker({ flight, onClick }) {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef();
  const camDist = useContext(CamDistContext);
  const scale = (camDist / 5) * (hovered ? 0.000055 : 0.000045) * 0.01;

  const { scene } = useGLTF('/models/a380-fixed.glb');
  const cloned = useMemo(() => scene.clone(true), [scene]);

  // Imperatively update position + quaternion so the primitive always reflects latest flight data
  useFrame(() => {
    if (!groupRef.current) return;
    const lift = altToLift(flight.altitude);
    const pos = latLngToVec3(flight.lat, flight.lon, RADIUS + lift + 0.001);
    groupRef.current.position.copy(pos);

    const normal = pos.clone().normalize();

    // Build an explicit surface frame: north and east tangent vectors
    const worldNorth = new THREE.Vector3(0, 1, 0);
    const north = worldNorth.clone().addScaledVector(normal, -worldNorth.dot(normal)).normalize();
    const east  = new THREE.Vector3().crossVectors(normal, north).normalize();

    // Heading 0=north, 90=east (aviation convention), clockwise
    const headingRad = ((flight.heading ?? 0) * Math.PI) / 180;
    const forward = north.clone().multiplyScalar(Math.cos(headingRad))
                         .addScaledVector(east, Math.sin(headingRad));

    // Orient group: +Y = surface normal (up), -Z = forward direction
    groupRef.current.up.copy(normal);
    groupRef.current.lookAt(pos.clone().add(forward));
  });

  return (
    <group
      ref={groupRef}
      scale={[scale, scale, scale]}
      onClick={(e) => { e.stopPropagation(); onClick(flight, e.nativeEvent ?? e); }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <primitive object={cloned} />
    </group>
  );
}

useGLTF.preload('/models/a380-fixed.glb');

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

const BORDER_HIGH_THRESHOLD = 3.2;

const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

function ToggleButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 8,
        color: active ? '#e8edf5' : '#4a5568',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        padding: '5px 10px',
        cursor: 'pointer',
        fontFamily: 'Inter, system-ui, sans-serif',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
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
  const [showAtc, setShowAtc] = useState(true);
  const [showWeather, setShowWeather] = useState(false);
  const [showTrail, setShowTrail] = useState(true);
  const [showRoute, setShowRoute] = useState(true);
  const weatherTileUrl = useRainViewerUrl();

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

  // Lazy-load 10m borders + cities only when the user zooms in
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
      fetch('/cities.json')
        .then((r) => r.json())
        .then((data) => {
          const parsed = data.map((c) => ({
            name: c.n,
            scalerank: c.r,
            lat: c.la,
            lng: c.lo,
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
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        style={{ width: '100%', height: '100%' }}
        gl={{ antialias: true, alpha: true }}
        onPointerDown={() => setRotating(false)}
        onWheel={() => setRotating(false)}
      >
        <CamDistContext.Provider value={camDist}>
          <ambientLight intensity={3.5} />
          <pointLight position={[10, 10, 10]} intensity={2.5} />
          <Suspense fallback={null}>
            <EarthMesh flights={flights} onFlightClick={onFlightClick} geojson={geojson} geojson110m={geojson110m} geojson10m={geojson10m} cities={cities} controllers={controllers} boundaries={boundaries} rotating={rotating} showAtc={showAtc} showWeather={showWeather} weatherTileUrl={weatherTileUrl} showTrail={showTrail} showRoute={showRoute} />
          </Suspense>
          <CameraTracker onUpdate={setCamDist} />
          <OrbitControls
            enableZoom={true}
            enablePan={false}
            minDistance={2.5}
            maxDistance={8}
            autoRotate={false}
            rotateSpeed={isTouchDevice ? 0.25 : 0.75}
            zoomSpeed={isTouchDevice ? 0.3 : 1.0}
            dampingFactor={0.08}
            enableDamping={true}
            makeDefault
          />
        </CamDistContext.Provider>
      </Canvas>
      <div style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        display: 'flex',
        gap: 8,
        zIndex: 50,
        background: 'rgba(8, 12, 24, 0.75)',
        backdropFilter: 'blur(8px)',
        borderRadius: 10,
        padding: '6px 8px',
        border: '1px solid rgba(255,255,255,0.07)',
      }}>
        <ToggleButton label="ATC" active={showAtc} onClick={() => setShowAtc((v) => !v)} />
        <ToggleButton label="Weather" active={showWeather} onClick={() => setShowWeather((v) => !v)} />
        <ToggleButton label="Trail" active={showTrail} onClick={() => setShowTrail((v) => !v)} />
        <ToggleButton label="Route" active={showRoute} onClick={() => setShowRoute((v) => !v)} />
      </div>
    </div>
  );
}
