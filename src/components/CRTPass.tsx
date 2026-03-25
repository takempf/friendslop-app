import { useMemo } from 'react'
import { EffectComposer } from '@react-three/postprocessing'
import { wrapEffect } from '@react-three/postprocessing'
import { CRTEffect } from '../effects/CRTEffect'

const CRT = wrapEffect(CRTEffect)

export function CRTPass() {
  // wrapEffect creates a new React component; CRTEffect is instantiated once
  const props = useMemo(() => ({}), [])
  return (
    <EffectComposer>
      <CRT {...props} />
    </EffectComposer>
  )
}
