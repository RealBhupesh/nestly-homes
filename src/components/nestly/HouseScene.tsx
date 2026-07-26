import { Canvas, useFrame } from "@react-three/fiber";
import { Float, ContactShadows, Environment } from "@react-three/drei";
import { useRef, Suspense } from "react";
import type { Group } from "three";

function House() {
  const g = useRef<Group>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.35;
  });
  return (
    <group ref={g} position={[0, -0.4, 0]}>
      {/* walls */}
      <mesh castShadow receiveShadow position={[0, 0.6, 0]}>
        <boxGeometry args={[2.2, 1.2, 1.8]} />
        <meshStandardMaterial color="#f7f2ea" roughness={0.85} />
      </mesh>
      {/* roof */}
      <mesh castShadow position={[0, 1.55, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[1.8, 0.9, 4]} />
        <meshStandardMaterial color="#7e22ce" roughness={0.55} />
      </mesh>
      {/* door */}
      <mesh position={[0, 0.35, 0.91]}>
        <planeGeometry args={[0.45, 0.75]} />
        <meshStandardMaterial color="#1d1d28" />
      </mesh>
      {/* windows */}
      <mesh position={[-0.7, 0.7, 0.91]}>
        <planeGeometry args={[0.4, 0.35]} />
        <meshStandardMaterial color="#ffb13c" emissive="#ffb13c" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0.7, 0.7, 0.91]}>
        <planeGeometry args={[0.4, 0.35]} />
        <meshStandardMaterial color="#ffb13c" emissive="#ffb13c" emissiveIntensity={0.5} />
      </mesh>
      {/* chimney */}
      <mesh position={[0.6, 1.9, 0]}>
        <boxGeometry args={[0.25, 0.6, 0.25]} />
        <meshStandardMaterial color="#e94560" roughness={0.7} />
      </mesh>
      {/* trees */}
      <Tree position={[-1.9, 0, 0.6]} scale={0.9} />
      <Tree position={[1.8, 0, -0.7]} scale={1.1} />
      <Tree position={[-1.3, 0, -1.2]} scale={0.7} />
    </group>
  );
}

function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 0.5, 8]} />
        <meshStandardMaterial color="#6b4423" />
      </mesh>
      <mesh position={[0, 0.75, 0]}>
        <coneGeometry args={[0.35, 0.9, 12]} />
        <meshStandardMaterial color="#0fb8a4" roughness={0.7} />
      </mesh>
    </group>
  );
}

export default function HouseScene() {
  return (
    <Canvas
      shadows
      camera={{ position: [3.5, 2.6, 4.2], fov: 40 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={["#eeeeee"]} />
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[5, 6, 3]}
        intensity={1.4}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <Suspense fallback={null}>
        <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.35}>
          <House />
        </Float>
        <ContactShadows position={[0, -0.42, 0]} opacity={0.35} scale={8} blur={2.4} far={3} />
        <Environment preset="city" />
      </Suspense>
    </Canvas>
  );
}