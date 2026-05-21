import { useRef, useState, Suspense } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { TextureLoader } from 'three';

const EARTH_TEXTURE = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg';
const BUMP_TEXTURE = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-topology.png';
const RADIUS = 2;

function latLngToVec3(lat, lng, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function Atmosphere() {
  return (
    <mesh>
      <sphereGeometry args={[RADIUS * 1.02, 64, 64]} />
      <shaderMaterial
        side={THREE.BackSide}
        transparent
        uniforms={{
          glowColor: { value: new THREE.Color(0x3399ff) },
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
          uniform vec3 glowColor;
          uniform float intensity;
          void main() {
            float rim = 1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0));
            gl_FragColor = vec4(glowColor, pow(rim, 3.0) * intensity * 0.6);
          }
        `}
      />
    </mesh>
  );
}

function EarthMesh({ flights, onFlightClick }) {
  const meshRef = useRef();
  const [colorMap, bumpMap] = useLoader(TextureLoader, [EARTH_TEXTURE, BUMP_TEXTURE]);

  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.05;
  });

  return (
    <group ref={meshRef}>
      <mesh>
        <sphereGeometry args={[RADIUS, 64, 64]} />
        <meshStandardMaterial map={colorMap} bumpMap={bumpMap} bumpScale={0.02} roughness={0.8} metalness={0} />
      </mesh>
      <Atmosphere />
      {flights.map((flight) => (
        <FlightMarker
          key={flight.discordId}
          flight={flight}
          earthRef={meshRef}
          onClick={onFlightClick}
        />
      ))}
    </group>
  );
}

function FlightMarker({ flight, earthRef, onClick }) {
  const [hovered, setHovered] = useState(false);
  const pos = latLngToVec3(flight.lat, flight.lon, RADIUS + 0.04);
  const color = flight.color ?? '#f0cb00';

  return (
    <mesh
      position={pos}
      onClick={(e) => { e.stopPropagation(); onClick(flight, e.nativeEvent ?? e); }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <sphereGeometry args={[hovered ? 0.04 : 0.03, 8, 8]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

function GlobeLoader() {
  return null;
}

export function Globe({ flights, onFlightClick }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 45 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={2.5} />
      <pointLight position={[10, 10, 10]} intensity={2.0} />
      <pointLight position={[-10, -10, -10]} intensity={1.0} />
      <Suspense fallback={<GlobeLoader />}>
        <EarthMesh flights={flights} onFlightClick={onFlightClick} />
      </Suspense>
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
    </Canvas>
  );
}
