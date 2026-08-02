import * as THREE from 'three';
import { DEFAULT_FACTORY_CONFIG, FACTORY_PRESETS } from '../gen/config';
import { generateFactory } from '../gen/building';
import type { FactoryArchetype, FactoryRoof } from '../gen/types';
import { disposeFactory, renderFactory } from './render';

describe('renderFactory', () => {
  it('builds finite detailed geometry for every archetype and roof', () => {
    const archetypes = Object.keys(FACTORY_PRESETS) as FactoryArchetype[];
    const roofs: FactoryRoof[] = ['gable', 'mono', 'sawtooth', 'flat'];
    for (const archetype of archetypes) for (const roof of roofs) {
      const cfg = { ...DEFAULT_FACTORY_CONFIG, ...FACTORY_PRESETS[archetype], archetype, roof };
      const group = renderFactory(generateFactory(cfg));
      let meshes = 0;
      group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        meshes++;
        const position = mesh.geometry.getAttribute('position');
        for (let i = 0; i < position.count; i++) {
          expect(Number.isFinite(position.getX(i))).toBe(true);
          expect(Number.isFinite(position.getY(i))).toBe(true);
          expect(Number.isFinite(position.getZ(i))).toBe(true);
        }
      });
      expect(meshes).toBeGreaterThan(80);
      disposeFactory(group);
    }
  });
});
